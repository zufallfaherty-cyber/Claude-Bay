import { useState, useEffect, useRef, useCallback } from 'react'
import ChatBubble from '../components/ChatBubble'
import ChatInput from '../components/ChatInput'
import TypingIndicator from '../components/TypingIndicator'

async function* streamChat(messages, { systemPrompt, temperature, maxTokens }) {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages,
      systemPrompt,
      temperature,
      maxTokens,
    }),
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
          if (parsed.type === 'text') {
            yield { type: 'text', text: parsed.text }
          } else if (parsed.type === 'error') {
            yield { type: 'error', error: parsed.error }
          } else if (parsed.type === 'stop' || parsed.type === 'done') {
            return
          }
        } catch { /* skip */ }
      }
    }
  }
}

export default function ChatPage({
  currentSessionId,
  setCurrentSessionId,
  sessions,
  setSessions,
}) {
  const [messages, setMessages] = useState([])
  const [streaming, setStreaming] = useState(false)
  const bottomRef = useRef(null)
  const abortRef = useRef(null)

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = useCallback(async (text) => {
    if (!text.trim() || streaming) return

    // Create session if needed
    let sid = currentSessionId
    if (!sid) {
      sid = crypto.randomUUID()
      setCurrentSessionId(sid)
      const newSession = {
        id: sid,
        name: text.slice(0, 20),
        updated_at: new Date().toLocaleDateString('zh-CN'),
      }
      setSessions((prev) => [newSession, ...prev])
    }

    // Add user message
    const userMsg = { id: crypto.randomUUID(), role: 'user', content: text }
    setMessages((prev) => [...prev, userMsg])

    // Prepare API call
    const systemPrompt = localStorage.getItem('system_prompt') ||
      '你是一个温柔、细腻的AI伙伴。你善于倾听，会记住我说过的话，用温暖的方式回应。'
    const temperature = parseFloat(localStorage.getItem('temperature') || '0.8')
    const maxTokens = 4096

    // Build messages for API (only role + content)
    const allMessages = [...messages, userMsg].map((m) => ({
      role: m.role,
      content: m.content,
    }))

    // Start streaming reply
    setStreaming(true)
    const assistantId = crypto.randomUUID()
    let content = ''
    setMessages((prev) => [...prev, { id: assistantId, role: 'assistant', content: '' }])

    try {
      const stream = streamChat(allMessages, { systemPrompt, temperature, maxTokens })
      abortRef.current = () => stream.return?.()

      for await (const chunk of stream) {
        if (chunk.type === 'text') {
          content += chunk.text
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, content } : m))
          )
        } else if (chunk.type === 'error') {
          content += `\n\n❌ 出错了：${chunk.error}`
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, content } : m))
          )
          break
        }
      }
    } catch (err) {
      console.error('Stream error:', err)
      content += `\n\n❌ 连接失败：${err.message}`
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, content } : m))
      )
    }

    abortRef.current = null
    setStreaming(false)
  }, [currentSessionId, setCurrentSessionId, setSessions, messages, streaming])

  return (
    <div className="flex flex-col h-full">
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <div className="text-6xl mb-4 animate-bounce">💕</div>
            <h2 className="text-xl font-semibold text-warm-dark mb-2">
              Claude&Bay
            </h2>
            <p className="text-sm text-warm-gray leading-relaxed">
              有什么想聊的，都可以告诉我<br />
              我会一直在这里听着 🌸
            </p>
          </div>
        ) : (
          messages.map((msg) => (
            <ChatBubble key={msg.id} role={msg.role} content={msg.content} />
          ))
        )}

        {streaming && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>

      {/* Input Area */}
      <ChatInput onSend={handleSend} disabled={streaming} />
    </div>
  )
}
