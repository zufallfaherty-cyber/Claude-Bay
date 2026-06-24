import express from 'express'
import cors from 'cors'

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json())

// ── Health check ──
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// ── Chat endpoint (streaming via SSE) ──
app.post('/api/chat', async (req, res) => {
  const { messages, systemPrompt, temperature = 0.8, maxTokens = 4096 } = req.body

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array is required' })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured on server' })
  }

  // Build the messages array for Claude API
  const apiMessages = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }))

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',  // Latest Sonnet — good balance of speed & quality
        max_tokens: maxTokens,
        temperature: temperature,
        system: systemPrompt || '你是一个温柔、细腻的AI伙伴。',
        messages: apiMessages,
        stream: true,
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      res.write(`data: ${JSON.stringify({ type: 'error', error: errText })}\n\n`)
      res.end()
      return
    }

    // Stream the SSE events from Claude
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
          if (data === '[DONE]') continue

          try {
            const parsed = JSON.parse(data)

            if (parsed.type === 'content_block_delta') {
              const text = parsed.delta?.text || ''
              if (text) {
                res.write(`data: ${JSON.stringify({ type: 'text', text })}\n\n`)
              }
            } else if (parsed.type === 'content_block_start') {
              // Forward content block start for tracking
              res.write(`data: ${JSON.stringify({ type: 'block_start', content_block: parsed.content_block })}\n\n`)
            } else if (parsed.type === 'message_stop') {
              res.write(`data: ${JSON.stringify({ type: 'stop' })}\n\n`)
            } else if (parsed.type === 'error') {
              res.write(`data: ${JSON.stringify({ type: 'error', error: parsed.error?.message || 'Unknown error' })}\n\n`)
            }
          } catch {
            // Skip unparseable lines
          }
        }
      }
    }

    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`)
    res.end()
  } catch (err) {
    console.error('Chat error:', err)
    res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`)
    res.end()
  }
})

app.listen(PORT, () => {
  console.log(`🐰 Bunny Chat server running on http://localhost:${PORT}`)
})
