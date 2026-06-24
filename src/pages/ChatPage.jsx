import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import ChatBubble from '../components/ChatBubble'
import ChatInput from '../components/ChatInput'

// ── localStorage persistence ──
const MSG_PREFIX = 'bunny_msgs_'
const SESS_KEY = 'bunny_sessions'

function loadMessages(sessionId) {
  try { return JSON.parse(localStorage.getItem(MSG_PREFIX + sessionId) || '[]') }
  catch { return [] }
}
function saveMessages(sessionId, msgs) {
  localStorage.setItem(MSG_PREFIX + sessionId, JSON.stringify(msgs))
}
function loadSessions() {
  try { return JSON.parse(localStorage.getItem(SESS_KEY) || '[]') }
  catch { return [] }
}
function saveSessions(sessions) {
  localStorage.setItem(SESS_KEY, JSON.stringify(sessions))
}

// ── SSE stream ──
async function* streamChat(messages, { systemPrompt, temperature, maxTokens }) {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, systemPrompt, temperature, maxTokens }),
  })
  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Server error: ${err}`)
  }
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
  const [messages, setMessages] = useState([])
  const [streaming, setStreaming] = useState(false)
  const bottomRef = useRef(null)

  // Refs to avoid any closure issues
  const streamingRef = useRef(false)
  const messagesRef = useRef([])
  const sidRef = useRef(null)
  const setSessionsRef = useRef(setSessions)

  // Keep refs in sync
  useEffect(() => { messagesRef.current = messages }, [messages])
  useEffect(() => { sidRef.current = currentSessionId }, [currentSessionId])
  useEffect(() => { setSessionsRef.current = setSessions }, [setSessions])

  // Load messages when switching to an existing session
  const loadedSessionRef = useRef(null)
  useEffect(() => {
    if (currentSessionId && currentSessionId !== loadedSessionRef.current) {
      loadedSessionRef.current = currentSessionId
      const existing = loadMessages(currentSessionId)
      if (existing.length > 0) setMessages(existing)
    } else if (!currentSessionId) {
      loadedSessionRef.current = null
      setMessages([])
    }
  }, [currentSessionId])

  // Load sessions on mount
  useEffect(() => {
    const saved = loadSessions()
    if (saved.length > 0 && setSessions) setSessions(saved)
  }, [])

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Persist messages after streaming completes
  useEffect(() => {
    if (!streaming && currentSessionId && messages.length > 0) {
      saveMessages(currentSessionId, messages)
    }
  }, [streaming, currentSessionId, messages])

  const handleSend = useCallback(async (text, attachments = []) => {
    // Guard: no double-tap
    if (streamingRef.current) return
    if (!text.trim() && attachments.length === 0) return

    streamingRef.current = true
    setStreaming(true)

    // Session
    let sid = sidRef.current
    if (!sid) {
      sid = crypto.randomUUID()
      sidRef.current = sid
      const newSession = { id: sid, name: text.slice(0, 20), updated_at: new Date().toLocaleDateString('zh-CN') }
      setSessionsRef.current?.((prev) => {
        const updated = [newSession, ...prev]
        saveSessions(updated)
        return updated
      })
    }

    // User message
    const userMsg = { id: crypto.randomUUID(), role: 'user', content: text, attachments, timestamp: Date.now() }
    const updatedMsgs = [...messagesRef.current, userMsg]
    messagesRef.current = updatedMsgs
    setMessages(updatedMsgs)
    saveMessages(sid, updatedMsgs)

    // Context window truncation
    const maxRounds = parseInt(localStorage.getItem('max_context_rounds') || '20')
    const recentMessages = updatedMsgs.slice(-maxRounds * 2) // each round = user + assistant
    const apiMessages = recentMessages.map((m) => ({ role: m.role, content: m.content }))

    const systemPrompt = localStorage.getItem('system_prompt') ||
      '你是一个温柔、细腻的AI伙伴。你善于倾听，会记住我说过的话，用温暖的方式回应。'

    // Assistant placeholder
    const assistantId = crypto.randomUUID()
    messagesRef.current = [...updatedMsgs, { id: assistantId, role: 'assistant', content: '', timestamp: Date.now() }]
    setMessages(messagesRef.current)

    let content = ''
    try {
      const stream = streamChat(apiMessages, {
        systemPrompt,
        temperature: parseFloat(localStorage.getItem('temperature') || '0.8'),
        maxTokens: 4096,
      })
      for await (const chunk of stream) {
        if (chunk.type === 'text') {
          content += chunk.text
          messagesRef.current = messagesRef.current.map((m) =>
            m.id === assistantId ? { ...m, content, timestamp: Date.now() } : m
          )
          setMessages(messagesRef.current)
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
    saveMessages(sid, messagesRef.current)
    streamingRef.current = false
    setStreaming(false)
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
          <div className="w-7 h-7 rounded-full bg-mint flex items-center justify-center text-sm">🌿</div>
          <span className="font-medium text-[15px] text-warm-dark">Claude</span>
        </div>
        <div className="w-2 h-2 rounded-full bg-green-400 ring-2 ring-green-100" title="在线" />
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
            messages.map((msg) => (
              <ChatBubble
                key={msg.id}
                role={msg.role}
                content={msg.content}
                attachments={msg.attachments}
                timestamp={msg.timestamp}
              />
            ))
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <ChatInput onSend={handleSend} disabled={streaming} />
    </div>
  )
}
