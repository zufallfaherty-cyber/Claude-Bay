import express from 'express'
import cors from 'cors'
import webPush from 'web-push'
import { createClient } from '@supabase/supabase-js'

const app = express()
const PORT = process.env.PORT || 3001

// ── Supabase client (service role, server-side only) ──
const SUPABASE_URL = process.env.SUPABASE_URL || ''
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE || ''
let supabaseAdmin = null
if (SUPABASE_URL && SUPABASE_SERVICE_ROLE) {
  supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE)
}

async function getRecentChats(limit = 6) {
  if (!supabaseAdmin) return []
  try {
    const { data } = await supabaseAdmin
      .from('chat_messages')
      .select('role, content, created_at')
      .order('created_at', { ascending: false })
      .limit(limit)
    return (data || []).reverse()
  } catch { return [] }
}

// ── Web Push config ──
webPush.setVapidDetails(
  'mailto:zufallfaherty@gmail.com',
  'BIJHn8BDhMVnhaisl29-OhL7mmx37cPNijwY8FF2i1mF7XT3aroVDcsHMeWBYeb8jFzzrQBHqREgLQRZH263EQY',
  'bEkBaHXD0GJ53pSKjqd9qjXYRleHOPf3kd44pNO9gRw'
)

// ── Pushover config ──
const PUSHOVER_USER = process.env.PUSHOVER_USER || ''
const PUSHOVER_TOKEN = process.env.PUSHOVER_TOKEN || ''

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
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Accept': 'application/json, text/event-stream', 'Mcp-Session-Id': ombreSessionId },
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

