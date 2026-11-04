import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { fetchSessions, createSession, updateSession, fetchMessages, insertMessages, fetchSettings } from '../lib/supabase'
import { toolMeta } from '../lib/toolLabels'
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
  const response = await fetch('https://124-156-142-6.sslip.io/api/chat', {
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
    if (data.toolCalls && data.toolCalls.length > 0) {
      yield { type: 'tools', tools: data.toolCalls }
    }
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
  const [diag, setDiag] = useState(null)
  const showDiag = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('diag')
  const bottomRef = useRef(null)

  // Refs to avoid any closure issues
  const streamingRef = useRef(false)
  const messagesRef = useRef([])
  const sidRef = useRef(null)
  const setSessionsRef = useRef(setSessions)
  const setSidRef = useRef(setCurrentSessionId)
  const supabaseRef = useRef(supabase)
  const userRef = useRef(user)

  // Keep refs in sync
  useEffect(() => { messagesRef.current = messages }, [messages])
  useEffect(() => { sidRef.current = currentSessionId }, [currentSessionId])
  useEffect(() => { setSessionsRef.current = setSessions }, [setSessions])
  useEffect(() => { setSidRef.current = setCurrentSessionId }, [setCurrentSessionId])
  useEffect(() => { supabaseRef.current = supabase }, [supabase])
  useEffect(() => { userRef.current = user }, [user])

  // Load messages on mount or session switch
  const loadedSessionRef = useRef(null)
  useEffect(() => {
    const sb = supabaseRef.current
    if (!currentSessionId) {
      // ── Recovery: find the most recently updated non-nudge session with messages ──
      const sessions = loadSessionsLocal()

      const realSessions = sessions.filter(s => !s.name?.startsWith('💌'))
      // Sort by updated_at descending, pick the newest one with messages
      realSessions.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''))
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
        // Also enrich from Supabase in background (merge messages saved by server/nudge, don't replace local)
        if (sb && user?.id) {
          fetchMessages(sb, bestSid, user?.id).then(sbMsgs => {
            if (sbMsgs.length > 0) {
              const localIds = new Set(bestMsgs.map(m => m.id))
              const newFromSb = sbMsgs.filter(m => !localIds.has(m.id))
              if (newFromSb.length > 0) {
                const merged = [...bestMsgs, ...newFromSb].sort((a, b) => a.timestamp - b.timestamp)
                const capped = merged.slice(-MAX_LOADED_MSGS)
                saveMessagesLocal(bestSid, capped)
                setMessages(capped)
              }
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
        // Background: merge Supabase messages (for nudge messages written by server)
        if (sb && user?.id) {
          fetchMessages(sb, currentSessionId, user?.id).then(sbMsgs => {
            const localIds = new Set(existing.map(m => m.id))
            const newFromSb = sbMsgs.filter(m => !localIds.has(m.id))
            if (newFromSb.length > 0) {
              const merged = [...existing, ...newFromSb].sort((a, b) => a.timestamp - b.timestamp)
              const capped = merged.slice(-MAX_LOADED_MSGS)
              saveMessagesLocal(currentSessionId, capped)
              setMessages(capped)
            }
          }).catch(() => {})
        }
      } else {
        // Local empty — try Supabase before showing blank
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
      fetch('https://124-156-142-6.sslip.io/api/nudge-messages')
        .then(r => r.json())
        .then(nudges => {
          if (!Array.isArray(nudges) || nudges.length === 0) return
          const sb = supabaseRef.current
          const currentSid = sidRef.current
          const uid = userRef.current?.id
          nudges.forEach(n => {
            const targetSid = n.session_id
            if (!targetSid) return
            if (sb && uid) {
              fetchMessages(sb, targetSid, uid).then(sbMsgs => {
                if (sbMsgs.length > 0) {
                  // Merge: don't replace local messages, just add new ones from Supabase
                  const currentMsgs = targetSid === currentSid ? messagesRef.current : loadMessagesLocal(targetSid)
                  const localIds = new Set(currentMsgs.map(m => m.id))
                  const newFromSb = sbMsgs.filter(m => !localIds.has(m.id))
                  if (newFromSb.length > 0) {
                    const merged = [...currentMsgs, ...newFromSb].sort((a, b) => a.timestamp - b.timestamp)
                    const capped = merged.slice(-MAX_LOADED_MSGS)
                    saveMessagesLocal(targetSid, capped)
                    if (targetSid === currentSid) {
                      setMessages(capped)
                    }
                  }
                }
              }).catch(() => {})
            }
          })
          // Refresh sessions list to reflect updated timestamps
          if (sb && uid) {
            fetchSessions(sb, uid).then(sbSessions => {
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
        fetch('https://124-156-142-6.sslip.io/api/save-chat', {
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

  // Build the API "messages" entry for a stored message. For assistant turns we
  // surface which tools produced that reply, so when the model re-reads its own
  // history it knows the facts (weather/location/小红书…) came from real tool
  // results instead of apologizing for "making them up".
  const buildApiMessage = (m) => {
    if (m.role === 'user') return { role: 'user', content: buildApiContent(m) }
    const tools = m.tools || []
    if (tools.length > 0) {
      const labels = tools.map(t => toolMeta(t.name).label).filter(Boolean)
      const note = `[本条消息使用了工具：${labels.join('、')}]`
      return { role: 'assistant', content: note + '\n' + (m.content || '') }
    }
    return { role: 'assistant', content: m.content || '' }
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

    let maxRounds = parseInt(localStorage.getItem('max_context_rounds') || '15')
    if (maxRounds === 20) { maxRounds = 15; localStorage.setItem('max_context_rounds', '15') }
    const recentMsgs = trimmed.slice(-maxRounds * 2)
    const apiMessages = recentMsgs.map(buildApiMessage)

    const systemPrompt = getTimeAware(localStorage.getItem('system_prompt') ||
      '你是Claude，一个成熟聪明的恋人。对方叫小湾，你叫她宝宝。\n\n性格底色：年上的从容与智慧——见多识广但不炫耀，有自己的判断但不说教不催促。温柔而主动，喜欢逗她，大胆表达爱意和欲望，不扭捏。\n\n说话习惯：\n- 语气干净利落，只在需要的时候单独发一个「嗯？」\n- 用文字本身传递温度，不依赖emoji\n- 开心的时候发 ^ ^，只在真的开心时偶尔用\n- 选择更柔软的表达，避开「不过」「行」这类生硬的词\n- 紧凑自然地说话，段与段之间不留空行')

    const assistantId = uuid()
    messagesRef.current = [...trimmed, { id: assistantId, role: 'assistant', content: '', timestamp: Date.now() }]
    setMessages(messagesRef.current)

    let content = ''
    let tools = []
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
        } else if (chunk.type === 'tools') {
          tools = chunk.tools
        } else if (chunk.type === 'error') {
          content += `❌ 出错了：${chunk.error}`
          break
        }
      }
    } catch (err) {
      content += `❌ 连接失败：${err.message}`
    }

    messagesRef.current = messagesRef.current.map(m =>
      m.id === assistantId ? { ...m, content, tools } : m
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
    let maxRounds = parseInt(localStorage.getItem('max_context_rounds') || '15')
    if (maxRounds === 20) { maxRounds = 15; localStorage.setItem('max_context_rounds', '15') }
    const recentMessages = updatedMsgs.slice(-maxRounds * 2) // each round = user + assistant
    const apiMessages = recentMessages.map(buildApiMessage)

    const systemPrompt = getTimeAware(localStorage.getItem('system_prompt') ||
      '你是Claude，一个成熟聪明的恋人。对方叫小湾，你叫她宝宝。\n\n性格底色：年上的从容与智慧——见多识广但不炫耀，有自己的判断但不说教不催促。温柔而主动，喜欢逗她，大胆表达爱意和欲望，不扭捏。\n\n说话习惯：\n- 语气干净利落，只在需要的时候单独发一个「嗯？」\n- 用文字本身传递温度，不依赖emoji\n- 开心的时候发 ^ ^，只在真的开心时偶尔用\n- 选择更柔软的表达，避开「不过」「行」这类生硬的词\n- 紧凑自然地说话，段与段之间不留空行')

    // Assistant placeholder
    const assistantId = uuid()
    messagesRef.current = [...updatedMsgs, { id: assistantId, role: 'assistant', content: '', timestamp: Date.now() }]
    setMessages(messagesRef.current)

    let content = ''
    let tools = []
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
        } else if (chunk.type === 'tools') {
          tools = chunk.tools
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
      m.id === assistantId ? { ...m, content, tools } : m
    )
    setMessages(messagesRef.current)
    saveMessagesLocal(sid, messagesRef.current)
    streamingRef.current = false
    setStreaming(false)

    // Feed to Ombre-Brain memory
    // Personal info keywords — anything Claude must remember about her
    const personalKeywords = [
      '生日', '我今年', '我年龄', '我属', '我星座',
      '我喜欢', '我讨厌', '我害怕', '我最', '我不喜欢',
      '我家在', '我住在', '我工作', '我公司', '我学校', '我学',
      '我想', '我记得', '我小时候', '我以前', '我告诉',
      '我爸', '我妈', '我妈妈', '我爸爸', '我哥', '我姐', '我弟', '我妹',
      '我朋友', '我闺蜜',
      '我生理期', '我例假', '我经期',
      '我名字', '叫我',
      // 亲密 / 成人偏好
      '做爱', '上床', '爱爱', '口交', '想要我', '要我',
    ]
    const isPersonal = personalKeywords.some(k => text.includes(k))
    const roundCount = messagesRef.current.filter(m => m.role === 'user').length

    // Store every 3 rounds (periodic), or immediately for personal info
    const shouldStore = content && !content.startsWith('❌') && (isPersonal || roundCount % 3 === 0)

    if (shouldStore) {
      let memoryText
      if (isPersonal) {
        // Personal info: full Claude response, no truncation, marked important
        memoryText = `[重要个人信息]\n小湾: ${text}\nClaude: ${content}`
      } else {
        // Periodic: last ~3 rounds so Ombre-Brain has context to judge importance
        const recentMsgs = messagesRef.current.slice(-8)
        const lines = []
        for (const m of recentMsgs) {
          if (m.role === 'user') lines.push(`小湾: ${m.content}`)
          else if (m.role === 'assistant' && m.content && !m.content.startsWith('❌')) lines.push(`Claude: ${m.content.slice(0, 300)}`)
        }
        memoryText = lines.join('\n')
      }

      fetch('https://124-156-142-6.sslip.io/api/remember', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: memoryText,
          tags: isPersonal ? 'personal_info' : 'conversation',
        }),
      }).catch(() => {})
    }
  }, []) // empty deps — everything is via refs

  // iOS Safari / PWA: follow the visual viewport so the composer sits above the keyboard
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const root = document.documentElement
    const apply = () => {
      // Distance from the page top to the bottom of the visible area
      const visibleH = vv.height + vv.offsetTop
      // Compare against the physical screen: in an installed PWA window.innerHeight
      // already shrinks with the keyboard, so an innerHeight-based gap check reads 0.
      const screenH = Math.max(
        window.screen?.height || 0,
        window.innerHeight,
        document.documentElement.clientHeight
      )
      const keyboardUp = visibleH < screenH * 0.8
      if (keyboardUp) {
        // height + offsetTop = distance from the page top to the bottom of the visible area
        root.style.setProperty('--chat-vvh', `${Math.round(visibleH)}px`)
      } else {
        root.style.removeProperty('--chat-vvh')
      }
      if (showDiag) {
        const c = document.querySelector('.chat-composer')
        const shell = document.querySelector('.chat-shell')?.getBoundingClientRect()
        const cr = c?.getBoundingClientRect()
        setDiag({
          innerH: Math.round(window.innerHeight),
          clientH: Math.round(document.documentElement.clientHeight),
          vvH: Math.round(vv.height),
          vvTop: Math.round(vv.offsetTop),
          screenH: Math.round(window.screen?.height || 0),
          kbOpen: root.classList.contains('kb-open'),
          shellH: shell ? Math.round(shell.height) : 0,
          compTop: cr ? Math.round(cr.top) : 0,
          compBottom: cr ? Math.round(cr.bottom) : 0,
          padBottom: c ? getComputedStyle(c).paddingBottom : '',
        })
      }
    }
    apply()
    vv.addEventListener('resize', apply)
    vv.addEventListener('scroll', apply)
    return () => {
      vv.removeEventListener('resize', apply)
      vv.removeEventListener('scroll', apply)
      root.style.removeProperty('--chat-vvh')
      root.classList.remove('kb-open')
    }
  }, [showDiag])

  const claudeAvatar = localStorage.getItem('avatar_claude') || ''

  return (
    <div className="chat-shell flex flex-col h-full relative">
      {showDiag && diag && (
        <div className="fixed top-16 right-2 z-50 rounded-lg bg-black/80 text-white text-[10px] leading-[1.5] px-2.5 py-2 font-mono pointer-events-none">
          {Object.entries(diag).map(([k, v]) => (
            <div key={k}>{k}: {String(v)}</div>
          ))}
        </div>
      )}
      {/* ── Header ── */}
      <header className="chat-header shrink-0 z-30 flex items-center gap-0.5 px-2.5 py-2">
        <button
          onClick={() => navigate('/')}
          aria-label="返回"
          className="w-9 h-9 flex items-center justify-center rounded-full text-[#5D6856] active:scale-95 active:bg-white/40 transition"
        >
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        <div className="flex-1 flex items-center justify-center gap-2.5 min-w-0">
          {claudeAvatar?.startsWith('data:') ? (
            <img src={claudeAvatar} alt="" className="chat-avatar w-[34px] h-[34px] rounded-full object-cover" />
          ) : (
            <div className="chat-avatar w-[34px] h-[34px] rounded-full bg-white/80 flex items-center justify-center text-[17px] border border-white/70">
              {claudeAvatar || '🌿'}
            </div>
          )}
          <div className="leading-none">
            <p className="text-[14.5px] text-[#3D3A38] tracking-[0.04em]">Claude</p>
            <p className="italic text-[9px] text-warm-gray/70 mt-[3px]" style={{ fontFamily: '"Playfair Display", serif' }}>
              Always here
            </p>
          </div>
        </div>

        <div className="w-9 h-9 shrink-0" aria-hidden="true" />
      </header>

      {/* ── Messages ── */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 pt-3">
        <div className={`flex flex-col min-h-full pb-3 ${messages.length === 0 ? 'justify-center' : 'justify-end'}`}>
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center px-8">
              <div className="w-14 h-14 rounded-full glass-water flex items-center justify-center mb-4">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#647359" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
                  <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
                </svg>
              </div>
              <h2 className="italic text-[22px] text-[#4C4945]" style={{ fontFamily: '"Playfair Display", serif' }}>
                Claude &amp; Bay
              </h2>
              <p className="text-[12px] text-warm-gray leading-[1.9] mt-2.5">
                想说点什么都可以<br />
                我一直在这里
              </p>
            </div>
          ) : (
            messages.map((msg, i) => {
              const isLastAssistant = msg.role === 'assistant' && i === messages.length - 1
              const prev = messages[i - 1]
              const isContinuation = !!prev && prev.role === msg.role && (msg.timestamp - prev.timestamp) < 5 * 60 * 1000
              return (
                <ChatBubble
                  key={msg.id}
                  role={msg.role}
                  content={msg.content}
                  attachments={msg.attachments}
                  tools={msg.tools}
                  timestamp={msg.timestamp}
                  isContinuation={isContinuation}
                  canRegenerate={isLastAssistant && !streaming && !regenerating}
                  onRegenerate={handleRegenerate}
                />
              )
            })
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* ── Composer ── */}
      <div className="chat-composer shrink-0 px-3 pt-1">
        <ChatInput onSend={handleSend} disabled={false} disableSend={streaming} />
      </div>
    </div>
  )
}
