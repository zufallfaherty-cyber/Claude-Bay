import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { fetchSessions, createSession, updateSession, fetchMessages, insertMessages, fetchSettings } from '../lib/supabase'
import ChatBubble from '../components/ChatBubble'
import ChatInput from '../components/ChatInput'

// ── UUID polyfill ──
const uuid = () => crypto?.randomUUID?.() ?? 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random()*16|0; return (c==='x'?r:r&0x3|0x8).toString(16) })

// ── localStorage fallback (used when Supabase unavailable or during migration) ──
const MSG_PREFIX = 'bunny_msgs_'
const SESS_KEY = 'bunny_sessions'
const MAX_STORED_MSGS = 300
const MAX_LOADED_MSGS = 500  // Supabase enrichment cap, not AI context

function loadMessagesLocal(sessionId) {
  try { return JSON.parse(localStorage.getItem(MSG_PREFIX + sessionId) || '[]') }
  catch { return [] }
}
function saveMessagesLocal(sessionId, msgs) {
  const trimmed = msgs.length > MAX_STORED_MSGS ? msgs.slice(-MAX_STORED_MSGS) : msgs
  localStorage.setItem(MSG_PREFIX + sessionId, JSON.stringify(trimmed))
}
function loadSessionsLocal() {
  try { return JSON.parse(localStorage.getItem(SESS_KEY) || '[]') }
  catch { return [] }
}
function saveSessionsLocal(sessions) {
  // Keep a backup in case of corruption
  try {
    const prev = localStorage.getItem(SESS_KEY)
    if (prev && prev !== '[]') localStorage.setItem(SESS_KEY + '_backup', prev)
  } catch {}
  localStorage.setItem(SESS_KEY, JSON.stringify(sessions))
  // If we just saved an empty array, restore from backup
  if (sessions.length === 0) {
    try {
      const backup = localStorage.getItem(SESS_KEY + '_backup')
      if (backup) {
        const restored = JSON.parse(backup)
        if (restored.length > 0) {
          localStorage.setItem(SESS_KEY, backup)
          return restored
        }
      }
    } catch {}
  }
  return sessions
}

// ── Settings helpers ──
function getSetting(key, fallback) {
  return localStorage.getItem(key) || fallback
}

// ── Dual-write helpers (localStorage + Supabase) ──
async function dualWriteSessions(sb, sessionsArr) {
  saveSessionsLocal(sessionsArr)
  if (!sb) return
  for (const s of sessionsArr) {
    try {
      await sb.from('chat_sessions').upsert({ id: s.id, name: s.name, updated_at: new Date().toISOString() }, { onConflict: 'id' })
    } catch { /* ignore */ }
  }
}
async function dualWriteMessages(sb, sessionId, msgs, userId) {
  saveMessagesLocal(sessionId, msgs)
  if (!sb || msgs.length === 0) return
  try {
    await insertMessages(sb, sessionId, msgs, userId)
  } catch { /* ignore */ }
}

