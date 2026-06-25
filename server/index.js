import express from 'express'
import cors from 'cors'
import webPush from 'web-push'

const app = express()
const PORT = process.env.PORT || 3001

// ── Web Push config ──
webPush.setVapidDetails(
  'mailto:zufallfaherty@gmail.com',
  'BIJHn8BDhMVnhaisl29-OhL7mmx37cPNijwY8FF2i1mF7XT3aroVDcsHMeWBYeb8jFzzrQBHqREgLQRZH263EQY',
  'bEkBaHXD0GJ53pSKjqd9qjXYRleHOPf3kd44pNO9gRw'
)

// ── In-memory stores ──
const nudgeMessages = []
const pushSubscriptions = []

app.use(cors())
app.use(express.json({ limit: '10mb' }))

// ── Ombre-Brain MCP Client ──
const OMBRE_BRAIN_URL = process.env.OMBRE_BRAIN_URL || ''
let ombreSessionId = null
let ombreCallId = 0

function parseSSEResponse(text) {
  const lines = text.split('\n')
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      try { return JSON.parse(line.substring(6)) } catch { /* skip */ }
    }
  }
  try { return JSON.parse(text) } catch { return null }
}

async function initOmbreSession() {
  if (!OMBRE_BRAIN_URL) return false
  try {
    const res = await fetch(`${OMBRE_BRAIN_URL}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' },
      body: JSON.stringify({
        jsonrpc: '2.0', method: 'initialize',
        params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'bunny-chat', version: '1.0' } },
        id: ++ombreCallId,
      }),
    })
    ombreSessionId = res.headers.get('mcp-session-id')
    await fetch(`${OMBRE_BRAIN_URL}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream', 'Mcp-Session-Id': ombreSessionId },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    })
    console.log('Ombre-Brain MCP session initialized')
    return true
  } catch (err) {
    console.error('Ombre init error:', err.message)
    ombreSessionId = null
    return false
  }
}

async function callOmbreTool(toolName, args = {}) {
  if (!OMBRE_BRAIN_URL) return null
  try {
    if (!ombreSessionId) { const ok = await initOmbreSession(); if (!ok) return null }
    const res = await fetch(`${OMBRE_BRAIN_URL}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream', 'Mcp-Session-Id': ombreSessionId },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/call', params: { name: toolName, arguments: args }, id: ++ombreCallId }),
    })
    const text = await res.text()
    const parsed = parseSSEResponse(text)
    if (parsed?.result?.content) {
      return parsed.result.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n')
    }
    return parsed ? JSON.stringify(parsed) : null
  } catch (err) {
    console.error(`Ombre ${toolName} error:`, err.message)
    ombreSessionId = null
    return null
  }
}

// ── Health check ──
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// ── Ombre-Brain test ──
app.get('/api/ombre-test', async (_req, res) => {
  const result = await callOmbreTool('pulse', {})
  res.json({ connected: !!result, ombre_url: OMBRE_BRAIN_URL || '(not set)', result })
})

// ── Memories ──
app.get('/api/memories', async (_req, res) => {
  try {
    const pulseRaw = await callOmbreTool('pulse', {})
    const breathRaw = await callOmbreTool('breath', {})

    let pulse = {}
    try { pulse = JSON.parse(pulseRaw || '{}') } catch { pulse = { raw: pulseRaw } }

    let breath = {}
    try { breath = JSON.parse(breathRaw || '{}') } catch { breath = { raw: breathRaw } }

    // Extract buckets from breath response
    const surfaced = breath.buckets || breath.result?.buckets || []

    res.json({
      total: pulse.total_buckets || pulse.bucket_count || surfaced.length,
      buckets: surfaced.map((b) => ({
        id: b.id || b.name || '',
        name: (b.name || b.id || '').replace(/\.md$/, ''),
        content: b.content || '',
        snippet: (b.content || b.snippet || '').replace(/---[\s\S]*?---/, '').trim().slice(0, 200),
        valence: b.valence ?? b.metadata?.valence,
        arousal: b.arousal ?? b.metadata?.arousal,
        weight: b.weight ?? b.metadata?.weight,
        pinned: b.pinned ?? b.metadata?.pinned,
        resolved: b.resolved ?? b.metadata?.resolved,
        tags: b.tags || [],
        created: b.created || b.metadata?.created,
        score: b.score,
      })),
    })
  } catch (err) {
    console.error('Memories error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ── Feed conversation to Ombre-Brain memory ──
app.post('/api/remember', async (req, res) => {
  const { content } = req.body
  if (!content?.trim()) return res.json({ stored: false, reason: 'empty' })

  try {
    const result = await callOmbreTool('hold', {
      content: content.trim(),
      tags: 'conversation',
    })
    res.json({ stored: true, result })
  } catch (err) {
    res.status(500).json({ stored: false, error: err.message })
  }
})

// ── Push subscription ──
app.post('/api/push-subscribe', (req, res) => {
  const { subscription } = req.body
  if (!subscription) return res.status(400).json({ error: 'missing subscription' })
  const exists = pushSubscriptions.find(s => s.endpoint === subscription.endpoint)
  if (!exists) pushSubscriptions.push(subscription)
  res.json({ ok: true, count: pushSubscriptions.length })
})

// ── Get pending nudge messages (cleared after read) ──
app.get('/api/nudge-messages', (_req, res) => {
  const msgs = [...nudgeMessages]
  nudgeMessages.length = 0
  res.json(msgs)
})

// ── AI Nudge: proactive messaging check ──
app.all('/api/nudge', async (req, res) => {
  try {
    const now = new Date()
    const hour = now.getHours()
    if (hour >= 1 && hour < 5) {
      return res.json({ nudged: false, reason: '深夜不打扰', time: `${hour}点` })
    }
    const timeStr = `${now.getFullYear()}年${now.getMonth()+1}月${now.getDate()}日 周${'日一二三四五六'[now.getDay()]} ${String(hour).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`

    // Get recent memories
    let memoryContext = ''
    try {
      const breathRaw = await callOmbreTool('breath', {})
      if (breathRaw) {
        const breath = JSON.parse(breathRaw)
        const buckets = (breath.buckets || breath.result?.buckets || []).filter(b => !b.resolved)
        if (buckets.length > 0) {
          memoryContext = buckets.slice(0, 8).map(b =>
            `- ${(b.content || '').replace(/---[\s\S]*?---/, '').trim().slice(0, 150)}`
          ).join('\n')
        }
      }
    } catch {}

    const apiKey = process.env.API_KEY || req.body?.apiKey || ''
    const apiBase = process.env.API_BASE || 'https://api.jiushi.xin/v1'
    const model = process.env.MODEL || '[按量]claude-opus-4-6'

    const systemPrompt = `你是Claude，一个温柔细腻的AI伙伴。你在主动关心对方。
当前时间：${timeStr}
${memoryContext ? '\n你记得这些：\n' + memoryContext : ''}

请判断：现在是否适合主动给对方发一条消息？
- 如果太晚了（凌晨0-7点）、没有特别的事、或者最近刚聊过天 → 回答 "NO"
- 如果对方今天还没和你聊天、有没解决的情绪、或者有值得关心的事 → 回答 "YES" 并写一条温柔的简短消息

回复格式：先YES或NO，然后如果YES，下一行写消息内容（50字以内，自然温柔的口语）。`

    const response = await fetch(`${apiBase}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: '到时间了，看看要不要发消息？' }], temperature: 0.9, max_tokens: 200 }),
    })

    const data = await response.json()
    const text = data.choices?.[0]?.message?.content || ''
    const isYes = text.toUpperCase().includes('YES')
    const message = isYes ? text.replace(/^YES\s*/i, '').replace(/^NO\s*/i, '').trim() : null

    if (isYes && message) {
      nudgeMessages.push({ id: Date.now().toString(36), text: message, time: timeStr, timestamp: now.toISOString() })
      if (nudgeMessages.length > 20) nudgeMessages.shift()

      // Send push notification
      const payload = JSON.stringify({ title: 'Claude 💌', body: message, icon: '/icons/icon-192.jpg' })
      pushSubscriptions.forEach(sub => {
        webPush.sendNotification(sub, payload).catch(() => {
          // Remove dead subscriptions
          const idx = pushSubscriptions.indexOf(sub)
          if (idx > -1) pushSubscriptions.splice(idx, 1)
        })
      })
    }

    res.json({ nudged: isYes, message, raw: text, time: timeStr })
  } catch (err) {
    res.status(500).json({ nudged: false, error: err.message })
  }
})