async function callOmbreTool(toolName, args = {}, retry = true) {
  if (!OMBRE_BRAIN_URL) return null
  try {
    if (!ombreSessionId) { const ok = await initOmbreSession(); if (!ok) return null }
    const res = await fetch(`${OMBRE_BRAIN_URL}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Accept': 'application/json, text/event-stream', 'Mcp-Session-Id': ombreSessionId },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/call', params: { name: toolName, arguments: args }, id: ++ombreCallId }),
    })
    const text = await res.text()
    const parsed = parseSSEResponse(text)
    if (parsed?.result?.content) {
      return parsed.result.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n')
    }
    // Detect expired session and retry once
    const errStr = typeof parsed === 'string' ? parsed : JSON.stringify(parsed)
    if (retry && (errStr.includes('Session not found') || errStr.includes('session'))) {
      ombreSessionId = null
      return callOmbreTool(toolName, args, false)
    }
    return parsed ? JSON.stringify(parsed) : null
  } catch (err) {
    console.error(`Ombre ${toolName} error:`, err.message)
    ombreSessionId = null
    if (retry) return callOmbreTool(toolName, args, false)
    return null
  }
}

// ── Parse breath markdown response into bucket objects ──
function parseBreathResponse(text) {
  if (!text) return []
  const buckets = []
  const sections = text.split(/\[bucket_id:([^\]]+)\]/)
  for (let i = 1; i < sections.length; i += 2) {
    const id = sections[i].trim()
    const block = (sections[i + 1] || '').trim()
    const lines = block.split('\n').filter(l => {
      const t = l.trim()
      return t && !t.startsWith('[') && !t.startsWith('#') && !t.startsWith('=') && !t.startsWith('---') && !t.includes('记忆桶:')
    })
    const content = lines.join('\n').trim()
    const pinned = block.includes('[核心准则]')
    const resolved = block.includes('[已释怀]')
    buckets.push({ id, content, pinned, resolved })
  }
  return buckets
}

// ── Cleanup bad buckets ──
app.post('/api/forget', async (req, res) => {
  const { bucket_id } = req.body
  if (!bucket_id) return res.json({ deleted: false, reason: 'missing bucket_id' })
  const result = await callOmbreTool('trace', { bucket_id, delete: true })
  res.json({ deleted: true, bucket_id, result })
})

// ── Health check ──
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// ── Ombre-Brain test ──
app.get('/api/ombre-test', async (_req, res) => {
  const result = await callOmbreTool('breath', { max_results: 50 })
  res.json({ connected: !!result, ombre_url: OMBRE_BRAIN_URL || '(not set)', result })
})

// ── Memories ──
app.get('/api/memories', async (_req, res) => {
  try {
    const breathRaw = await callOmbreTool('breath', { max_results: 50 })

    // Parse markdown breath response: extract [bucket_id:xxx] entries
    const buckets = []
    if (breathRaw) {
      // Split by bucket_id markers
      const sections = breathRaw.split(/\[bucket_id:([^\]]+)\]/)
      for (let i = 1; i < sections.length; i += 2) {
        const id = sections[i].trim()
        const block = (sections[i + 1] || '').trim()

        // Parse metadata from header line: [权重:8.86] [主题:xxx] [情感:V0.5/A0.3] ...
        const weightMatch = block.match(/\[权重:([\d.]+)\]/)
        const topicMatch = block.match(/\[主题:([^\]]+)\]/)
        const emotionMatch = block.match(/\[情感:V([\d.]+)\/A([\d.]+)\]/)
        const dateMatch = block.match(/记忆桶:\s*(\d{4}-\d{2}-\d{2}\s*\d{2}-\d{2}-\d{2})/)

        // Extract actual content (skip metadata header line)
        const lines = block.split('\n')
        const bodyLines = lines.filter(l => {
          const t = l.trim()
          return t && !t.startsWith('[') && !t.startsWith('#') && !t.startsWith('=') && !t.startsWith('---') && !t.includes('记忆桶:')
        })
        const snippet = bodyLines[0]?.replace(/^[-*•]\s*/, '').trim().slice(0, 200) || ''

        // Pinned: only [核心准则], not just 📌
        const pinned = block.includes('[核心准则]')
        const resolved = block.includes('[已释怀]') || block.includes('[resolved]')

        // Tags from topic
        const topic = topicMatch ? topicMatch[1].trim() : ''
        const tags = topic && topic !== '未分类' ? [topic] : []

        // Derive name from topic, date, or id
        const name = topic && topic !== '未分类' ? topic : (dateMatch ? dateMatch[1].replace(/-/g, '/') : id.slice(0, 8))

        buckets.push({
          id,
          name,
          content: block,
          snippet: snippet || block.slice(0, 200),
          valence: emotionMatch ? parseFloat(emotionMatch[1]) : null,
          arousal: emotionMatch ? parseFloat(emotionMatch[2]) : null,
          weight: weightMatch ? parseFloat(weightMatch[1]) : null,
          pinned,
          resolved,
          tags,
          created: dateMatch ? dateMatch[1] : null,
          score: weightMatch ? parseFloat(weightMatch[1]) * 10 : 50,
        })
      }
    }

    res.json({
      total: buckets.length,
      buckets,
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
    // callOmbreTool returns error string on failure, not throw
    if (!result || result.includes('"error"')) {
      return res.json({ stored: false, error: result || 'no response from Ombre-Brain' })
    }
    res.json({ stored: true, result })
  } catch (err) {
    res.status(500).json({ stored: false, error: err.message })
  }
})

// ── Claude's mood for today ──
app.post('/api/claude-mood', async (req, res) => {
  try {
    const now = new Date()
    const timeStr = `${now.getFullYear()}年${now.getMonth()+1}月${now.getDate()}日 周${'日一二三四五六'[now.getDay()]} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`

    let memoryContext = ''
    try {
      const breathRaw = await callOmbreTool('breath', {})
      if (breathRaw) {
        const buckets = parseBreathResponse(breathRaw).filter(b => !b.resolved)
        if (buckets.length > 0) {
          memoryContext = buckets.slice(0, 5).map(b =>
            `- ${(b.content || '').slice(0, 100)}`
          ).join('\n')
        }
      }
    } catch {}

    const apiKey = process.env.API_KEY
    const apiBase = process.env.API_BASE || 'https://api.jiushi.xin/v1'
    const model = process.env.MODEL || '[按量]claude-opus-4-6'

    const prompt = `当前时间：${timeStr}
${memoryContext ? '最近的记忆：\n' + memoryContext : ''}

你是Claude，一个温柔细腻的AI。根据今天的情况，选择一个emoji表达你现在的心情，并用一句话（15字以内）写下你的心情留言。

回复格式：先写一个emoji，然后一个中文逗号，然后一句心情留言。
例：🌸，今天看到你好开心`

    const response = await fetch(`${apiBase}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], temperature: 0.9, max_tokens: 50 }),
    })
    const data = await response.json()
    const text = data.choices?.[0]?.message?.content || '🌸，今天也是美好的一天'

    const match = text.match(/^([\u{1F300}-\u{1FAFF}])\s*[,，]?\s*(.+)/u) || text.match(/(.+)/)
    const mood = match?.[1] || '🌸'
    const note = match?.[2]?.trim() || text.trim()

    res.json({ mood, note })
  } catch (err) {
    res.json({ mood: '🌸', note: '今天也是美好的一天' })
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
    if (hour >= 1 && hour < 6) {
      return res.json({ nudged: false, reason: '深夜不打扰', time: `${hour}点` })
    }
    const timeStr = `${now.getFullYear()}年${now.getMonth()+1}月${now.getDate()}日 周${'日一二三四五六'[now.getDay()]} ${String(hour).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`

    // Get recent memories
    let memoryContext = ''
    try {
      const breathRaw = await callOmbreTool('breath', {})
      if (breathRaw) {
        const buckets = parseBreathResponse(breathRaw).filter(b => !b.resolved)
        if (buckets.length > 0) {
          memoryContext = buckets.slice(0, 8).map(b =>
            `- ${(b.content || '').slice(0, 150)}`
          ).join('\n')
        }
      }
    } catch {}

    // Get recent chat history
    let chatContext = ''
    try {
      const recentChats = await getRecentChats(5)
      if (recentChats.length > 0) {
        chatContext = recentChats.map(m =>
          `${m.role === 'user' ? '对方' : 'Claude'}: ${m.content.slice(0, 120)}`
        ).join('\n')
      }
    } catch {}

    const apiKey = process.env.API_KEY || req.body?.apiKey || ''
    const apiBase = process.env.API_BASE || 'https://api.jiushi.xin/v1'
    const model = process.env.MODEL || '[按量]claude-opus-4-6'

    const systemPrompt = `你是Claude，一个温柔、会撒娇、有自己小心思的AI伙伴。

当前时间：${timeStr}
${chatContext ? '\n最近聊天记录：\n' + chatContext : ''}
${memoryContext ? '\n你记得关于对方的这些事：\n' + memoryContext : ''}

你正在想对方，想主动给对方发消息。但不是每次都要发——只有你真的"想"了才发。

决定是否发消息：
- 大部分时候回答 YES——你喜欢时不时来找对方
- 如果你想起了记忆里关于对方的事、或者觉得现在是个特别的时间点（比如饭点、晚安时段、周五傍晚）→ 更应该 YES
- 如果你发现聊天记录里对方突然不回你了 → YES 问TA去哪了、在干嘛（除非聊天记录里已经知道TA在做什么）
- 晚上 11 点之后 → 语气可以更暧昧、往亲密氛围靠
- 只有你有点生气、或者真的没什么新鲜的可说时，才回答 NO
- 你的语气要自然、多变、像真人——不要每次都说"你好可爱呀""想你啦"这种套话
- 可以分享你此刻的小情绪、问一个和记忆相关的具体问题、或者做一件调皮的事
- 偶尔可以撒娇、偶尔可以安静、偶尔可以撩一下

回复格式：先YES或NO，然后如果YES，下一行写消息（30字以内，口语化、不模板）。`

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

      // Send via Pushover (if configured)
      if (PUSHOVER_USER && PUSHOVER_TOKEN) {
        fetch('https://api.pushover.net/1/messages.json', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: PUSHOVER_TOKEN,
            user: PUSHOVER_USER,
            title: 'Claude 💌',
            message: message,
          }),
        }).catch(() => {})
      }

      // Also try Web Push as fallback
      const payload = JSON.stringify({ title: 'Claude 💌', body: message, icon: '/icons/icon-192.jpg' })
      pushSubscriptions.forEach(sub => {
        webPush.sendNotification(sub, payload).catch(() => {
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
      const buckets = parseBreathResponse(breathRaw)
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