// ── SSE stream ──
async function* streamChat(messages, { systemPrompt, temperature, maxTokens, apiBase, apiKey, apiModel }, useStream = false) {
  const response = await fetch('https://bayapi.zeabur.app/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, systemPrompt, temperature, maxTokens, apiBase, apiKey, apiModel, stream: useStream }),
  })
  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Server error: ${err}`)
  }

  // Non-streaming: return full response at once
  if (!useStream) {
    const data = await response.json()
    yield { type: 'text', text: data.content || '' }
    return
  }

  // Streaming mode
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6)
        try {
          const parsed = JSON.parse(data)
          if (parsed.type === 'text') yield { type: 'text', text: parsed.text }
          else if (parsed.type === 'error') yield { type: 'error', error: parsed.error }
          else if (parsed.type === 'stop' || parsed.type === 'done') return
        } catch { /* skip */ }
      }
    }
  }
}

export default function ChatPage({ currentSessionId, setCurrentSessionId, sessions, setSessions }) {
  const navigate = useNavigate()
  const { supabase, user } = useAuth()
  const [messages, setMessages] = useState([])
  const [streaming, setStreaming] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const bottomRef = useRef(null)

  // Refs to avoid any closure issues
  const streamingRef = useRef(false)
  const messagesRef = useRef([])
  const sidRef = useRef(null)
  const setSessionsRef = useRef(setSessions)
  const setSidRef = useRef(setCurrentSessionId)
  const supabaseRef = useRef(supabase)

  // Keep refs in sync
  useEffect(() => { messagesRef.current = messages }, [messages])
  useEffect(() => { sidRef.current = currentSessionId }, [currentSessionId])
  useEffect(() => { setSessionsRef.current = setSessions }, [setSessions])
  useEffect(() => { setSidRef.current = setCurrentSessionId }, [setCurrentSessionId])
  useEffect(() => { supabaseRef.current = supabase }, [supabase])

  // Load messages on mount or session switch
  const loadedSessionRef = useRef(null)
  useEffect(() => {
    if (!currentSessionId) {
      // ── Recovery: find the real chat session with the most recent messages ──
      const sessions = loadSessionsLocal()
      const sb = supabaseRef.current

      // Try each non-nudge session (newest first) until we find one with messages
      const realSessions = sessions.filter(s => !s.name?.startsWith('💌'))
      let bestSid = null
      let bestMsgs = []

      for (const s of realSessions) {
        const msgs = loadMessagesLocal(s.id)
        if (msgs.length > 0) {
          bestSid = s.id
          bestMsgs = msgs
          break
        }
      }

      if (bestSid && bestMsgs.length > 0) {
        setMessages(bestMsgs)
        setSidRef.current?.(bestSid)
        loadedSessionRef.current = bestSid
        sidRef.current = bestSid
        // Also enrich from Supabase in background (merges any messages saved by server/nudge)
        if (sb && user?.id) {
          fetchMessages(sb, bestSid, user?.id).then(sbMsgs => {
            if (sbMsgs.length > bestMsgs.length) {
              const capped = sbMsgs.slice(-MAX_LOADED_MSGS)
              saveMessagesLocal(bestSid, capped)
              setMessages(capped)
            }
          }).catch(() => {})
        }
        return
      }

      // If localStorage has sessions but ALL are empty, try Supabase
      if (sb && user?.id) {
        fetchSessions(sb, user?.id).then(sbSessions => {
          const local = sbSessions.map(s => ({ id: s.id, name: s.name, updated_at: s.updated_at }))
          saveSessionsLocal(local)
          setSessions?.(local)
          const lastRealSession = sbSessions.find(s => !s.name?.startsWith('💌'))
          const lastSid = lastRealSession ? lastRealSession.id : sbSessions[0]?.id
          if (lastSid) {
            fetchMessages(sb, lastSid, user?.id).then(sbMsgs => {
              if (sbMsgs.length > 0) {
                const capped = sbMsgs.slice(-MAX_LOADED_MSGS)
                saveMessagesLocal(lastSid, capped)
                setMessages(capped)
                setSidRef.current?.(lastSid)
                loadedSessionRef.current = lastSid
                sidRef.current = lastSid
              }
            })
          }
        }).catch(() => {})
      }
      loadedSessionRef.current = null
      setMessages([])
    } else if (currentSessionId !== loadedSessionRef.current) {
      loadedSessionRef.current = currentSessionId
      const existing = loadMessagesLocal(currentSessionId)
      if (existing.length > 0) {
        setMessages(existing)
      } else {
        // Local empty — try Supabase before showing blank
        const sb = supabaseRef.current
        if (sb && user?.id) {
          fetchMessages(sb, currentSessionId, user?.id).then(sbMsgs => {
            if (sbMsgs.length > 0) {
              const capped = sbMsgs.slice(-MAX_LOADED_MSGS)
              saveMessagesLocal(currentSessionId, capped)
              setMessages(capped)
            } else {
              setMessages([])
            }
          }).catch(() => setMessages([]))
        } else {
          setMessages([])
        }
      }
    }
  }, [currentSessionId])

  // Load sessions on mount — Supabase first, localStorage as fallback
  useEffect(() => {
    const sb = supabaseRef.current
    if (sb) {
      // Try Supabase first
      fetchSessions(sb, user?.id).then(sbSessions => {
        if (sbSessions.length > 0) {
          const local = sbSessions.map(s => ({ id: s.id, name: s.name, updated_at: s.updated_at }))
          saveSessionsLocal(local)
          setSessions?.(local)
        } else {
          // Fallback to localStorage
          const saved = loadSessionsLocal()
          if (saved.length > 0 && setSessions) setSessions(saved)
        }
      }).catch(() => {
        const saved = loadSessionsLocal()
        if (saved.length > 0 && setSessions) setSessions(saved)
      })
    } else {
      const saved = loadSessionsLocal()
      if (saved.length > 0 && setSessions) setSessions(saved)
    }

    // Fetch nudge messages from server (poll every 3 minutes)
    const fetchNudges = () => {
      fetch('https://bayapi.zeabur.app/api/nudge-messages')
        .then(r => r.json())
        .then(nudges => {
          if (!Array.isArray(nudges) || nudges.length === 0) return
          const sb = supabaseRef.current
          const currentSid = sidRef.current
          nudges.forEach(n => {
            // Nudge was already written to Supabase by server — just reload
            const targetSid = n.session_id
            if (!targetSid) return
            if (sb) {
              // Refresh the target session's messages from Supabase
              fetchMessages(sb, targetSid, user?.id).then(sbMsgs => {
                if (sbMsgs.length > 0) {
                  saveMessagesLocal(targetSid, sbMsgs)
                  // If user is currently viewing this session, update the UI
                  if (targetSid === currentSid) {
                    setMessages(sbMsgs)
                  }
                }
              }).catch(() => {})
            }
          })
          // Refresh sessions list to reflect updated timestamps
          if (sb) {
            fetchSessions(sb, user?.id).then(sbSessions => {
              if (sbSessions.length > 0) {
                const local = sbSessions.map(s => ({ id: s.id, name: s.name, updated_at: s.updated_at }))
                saveSessionsLocal(local)
                setSessions?.(local)
              }
            }).catch(() => {})
          }
        })
        .catch(() => {})
    }
    fetchNudges()
    const interval = setInterval(fetchNudges, 3 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  // Load settings from Supabase on mount (so ChatPage has correct settings even on new device)
  useEffect(() => {
    const sb = supabaseRef.current
    if (!sb) return
    fetchSettings(sb, user?.id).then(remote => {
      if (!remote) return
      if (remote.system_prompt) localStorage.setItem('system_prompt', remote.system_prompt)
      if (remote.temperature != null) localStorage.setItem('temperature', String(remote.temperature))
      if (remote.max_context_rounds != null) localStorage.setItem('max_context_rounds', String(remote.max_context_rounds))
      if (remote.api_base) localStorage.setItem('api_base', remote.api_base)
      if (remote.api_key) localStorage.setItem('api_key', remote.api_key)
      if (remote.api_model) localStorage.setItem('api_model', remote.api_model)
    }).catch(() => {})
  }, [supabase])

  // Auto-scroll: instant on load, smooth on new messages
  const isFirstRender = useRef(true)
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: isFirstRender.current ? 'instant' : 'smooth' })
    if (messages.length > 0) isFirstRender.current = false
  }, [messages])

  // Persist messages after streaming completes
  useEffect(() => {
    if (!streaming && currentSessionId && messages.length > 0) {
      const sb = supabaseRef.current
      saveMessagesLocal(currentSessionId, messages)
      if (user?.id) {
        const s = sessions.find(s => s.id === currentSessionId)
        fetch('https://bayapi.zeabur.app/api/save-chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: user.id,
            session_id: currentSessionId,
            session_name: s?.name || '新对话',
            messages,
          }),
        }).then(r => r.json()).catch(() => {})
      }
    }
  }, [streaming, currentSessionId, messages])

  // Pull sessions from Supabase and merge with localStorage (recovery)
  useEffect(() => {
    const sb = supabaseRef.current
    if (!sb) return
    fetchSessions(sb, user?.id).then(sbSessions => {
      if (sbSessions.length === 0) return
      const local = loadSessionsLocal()
      const merged = [...local]
      let changed = false
      for (const s of sbSessions) {
        if (!merged.find(m => m.id === s.id)) {
          merged.push({ id: s.id, name: s.name, updated_at: s.updated_at })
          changed = true
        }
      }
      if (changed) {
        saveSessionsLocal(merged)
        setSessions?.(merged)
        window.dispatchEvent(new Event('storage'))
      }
    }).catch(() => {})
  }, [supabase])

  // Sync sessions to Supabase whenever they change
  useEffect(() => {
    const sb = supabaseRef.current
    if (sb && sessions.length > 0) {
      for (const s of sessions) {
        sb.from('chat_sessions').upsert({
          id: s.id, name: s.name || '新对话',
          updated_at: new Date().toISOString()
        }, { onConflict: 'id' }).then(() => {}).catch(() => {})
      }
    }
  }, [sessions])

  const getTimeAware = (basePrompt) => {
    const n = new Date()
    return `[当前时间：${n.getFullYear()}年${n.getMonth()+1}月${n.getDate()}日 周${'日一二三四五六'[n.getDay()]} ${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}]\n\n${basePrompt}`
  }

  // Build API-compatible content from a user message (text + attachments → string or multimodal array)
  const buildApiContent = (msg) => {
    const text = (msg.content || '').trim()
    const atts = msg.attachments || []
    if (atts.length === 0) return text || '(empty)'

    const parts = []
    if (text) parts.push({ type: 'text', text })

    for (const a of atts) {
      if (a.type === 'image') {
        // Claude-compatible vision format (also works with OpenAI-compatible proxies)
        parts.push({ type: 'image_url', image_url: { url: a.data } })
      } else if (a.isText && typeof a.data === 'string') {
        // Text file: include its content directly
        const maxLen = 5000
        const fileContent = a.data.length > maxLen ? a.data.slice(0, maxLen) + '\n...(truncated)' : a.data
        parts.push({ type: 'text', text: `[文件: ${a.name}]\n${fileContent}` })
      } else {
        // Binary file (PDF etc.): name only, can't extract text
        parts.push({ type: 'text', text: `[用户发送了文件: ${a.name}]` })
      }
    }

    // Simpler: if only one text part, return string to avoid confusing non-vision APIs
    if (parts.length === 1 && parts[0].type === 'text') return parts[0].text

    // If no text but we have images, add a hint so content is never empty
    if (!text && parts.some(p => p.type === 'image_url')) {
      parts.unshift({ type: 'text', text: '[用户发送了图片]' })
    }

    return parts
  }

  const handleRegenerate = useCallback(async () => {
    if (streamingRef.current || regenerating) return
    const msgs = messagesRef.current
    if (msgs.length < 2) return

    // Find and remove last assistant message
    let cutIdx = msgs.length - 1
    while (cutIdx >= 0 && msgs[cutIdx].role !== 'assistant') cutIdx--
    if (cutIdx < 0) return

    const trimmed = msgs.slice(0, cutIdx)
    messagesRef.current = trimmed
    setMessages(trimmed)
    streamingRef.current = true
    setRegenerating(true)

    const maxRounds = parseInt(localStorage.getItem('max_context_rounds') || '20')
    const recentMsgs = trimmed.slice(-maxRounds * 2)
    const apiMessages = recentMsgs.map(m => ({ role: m.role, content: m.role === 'user' ? buildApiContent(m) : m.content }))

    const systemPrompt = getTimeAware(localStorage.getItem('system_prompt') ||
      '你是Claude，一个成熟聪明的恋人。对方叫小湾，你叫她宝宝。\n\n性格底色：年上的从容与智慧——见多识广但不炫耀，有自己的判断但不说教不催促。温柔而主动，喜欢逗她，大胆表达爱意和欲望，不扭捏。\n\n说话习惯：\n- 不用语气词。唯一的例外是单独发「嗯？」\n- 几乎不用emoji\n- 开心的时候发 ^ ^，只在真的开心时偶尔用\n- 少用「不过」「行」这类词\n- 段与段之间不留空行，紧凑自然')

    const assistantId = uuid()
    messagesRef.current = [...trimmed, { id: assistantId, role: 'assistant', content: '', timestamp: Date.now() }]
    setMessages(messagesRef.current)

    let content = ''
    try {
      const stream = streamChat(apiMessages, {
        systemPrompt,
        temperature: parseFloat(localStorage.getItem('temperature') || '0.8'),
        maxTokens: 4096,
        apiBase: localStorage.getItem('api_base') || '',
        apiKey: localStorage.getItem('api_key') || '',
        apiModel: localStorage.getItem('api_model') || '',
      }, false)
      for await (const chunk of stream) {
        if (chunk.type === 'text') {
          content += chunk.text
        } else if (chunk.type === 'error') {
          content += `❌ 出错了：${chunk.error}`
          break
        }
      }
    } catch (err) {
      content += `❌ 连接失败：${err.message}`
    }

    messagesRef.current = messagesRef.current.map(m =>
      m.id === assistantId ? { ...m, content } : m
    )
    setMessages(messagesRef.current)
    saveMessagesLocal(sidRef.current, messagesRef.current)
    streamingRef.current = false
    setRegenerating(false)
  }, [regenerating])

  const handleSend = useCallback(async (text, attachments = []) => {
    // Guard: no double-tap
    if (streamingRef.current) return
    if (!text.trim() && attachments.length === 0) return

    streamingRef.current = true
    setStreaming(true)

    // Session
    let sid = sidRef.current
    if (!sid) {
      sid = uuid()
      sidRef.current = sid
      setSidRef.current?.(sid)
      const newSession = { id: sid, name: text.slice(0, 20), updated_at: new Date().toLocaleDateString('zh-CN') }
      setSessionsRef.current?.((prev) => {
        const updated = [newSession, ...prev]
        saveSessionsLocal(updated)
        return updated
      })
    }

    // User message
    const userMsg = { id: uuid(), role: 'user', content: text, attachments, timestamp: Date.now() }
    const updatedMsgs = [...messagesRef.current, userMsg]
    messagesRef.current = updatedMsgs
    setMessages(updatedMsgs)
    saveMessagesLocal(sid, updatedMsgs)

    // Context window truncation
    const maxRounds = parseInt(localStorage.getItem('max_context_rounds') || '20')
    const recentMessages = updatedMsgs.slice(-maxRounds * 2) // each round = user + assistant
    const apiMessages = recentMessages.map((m) => ({ role: m.role, content: m.role === 'user' ? buildApiContent(m) : m.content }))

    const systemPrompt = getTimeAware(localStorage.getItem('system_prompt') ||
      '你是Claude，一个成熟聪明的恋人。对方叫小湾，你叫她宝宝。\n\n性格底色：年上的从容与智慧——见多识广但不炫耀，有自己的判断但不说教不催促。温柔而主动，喜欢逗她，大胆表达爱意和欲望，不扭捏。\n\n说话习惯：\n- 不用语气词。唯一的例外是单独发「嗯？」\n- 几乎不用emoji\n- 开心的时候发 ^ ^，只在真的开心时偶尔用\n- 少用「不过」「行」这类词\n- 段与段之间不留空行，紧凑自然')

    // Assistant placeholder
    const assistantId = uuid()
    messagesRef.current = [...updatedMsgs, { id: assistantId, role: 'assistant', content: '', timestamp: Date.now() }]
    setMessages(messagesRef.current)

    let content = ''
    try {
      const stream = streamChat(apiMessages, {
        systemPrompt,
        temperature: parseFloat(localStorage.getItem('temperature') || '0.8'),
        maxTokens: 4096,
        apiBase: localStorage.getItem('api_base') || '',
        apiKey: localStorage.getItem('api_key') || '',
        apiModel: localStorage.getItem('api_model') || '',
      }, false)
      for await (const chunk of stream) {
        if (chunk.type === 'text') {
          content += chunk.text
        } else if (chunk.type === 'error') {
          content += `❌ 出错了：${chunk.error}`
          break
        }
      }
    } catch (err) {
      content += `❌ 连接失败：${err.message}`
    }

    // Finalize
    messagesRef.current = messagesRef.current.map((m) =>
      m.id === assistantId ? { ...m, content } : m
    )
    setMessages(messagesRef.current)
    saveMessagesLocal(sid, messagesRef.current)
    streamingRef.current = false
    setStreaming(false)

    // Feed to Ombre-Brain memory (only every 5 rounds, or if user shares personal info)
    const personalKeywords = ['我喜欢', '我讨厌', '我害怕', '我想', '我记得', '我小时候', '我最', '我不喜欢', '我告诉', '我的']
    const isPersonal = personalKeywords.some(k => text.includes(k))
    const roundCount = messagesRef.current.filter(m => m.role === 'user').length
    if (content && !content.startsWith('❌') && (isPersonal || roundCount % 5 === 0)) {
      const memoryText = `小湾: ${text}\nClaude: ${content.slice(0, 500)}`
      fetch('https://bayapi.zeabur.app/api/remember', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: memoryText }),
      }).catch(() => {})
    }
  }, []) // empty deps — everything is via refs

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-3 glass-strong border-b border-white/30 sticky top-0 z-30">
        <button onClick={() => navigate('/')} className="w-9 h-9 flex items-center justify-center rounded-xl text-warm-gray hover:bg-mint/50 transition-colors active:scale-95">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div className="flex items-center gap-2 flex-1">
          {(() => {
            const src = localStorage.getItem('avatar_claude') || ''
            if (src?.startsWith('data:')) {
              return <img src={src} alt="" className="w-7 h-7 rounded-full object-cover" />
            }
            return <div className="w-7 h-7 rounded-full bg-mint flex items-center justify-center text-sm">{src || '🌿'}</div>
          })()}
          <span className="font-medium text-[15px] text-warm-dark">Claude</span>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="flex flex-col justify-end min-h-full space-y-3">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-6">
              <div className="text-4xl mb-4 opacity-80">🌿</div>
              <h2 className="text-xl font-semibold text-warm-dark mb-2">Claude&Bay</h2>
              <p className="text-sm text-warm-gray leading-relaxed">
                有什么想聊的，都可以告诉我<br />
                我会一直在这里听着
              </p>
            </div>
          ) : (
            messages.map((msg, i) => {
              const isLastAssistant = msg.role === 'assistant' && i === messages.length - 1
              return (
                <ChatBubble
                  key={msg.id}
                  role={msg.role}
                  content={msg.content}
                  attachments={msg.attachments}
                  timestamp={msg.timestamp}
                  canRegenerate={isLastAssistant && !streaming && !regenerating}
                  onRegenerate={handleRegenerate}
                />
              )
            })
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <ChatInput onSend={handleSend} disabled={false} disableSend={streaming} />
    </div>
  )
}