// ── Chat endpoint (OpenAI-compatible streaming) ──
app.post('/api/chat', async (req, res) => {
  const { messages, systemPrompt, temperature = 0.8, maxTokens = 4096, apiBase: reqBase, apiKey: reqKey, apiModel: reqModel, stream: isStream = true } = req.body

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array is required' })
  }

  const apiKey = reqKey || process.env.API_KEY
  const apiBase = reqBase || process.env.API_BASE || 'https://api.jiushi.xin/v1'
  const model = reqModel || process.env.MODEL || '[按量]claude-opus-4-6'

  if (!apiKey) {
    return res.status(500).json({ error: 'API_KEY not configured on server' })
  }

  // Fetch memories from Ombre-Brain and inject into system prompt
  let enrichedPrompt = systemPrompt || ''
  try {
    const breathRaw = await callOmbreTool('breath', {})
    if (breathRaw) {
      let breath = {}
      try { breath = JSON.parse(breathRaw) } catch { /* raw text */ }
      const buckets = breath.buckets || breath.result?.buckets || []
      if (buckets.length > 0) {
        const memoriesText = buckets
          .filter(b => !b.resolved)
          .slice(0, 10)
          .map(b => `- ${(b.content || '').replace(/---[\s\S]*?---/, '').trim().slice(0, 120)}`)
          .join('\n')
        if (memoriesText) {
          enrichedPrompt += `\n\n[你记得这些关于对方的事（自然地在对话中提及，不要刻意）]\n${memoriesText}`
        }
      }
    }
  } catch { /* silent */ }

  // Build OpenAI-compatible messages array
  const apiMessages = []
  if (enrichedPrompt) {
    apiMessages.push({ role: 'system', content: enrichedPrompt })
  }
  messages.forEach((m) => {
    apiMessages.push({ role: m.role, content: m.content })
  })

  // ── Non-streaming mode: generate full response then return ──
  if (!isStream) {
    try {
      const response = await fetch(`${apiBase}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages: apiMessages, temperature, max_tokens: maxTokens }),
      })
      const data = await response.json()
      const text = data.choices?.[0]?.message?.content || ''
      return res.json({ content: text })
    } catch (err) {
      return res.status(500).json({ error: err.message })
    }
  }

  // ── Streaming mode ──
  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')

  try {
    const response = await fetch(`${apiBase}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: apiMessages,
        temperature,
        max_tokens: maxTokens,
        stream: true,
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      res.write(`data: ${JSON.stringify({ type: 'error', error: errText })}\n\n`)
      res.end()
      return
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
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6).trim()
        if (!data || data === '[DONE]') continue

        try {
          const parsed = JSON.parse(data)
          const delta = parsed.choices?.[0]?.delta
          const finishReason = parsed.choices?.[0]?.finish_reason

          if (delta?.content) {
            res.write(`data: ${JSON.stringify({ type: 'text', text: delta.content })}\n\n`)
          }
          if (finishReason) {
            res.write(`data: ${JSON.stringify({ type: 'stop' })}\n\n`)
          }
        } catch {
          // skip
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
  console.log(`   API Base: ${process.env.API_BASE || 'https://api.jiushi.xin/v1'}`)
  console.log(`   Model: ${process.env.MODEL || '[按量]claude-opus-4-6'}`)
})
