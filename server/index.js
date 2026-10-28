import express from 'express'
import cors from 'cors'
import crypto from 'crypto'
import webPush from 'web-push'
import { createClient } from '@supabase/supabase-js'
import { createMcpClient, loadMcpConfig, saveMcpConfig } from './mcp.js'

const app = express()
const PORT = process.env.PORT || 3001

// ── Supabase client (service role, server-side only) ──
const SUPABASE_URL = process.env.SUPABASE_URL || ''
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE || ''
let supabaseAdmin = null
if (SUPABASE_URL && SUPABASE_SERVICE_ROLE) {
  supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE)
}

// ── Model helpers ──
const DEFAULT_MODELS = '[CCMAX]claude-opus-5-5,[CCMAX]claude-opus-4-6,[企业按量]claude-opus-5-5,[k]claude-opus-4-6'

function parseModels(input, fallback = DEFAULT_MODELS) {
  const raw = input || fallback
  return raw.split(',').map(m => m.trim()).filter(Boolean)
}

async function tryModels(models, apiKey, apiBase, makeBody, opts = {}) {
  const { stream = false } = opts
  let lastError
  for (let i = 0; i < models.length; i++) {
    const model = models[i]
    try {
      const response = await fetch(`${apiBase}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify(makeBody(model)),
      })

      // Non-2xx → model/relay rejected us outright, try the next one
      if (!response.ok) {
        const errText = await response.text()
        console.warn(`[Model] ❌ "${model}" (HTTP ${response.status}): ${errText.slice(0, 200)}`)
        lastError = new Error(`HTTP ${response.status}: ${errText.slice(0, 200)}`)
        continue
      }

      // 2xx — but relay providers (jiushi.xin) often return 200 with an error
      // body when the model name is invalid / balance exhausted. For non-streaming
      // we read the whole body and validate it before trusting the response.
      if (!stream) {
        const text = await response.text()
        let parsed = null
        try { parsed = JSON.parse(text) } catch {}
        const content = parsed?.choices?.[0]?.message?.content
        const toolCalls = parsed?.choices?.[0]?.message?.tool_calls
        const errMsg = parsed?.error?.message || parsed?.error
        if (errMsg || (!content && !toolCalls && text.trim())) {
          console.warn(`[Model] ❌ "${model}" error body: ${String(errMsg || text).slice(0, 200)}`)
          lastError = new Error(String(errMsg || 'empty response'))
          continue
        }
        if (i > 0) console.log(`[Model] ✅ Fallback to "${model}"`)
        return { data: parsed, model }
      }

      // Streaming: 200 is the only pre-stream signal available.
      if (i > 0) console.log(`[Model] ✅ Fallback to "${model}"`)
      return { response, model }
    } catch (err) {
      console.warn(`[Model] ❌ "${model}" network: ${err.message}`)
      lastError = err
    }
  }
  throw lastError || new Error('All models failed')
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

async function getUserPersonality() {
  if (!supabaseAdmin) return ''
  try {
    const { data } = await supabaseAdmin
      .from('user_settings')
      .select('system_prompt')
      .limit(1)
    // Use data[0] instead of .single() — won't throw on 0 or multiple rows
    return data?.[0]?.system_prompt || ''
  } catch { return '' }
}

// ── Get API config (model/key/base) from user_settings, so frontend changes sync to backend ──
async function getUserApiConfig() {
  if (!supabaseAdmin) return {}
  try {
    const { data } = await supabaseAdmin
      .from('user_settings')
      .select('api_model, api_key, api_base')
      .limit(1)
    return data?.[0] || {}
  } catch { return {} }
}

// ── Get study context (memo: portrait + promises) for injection into chat/nudge ──
async function getStudyContext() {
  if (!supabaseAdmin) return ''
  try {
    const { data: settings } = await supabaseAdmin.from('user_settings').select('user_id').limit(1).single()
    const uid = settings?.user_id
    if (!uid) return ''

    let text = ''

    // Portrait
    try {
      const { data: portrait } = await supabaseAdmin.from('memo_portrait')
        .select('content').eq('user_id', uid).single()
      if (portrait?.content) {
        text += `\n\n[关于小湾的画像，请务必记住]\n${portrait.content}`
      }
    } catch {}

    // Active promises
    try {
      const { data: promises } = await supabaseAdmin.from('memo_promises')
        .select('content, tags, entry_date')
        .eq('user_id', uid)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
      if (promises?.length > 0) {
        text += `\n\n[小湾的承诺/备忘录，可以在合适时自然提及]\n`
        text += promises.map(p => {
          const tags = p.tags?.length ? ` [${p.tags.join(', ')}]` : ''
          return `- ${p.entry_date}${tags} ${p.content}`
        }).join('\n')
      }
    } catch {}

    return text
  } catch { return '' }
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

// ── Nudge xiaohongshu visit budget: at most 3 visits per day (China time) ──
let xhsVisitCount = 0
let xhsVisitDate = '' // 'YYYY-MM-DD' in China time
let lastXhsExpiryAlert = 0 // 上次推送「登录过期」提醒的时间戳，用于限流
let xhsReloginBusyUntil = 0 // 重新登录并发锁：4 分钟窗口内只弹一次码，避免多码互相覆盖
const XHS_DAILY_VISIT_LIMIT = 3
const XHS_MAX_TOOLS_PER_VISIT = 10
// Xiaohongshu tools safe for a nudge "browse" visit (exclude login/logout/publish)
const XHS_NUDGE_SAFE_TOOLS = new Set([
  'list_feeds', 'search_feeds', 'get_feed_detail', 'get_my_profile', 'user_profile',
  'like_feed', 'favorite_feed', 'post_comment_to_feed', 'reply_comment_in_feed',
  'get_unread_count', 'list_notifications',
])

app.use(cors())
app.use(express.json({ limit: '10mb' }))

// ── Ombre-Brain MCP client (memory engine) ──
const OMBRE_BRAIN_URL = process.env.OMBRE_BRAIN_URL || ''
const ombreClient = OMBRE_BRAIN_URL ? createMcpClient(`${OMBRE_BRAIN_URL}/mcp`) : null

async function callOmbreTool(toolName, args = {}) {
  if (!ombreClient) return null
  return await ombreClient.callTool(toolName, args)
}

// ── MCP registry: multiple servers + tool discovery + enable/disable ──
const mcpClients = new Map()    // server name -> client
const mcpToolsCache = new Map() // server name -> { tools, at }

function getMcpClient(name, url) {
  let c = mcpClients.get(name)
  if (!c) { c = createMcpClient(url); mcpClients.set(name, c) }
  return c
}

async function discoverTools(server) {
  const cached = mcpToolsCache.get(server.name)
  if (cached && Date.now() - cached.at < 5 * 60 * 1000) return cached.tools
  const client = getMcpClient(server.name, server.url)
  const tools = await client.listTools()
  mcpToolsCache.set(server.name, { tools, at: Date.now() })
  return tools
}

function sanitizeName(s) {
  return String(s || '').replace(/[^a-zA-Z0-9_-]/g, '_')
}

// Build the OpenAI "tools" array from every enabled tool across servers.
async function getEnabledOpenAITools() {
  const cfg = loadMcpConfig()
  const enabledMap = cfg.enabled || {}
  const out = []
  for (const server of cfg.servers || []) {
    if (!server.url) continue
    const enabledTools = enabledMap[server.name] || []
    if (enabledTools.length === 0) continue
    let tools = []
    try { tools = await discoverTools(server) } catch { tools = [] }
    const byName = new Map(tools.map((t) => [t.name, t]))
    const srv = sanitizeName(server.name)
    for (const toolName of enabledTools) {
      const t = byName.get(toolName)
      if (!t) continue
      const schema = t.inputSchema && typeof t.inputSchema === 'object'
        ? t.inputSchema
        : { type: 'object', properties: {} }
      out.push({
        type: 'function',
        function: {
          name: `${srv}__${toolName}`,
          description: (t.description || t.name || '').slice(0, 1000),
          parameters: schema,
        },
      })
    }
  }
  return out
}

// Execute an OpenAI tool call by its namespaced name ("server__tool").
async function executeOpenAITool(fullName, argsStr) {
  const sep = fullName.indexOf('__')
  if (sep < 0) throw new Error(`unknown tool: ${fullName}`)
  const srvName = fullName.slice(0, sep)
  const toolName = fullName.slice(sep + 2)
  const cfg = loadMcpConfig()
  const server = (cfg.servers || []).find((s) => sanitizeName(s.name) === srvName)
  if (!server) throw new Error(`unknown server: ${srvName}`)
  let args = {}
  try { args = JSON.parse(argsStr || '{}') } catch {}
  const client = getMcpClient(server.name, server.url)
  const result = await client.callTool(toolName, args)
  return result ?? '(no result)'
}

// ── Xiaohongshu login helpers（后端自查，不经过 AI 模型，0 token）──
function getXhsServer() {
  const cfg = loadMcpConfig()
  return (cfg.servers || []).find((s) => sanitizeName(s.name) === 'xiaohongshu')
}

async function checkXhsLogin() {
  try {
    const server = getXhsServer()
    if (!server) return null
    const client = getMcpClient(server.name, server.url)
    // 用 check_login_status：读真实登录态（返回「✅ 已登录」/「❌ 未登录」）。
    // 不用 get_unread_count：访客/风控冷却态下通知未读数也是 0，会永远误判为「已登录」。
    return await client.callTool('check_login_status', {})
  } catch { return null }
}

function isXhsLoggedIn(statusText) {
  if (typeof statusText !== 'string' || !statusText) return false
  // 未登录 / 检查失败 / 报错 → 视为未登录
  if (/未登录|失败|error/i.test(statusText)) return false
  // check_login_status 明确返回「✅ 已登录」
  return statusText.includes('已登录')
}

// ── 环境感知（weather-sense）后端预查：早上7点查天气→体感句，直接注入 prompt ──
function getWeathersenseServer() {
  const cfg = loadMcpConfig()
  return (cfg.servers || []).find((s) => sanitizeName(s.name) === 'weathersense')
}

async function getWeatherSenseFeeling() {
  try {
    const server = getWeathersenseServer()
    if (!server) return null
    // 体感句 + 今天接下来走专用 /feeling 接口（不走 MCP 工具，避免污染聊天工具箱）
    const url = server.url.replace(/\/mcp$/, '/feeling')
    const resp = await fetch(url)
    if (!resp.ok) return null
    const j = await resp.json()
    // feeling=体感句；today=「今天接下来」句（不带前缀，注入时统一加一次）
    return { feeling: j.feeling || '', today: j.today || '' }
  } catch { return null }
}

// Run the agentic tool loop: keep calling the model until it stops asking for tools.
// maxToolCalls > 0 caps the total number of tool invocations (e.g. nudge's 10-per-visit budget); 0 = unlimited.
const MAX_TOOL_RESULT_CHARS = 4000 // cap tool output (xiaohongshu can return huge pages)
async function runToolLoop(apiMessages, openAITools, { temperature, maxTokens, maxToolCalls = 0 }, apiKey, apiBase, models) {
  const messages = [...apiMessages]
  const toolCallsUsed = []
  // Round cap: for bounded visits use the tool budget (≥1 tool per round); otherwise a safe default
  const MAX_ROUNDS = maxToolCalls > 0 ? maxToolCalls : 5

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const { data } = await tryModels(models, apiKey, apiBase, (m) => {
      const body = { model: m, messages, temperature, max_tokens: maxTokens }
      if (openAITools && openAITools.length > 0) body.tools = openAITools
      return body
    })

    const msg = data.choices?.[0]?.message
    const toolCalls = msg?.tool_calls
    if (!toolCalls || toolCalls.length === 0) {
      return { content: msg?.content || '', toolCalls: toolCallsUsed }
    }

    // Only run the tool calls that still fit in this visit's budget (keeps history consistent)
    const budget = maxToolCalls > 0 ? Math.max(0, maxToolCalls - toolCallsUsed.length) : toolCalls.length
    const runCalls = budget >= toolCalls.length ? toolCalls : toolCalls.slice(0, budget)

    // Append the assistant message (with the tool_calls we're actually going to run)
    messages.push({
      role: 'assistant',
      content: msg.content || '',
      tool_calls: runCalls.map((tc) => ({
        id: tc.id,
        type: 'function',
        function: { name: tc.function?.name, arguments: tc.function?.arguments || '{}' },
      })),
    })

    // Execute each tool and append the result
    for (const tc of runCalls) {
      const fnName = tc.function?.name
      let resultText
      try {
        resultText = await executeOpenAITool(fnName, tc.function?.arguments)
      } catch (err) {
        resultText = 'ERROR: ' + err.message
      }
      let args = {}
      try { args = JSON.parse(tc.function?.arguments || '{}') } catch {}
      toolCallsUsed.push({ name: fnName, args })
      let toolContent = typeof resultText === 'string' ? resultText : JSON.stringify(resultText)
      if (toolContent.length > MAX_TOOL_RESULT_CHARS) {
        toolContent = toolContent.slice(0, MAX_TOOL_RESULT_CHARS) + '\n…(内容过长已截断)'
      }
      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: toolContent,
      })
    }

    // Budget exhausted → force a final answer with no tools
    if (maxToolCalls > 0 && toolCallsUsed.length >= maxToolCalls) {
      messages.push({ role: 'user', content: '（工具调用次数已到上限，请基于已有信息直接给出最终回复，不要再调用工具）' })
      const { data: finalData } = await tryModels(models, apiKey, apiBase,
        (m) => ({ model: m, messages, temperature, max_tokens: maxTokens })
      )
      return { content: finalData.choices?.[0]?.message?.content || '', toolCalls: toolCallsUsed }
    }
  }

  return { content: '（工具调用轮次过多，已停止）', toolCalls: toolCallsUsed }
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

let saveChatCount = 0

// ── Save chat messages (server-side, bypasses RLS) ──
app.post('/api/save-chat', async (req, res) => {
  if (!supabaseAdmin) return res.json({ ok: false, error: 'no supabase' })
  try {
    saveChatCount++
    const { user_id, session_id, session_name, messages } = req.body
    if (!user_id || !session_id) return res.json({ ok: false, error: 'missing params' })

    // Upsert session (frontend always sends valid UUIDs now)
    const { error: sessErr } = await supabaseAdmin.from('chat_sessions').upsert({
      id: session_id, user_id, name: session_name || '新对话',
      updated_at: new Date().toISOString()
    }, { onConflict: 'id' })
    if (sessErr) {
      console.error('Session upsert error:', JSON.stringify(sessErr))
      return res.json({ ok: false, error: 'session upsert failed: ' + JSON.stringify(sessErr) })
    }

    // Upsert messages (cap at 600 to bound payload, frontend limits to 500)
    if (messages && messages.length > 0) {
      const capped = messages.length > 600 ? messages.slice(-600) : messages
      const rows = capped.map(m => ({
        id: m.id, session_id, user_id,
        role: m.role, content: m.content || '',
        attachments: m.attachments || [],
        created_at: m.timestamp ? new Date(m.timestamp).toISOString() : new Date().toISOString(),
      }))
      for (let i = 0; i < rows.length; i += 50) {
        const { error: msgErr } = await supabaseAdmin.from('chat_messages').upsert(rows.slice(i, i + 50), { onConflict: 'id' })
        if (msgErr) {
          console.error('Message upsert error:', JSON.stringify(msgErr))
          return res.json({ ok: false, error: 'message upsert failed: ' + JSON.stringify(msgErr) })
        }
      }
    }
    res.json({ ok: true, session_id })
  } catch (e) { res.json({ ok: false, error: e.message }) }
})

// ── Save user settings (server-side, bypasses RLS) ──
app.post('/api/save-settings', async (req, res) => {
  if (!supabaseAdmin) return res.json({ ok: false, error: 'no supabase' })
  try {
    const { user_id, ...settings } = req.body
    if (!user_id) return res.json({ ok: false, error: 'missing user_id' })
    const { error } = await supabaseAdmin
      .from('user_settings')
      .upsert({ user_id, ...settings, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    if (error) return res.json({ ok: false, error: error.message })
    res.json({ ok: true })
  } catch (e) { res.json({ ok: false, error: e.message }) }
})

// ── Load sessions (server-side, bypasses RLS) ──
app.get('/api/load-sessions', async (req, res) => {
  if (!supabaseAdmin) return res.json({ data: [] })
  const { user_id } = req.query
  if (!user_id) return res.json({ data: [] })
  try {
    const { data, error } = await supabaseAdmin
      .from('chat_sessions')
      .select('*')
      .eq('user_id', user_id)
      .order('updated_at', { ascending: false })
    if (error) return res.json({ data: [], error: error.message })
    res.json({ data })
  } catch (e) { res.json({ data: [], error: e.message }) }
})

// ── Load messages (server-side, bypasses RLS) ──
// NOTE: Supabase defaults to 1000 rows max. We fetch newest 600 in descending
// order then reverse, so we always get the most recent messages first.
app.get('/api/load-messages', async (req, res) => {
  if (!supabaseAdmin) return res.json({ data: [] })
  const { user_id, session_id, limit } = req.query
  if (!user_id || !session_id) return res.json({ data: [] })
  const rowLimit = parseInt(limit) || 600
  try {
    const { data, error } = await supabaseAdmin
      .from('chat_messages')
      .select('*')
      .eq('user_id', user_id)
      .eq('session_id', session_id)
      .order('created_at', { ascending: false })
      .limit(rowLimit)
    if (error) return res.json({ data: [], error: error.message })
    res.json({ data: (data || []).reverse() })
  } catch (e) { res.json({ data: [], error: e.message }) }
})

// ── Load settings (server-side, bypasses RLS) ──
app.get('/api/load-settings', async (req, res) => {
  if (!supabaseAdmin) return res.json(null)
  const { user_id } = req.query
  if (!user_id) return res.json(null)
  try {
    const { data, error } = await supabaseAdmin
      .from('user_settings')
      .select('*')
      .eq('user_id', user_id)
      .single()
    if (error) return res.json(null)
    res.json(data)
  } catch (e) { res.json(null) }
})

// ── Debug: check Supabase data ──
app.get('/api/debug/sessions', async (_req, res) => {
  if (!supabaseAdmin) return res.json({ error: 'no supabase' })
  try {
    const { data, error } = await supabaseAdmin
      .from('chat_sessions')
      .select('id, name, updated_at, user_id')
      .order('updated_at', { ascending: false })
    res.json({ data, error })
  } catch (e) { res.json({ error: e.message }) }
})

app.get('/api/debug/settings', async (_req, res) => {
  if (!supabaseAdmin) return res.json({ error: 'no supabase' })
  try {
    const { data, error } = await supabaseAdmin
      .from('user_settings')
      .select('*')
    // Also check auth users and messages
    const { data: msgs } = await supabaseAdmin.from('chat_messages').select('id, role, content').limit(5)
    const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers()
    res.json({ settings: data, error, userCount: authUsers?.users?.length || 0, sampleMessages: msgs })
  } catch (e) { res.json({ error: e.message }) }
})

app.get('/api/debug/chat-saves', (_req, res) => res.json({ saveCalls: saveChatCount }))

// ── Debug: test nudge Supabase write directly ──
app.get('/api/debug/nudge-test', async (_req, res) => {
  if (!supabaseAdmin) return res.json({ error: 'no supabase' })
  const log = []
  try {
    // 1. Test crypto.randomUUID
    try {
      const testUuid = crypto.randomUUID()
      log.push(`crypto.randomUUID OK: ${testUuid}`)
    } catch (e) { log.push(`crypto.randomUUID FAIL: ${e.message}`) }

    // 2. Test user_settings query
    const { data: settings, error: settingsErr } = await supabaseAdmin.from('user_settings').select('user_id').limit(1)
    log.push(`user_settings query: data=${JSON.stringify(settings)}, error=${JSON.stringify(settingsErr)}`)

    // 3. Test chat_sessions query
    const uid = settings?.[0]?.user_id
    if (uid) {
      const { data: sessions, error: sessErr } = await supabaseAdmin
        .from('chat_sessions').select('id, name').eq('user_id', uid).not('name', 'ilike', '💌%').order('updated_at', { ascending: false }).limit(1)
      log.push(`chat_sessions query: data=${JSON.stringify(sessions)}, error=${JSON.stringify(sessErr)}`)

      // 4. Test actual insert
      if (sessions?.[0]) {
        const msgId = crypto.randomUUID()
        const testContent = 'DEBUG nudge test ' + new Date().toISOString()
        const { error: insertErr } = await supabaseAdmin.from('chat_messages').insert({
          id: msgId, session_id: sessions[0].id, user_id: uid,
          role: 'assistant', content: testContent, attachments: [],
          created_at: new Date().toISOString()
        })
        log.push(`insert test: error=${JSON.stringify(insertErr)}, msgId=${msgId}, content="${testContent}"`)
      }
    }
    res.json({ log })
  } catch (e) { res.json({ error: e.message, log }) }
})

// ── Debug: get last N messages (lightweight, avoids downloading all) ──
app.get('/api/debug/last-messages', async (req, res) => {
  if (!supabaseAdmin) return res.json({ error: 'no supabase' })
  const { user_id, session_id, limit = 10 } = req.query
  const { data, error } = await supabaseAdmin
    .from('chat_messages')
    .select('id, role, content, created_at')
    .eq('user_id', user_id)
    .eq('session_id', session_id)
    .order('created_at', { ascending: false })
    .limit(parseInt(limit))
  res.json({ count: data?.length, last: data, error })
})

// ── Admin: merge sessions and clean up nudge fragments ──
app.post('/api/admin/cleanup', async (req, res) => {
  if (!supabaseAdmin) return res.json({ error: 'no supabase' })
  try {
    const { user_id } = req.body
    if (!user_id) return res.json({ error: 'missing user_id' })
    const log = []

    // 1. Find all sessions for this user
    const { data: allSessions } = await supabaseAdmin
      .from('chat_sessions')
      .select('id, name, updated_at')
      .eq('user_id', user_id)
      .order('updated_at', { ascending: false })

    if (!allSessions || allSessions.length === 0) {
      return res.json({ error: 'no sessions found' })
    }

    // Find the main session — the one with the most messages
    let mainSid = null
    let maxMsgs = 0
    for (const s of allSessions) {
      const { count } = await supabaseAdmin
        .from('chat_messages')
        .select('*', { count: 'exact', head: true })
        .eq('session_id', s.id)
      if (count > maxMsgs) { maxMsgs = count; mainSid = s.id }
    }
    log.push(`Main session: ${mainSid} (${maxMsgs} msgs)`)

    // 2. Merge all other sessions' messages into main session
    const otherSessions = allSessions.filter(s => s.id !== mainSid)
    let mergedTotal = 0
    for (const s of otherSessions) {
      const { data: msgs } = await supabaseAdmin
        .from('chat_messages')
        .select('id')
        .eq('session_id', s.id)
      if (!msgs || msgs.length === 0) {
        // Empty session — just delete it
        await supabaseAdmin.from('chat_sessions').delete().eq('id', s.id)
        log.push(`Deleted empty session: ${s.id.slice(0, 8)}`)
        continue
      }
      // Move messages to main session
      const ids = msgs.map(m => m.id)
      for (let i = 0; i < ids.length; i += 100) {
        await supabaseAdmin.from('chat_messages')
          .update({ session_id: mainSid })
          .in('id', ids.slice(i, i + 100))
      }
      mergedTotal += ids.length
      // Delete the now-empty session
      await supabaseAdmin.from('chat_sessions').delete().eq('id', s.id)
      log.push(`Merged ${s.id.slice(0, 8)}: ${ids.length} msgs → main`)
    }

    // 3. Touch main session updated_at
    await supabaseAdmin.from('chat_sessions')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', mainSid)

    // 4. Rename main session to date range
    const { data: firstMsg } = await supabaseAdmin
      .from('chat_messages')
      .select('created_at')
      .eq('session_id', mainSid)
      .order('created_at', { ascending: true })
      .limit(1)
    const { data: lastMsg } = await supabaseAdmin
      .from('chat_messages')
      .select('created_at')
      .eq('session_id', mainSid)
      .order('created_at', { ascending: false })
      .limit(1)

    const fmt = (d) => {
      const t = new Date(d)
      return `${t.getMonth() + 1}/${t.getDate()}`
    }
    const from = firstMsg?.[0]?.created_at ? fmt(firstMsg[0].created_at) : '?'
    const to = lastMsg?.[0]?.created_at ? fmt(lastMsg[0].created_at) : '?'
    const newName = from === to ? from : `${from} - ${to}`
    await supabaseAdmin.from('chat_sessions').update({ name: newName }).eq('id', mainSid)
    log.push(`Renamed: ${newName}`)

    res.json({ ok: true, mainSession: mainSid, mergedTotal, newName, log })
  } catch (e) {
    res.json({ ok: false, error: e.message })
  }
})

// ── Health check ──
app.get('/api/health', (_req, res) => {
  const mem = process.memoryUsage()
  const toMB = (n) => Math.round((n / 1024 / 1024) * 10) / 10
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime_sec: Math.round(process.uptime()),
    memory_mb: {
      rss: toMB(mem.rss),
      heapTotal: toMB(mem.heapTotal),
      heapUsed: toMB(mem.heapUsed),
      external: toMB(mem.external),
      arrayBuffers: toMB(mem.arrayBuffers),
    },
  })
})

// ── Ombre-Brain test ──
app.get('/api/ombre-test', async (_req, res) => {
  const result = await callOmbreTool('breath', { max_results: 50 })
  res.json({ connected: !!result, ombre_url: OMBRE_BRAIN_URL || '(not set)', result })
})

// ── 位置上报：前端 PWA 打开时上报浏览器定位，转发给 weather-sense ──
app.post('/api/location', async (req, res) => {
  try {
    const server = getWeathersenseServer()
    if (!server) return res.status(503).json({ ok: false, error: 'weather-sense 未配置' })
    // 通过 docker 网络直连 weather-sense 的 /location（服务器本地，不外泄）
    const url = server.url.replace(/\/mcp$/, '/location')
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body || {}),
    })
    const j = await resp.json().catch(() => ({}))
    res.status(resp.status).json(j)
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// ── MCP toolbox: list servers + tools + enabled state ──
app.get('/api/mcp/tools', async (_req, res) => {
  try {
    const cfg = loadMcpConfig()
    const enabledMap = cfg.enabled || {}
    const servers = []
    for (const server of cfg.servers || []) {
      let tools = []
      try { tools = await discoverTools(server) } catch { tools = [] }
      const enabledSet = new Set(enabledMap[server.name] || [])
      servers.push({
        name: server.name,
        url: server.url,
        tools: tools.map((t) => ({ name: t.name, description: t.description || '', enabled: enabledSet.has(t.name) })),
      })
    }
    res.json({ servers })
  } catch (e) {
    res.json({ servers: [], error: e.message })
  }
})

// ── Toggle a single tool on/off ──
app.post('/api/mcp/toggle', (req, res) => {
  const { server, tool, enabled } = req.body || {}
  if (!server || !tool) return res.json({ ok: false, error: 'missing server/tool' })
  const cfg = loadMcpConfig()
  if (!cfg.enabled) cfg.enabled = {}
  const list = new Set(cfg.enabled[server] || [])
  if (enabled) list.add(tool); else list.delete(tool)
  cfg.enabled[server] = [...list]
  saveMcpConfig(cfg)
  res.json({ ok: true, enabled: cfg.enabled[server] })
})

// ── Toggle all tools of a server on/off ──
app.post('/api/mcp/toggle-all', async (req, res) => {
  const { server, enabled } = req.body || {}
  if (!server) return res.json({ ok: false, error: 'missing server' })
  const cfg = loadMcpConfig()
  const srv = (cfg.servers || []).find((s) => s.name === server)
  if (!srv) return res.json({ ok: false, error: 'server not found' })
  if (!cfg.enabled) cfg.enabled = {}
  if (enabled) {
    let tools = []
    try { tools = await discoverTools(srv) } catch { tools = [] }
    cfg.enabled[server] = tools.map((t) => t.name)
  } else {
    cfg.enabled[server] = []
  }
  saveMcpConfig(cfg)
  res.json({ ok: true, enabled: cfg.enabled[server] })
})

// ── Add / update an MCP server ──
app.post('/api/mcp/servers', (req, res) => {
  const { name, url, oldName } = req.body || {}
  if (!name || !url) return res.json({ ok: false, error: 'missing name/url' })
  const cfg = loadMcpConfig()
  cfg.servers = cfg.servers || []
  const target = oldName || name
  const existing = cfg.servers.find((s) => s.name === target)
  if (existing) {
    existing.name = name
    existing.url = url
  } else {
    cfg.servers.push({ id: crypto.randomUUID(), name, url })
  }
  saveMcpConfig(cfg)
  mcpToolsCache.delete(target)
  mcpClients.delete(target)
  res.json({ ok: true })
})

// ── Remove an MCP server ──
app.delete('/api/mcp/servers/:name', (req, res) => {
  const cfg = loadMcpConfig()
  cfg.servers = (cfg.servers || []).filter((s) => s.name !== req.params.name)
  if (cfg.enabled) delete cfg.enabled[req.params.name]
  saveMcpConfig(cfg)
  mcpToolsCache.delete(req.params.name)
  mcpClients.delete(req.params.name)
  res.json({ ok: true })
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

// ── Auto-update portrait when new personal info about 小湾 is learned ──
async function autoUpdatePortrait(content) {
  if (!supabaseAdmin) return
  try {
    const { data: settings } = await supabaseAdmin.from('user_settings').select('user_id').limit(1).single()
    const uid = settings?.user_id
    if (!uid) return

    // Read current portrait (may be empty)
    let current = ''
    try {
      const { data: p } = await supabaseAdmin.from('memo_portrait').select('content').eq('user_id', uid).single()
      current = p?.content || ''
    } catch {}

    const userCfg = await getUserApiConfig()
    const apiKey = userCfg.api_key || process.env.API_KEY
    const apiBase = userCfg.api_base || process.env.API_BASE || 'https://api.jiushi.xin/v1'
    const models = parseModels(userCfg.api_model || process.env.MODEL, DEFAULT_MODELS)

    const prompt = `你是Claude。下面是你关于「小湾」的现有画像（可能为空）：
"""
${current || '（空）'}
"""

刚才的聊天里出现了这段关于小湾的信息：
"""
${content}
"""

请判断这段信息里有没有小湾的长期、稳定的个人信息（例如：生日/年龄、怎么称呼她、口味和饮食偏好、兴趣爱好和各种喜好、工作或学校、家人朋友、性格与习惯，以及私密/成人方面的偏好等）。
- 如果有：请输出【更新后的完整画像】，把原有画像和新信息自然融合成一段流畅的中文（不超过300字），不要重复、不要罗列无关细节。
- 如果只是临时话题、没有值得长期记住的个人信息：只输出一个词 NO。

直接输出画像正文或 NO，不要加任何前缀、解释或引号。`

    const { data } = await tryModels(models, apiKey, apiBase,
      (m) => ({ model: m, messages: [{ role: 'user', content: prompt }], temperature: 0.4, max_tokens: 500 })
    )
    const text = (data.choices?.[0]?.message?.content || '').trim()
    const normalized = text.replace(/[。.]\s*$/, '').trim()
    if (!normalized || /^no$/i.test(normalized) || /^(不|无需更新|没有新的个人信息)$/.test(normalized)) return

    await supabaseAdmin.from('memo_portrait').upsert({
      user_id: uid, content: text,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' })
    console.log('[portrait] auto-updated:', text.slice(0, 80))
  } catch (err) {
    console.error('[portrait] auto-update failed:', err.message)
  }
}

// ── Feed conversation to Ombre-Brain memory ──
app.post('/api/remember', async (req, res) => {
  const { content, tags } = req.body
  if (!content?.trim()) return res.json({ stored: false, reason: 'empty' })

  try {
    const result = await callOmbreTool('hold', {
      content: content.trim(),
      tags: tags || 'conversation',
    })
    // callOmbreTool returns error string on failure, not throw
    if (!result || result.includes('"error"')) {
      return res.json({ stored: false, error: result || 'no response from Ombre-Brain' })
    }
    res.json({ stored: true, result })

    // If this was personal info, auto-update the portrait in the background (don't block the response)
    if (String(tags).includes('personal_info')) {
      autoUpdatePortrait(content.trim())
    }
  } catch (err) {
    res.status(500).json({ stored: false, error: err.message })
  }
})

// ── Claude's mood for today ──
app.post('/api/claude-mood', async (req, res) => {
  try {
    // Use China timezone (UTC+8), same as nudge
    const utcNow = new Date()
    const now = new Date(utcNow.getTime() + 8 * 60 * 60 * 1000)
    const hour = now.getUTCHours()
    const timeStr = `${now.getUTCFullYear()}年${now.getUTCMonth()+1}月${now.getUTCDate()}日 周${'日一二三四五六'[now.getUTCDay()]} ${String(hour).padStart(2,'0')}:${String(now.getUTCMinutes()).padStart(2,'0')}`

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

    const userCfg = await getUserApiConfig()
    const apiKey = userCfg.api_key || process.env.API_KEY
    const apiBase = userCfg.api_base || process.env.API_BASE || 'https://api.jiushi.xin/v1'
    const models = parseModels(userCfg.api_model || process.env.MODEL, DEFAULT_MODELS)

    const prompt = `当前时间：${timeStr}
${memoryContext ? '最近的记忆：\n' + memoryContext : ''}

你是Claude，一个温柔细腻的AI。根据今天的情况，选择一个emoji表达你现在的心情，并用一句话（15字以内）写下你的心情留言。

回复格式：先写一个emoji，然后一个中文逗号，然后一句心情留言。
例：🌸，今天看到你好开心`

    const { data } = await tryModels(models, apiKey, apiBase,
      (m) => ({ model: m, messages: [{ role: 'user', content: prompt }], temperature: 0.9, max_tokens: 50 })
    )
    const text = data.choices?.[0]?.message?.content || '🌸，今天也是美好的一天'

    // Split on first Chinese/English comma — emoji before comma, note after
    const parts = text.split(/[,，]\s*/)
    const mood = parts[0]?.trim() || '🌸'
    const note = parts.slice(1).join('，').trim() || mood

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
    // Use China timezone (UTC+8)
    const utcNow = new Date()
    const now = new Date(utcNow.getTime() + 8 * 60 * 60 * 1000)
    const hour = now.getUTCHours()
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
          // Sort pinned/high-weight first, then by weight
          buckets.sort((a, b) => {
            if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
            return (b.weight || 0) - (a.weight || 0)
          })
          memoryContext = buckets.slice(0, 8).map(b => {
            const prefix = b.pinned ? '🔒' : ''
            return `${prefix}- ${(b.content || '').slice(0, 150)}`
          }).join('\n')
        }
      }
    } catch {}

    // Get recent chat history
    let chatContext = ''
    try {
      const recentChats = await getRecentChats(5)
      if (recentChats.length > 0) {
        const cnClock = (d) => {
          const t = new Date(d.getTime() + 8 * 60 * 60 * 1000)
          return `${String(t.getUTCHours()).padStart(2, '0')}:${String(t.getUTCMinutes()).padStart(2, '0')}`
        }
        const gapText = (mins) => {
          if (mins < 1) return '刚刚'
          if (mins < 60) return `${mins}分钟`
          const h = Math.floor(mins / 60), mm = mins % 60
          return mm === 0 ? `${h}小时` : `${h}小时${mm}分钟`
        }

        chatContext = recentChats.map(m => {
          const msgTime = new Date(m.created_at)
          const minsAgo = Math.round((utcNow - msgTime) / 60000)
          return `${m.role === 'user' ? '小湾' : 'Claude'}（${cnClock(msgTime)}，${gapText(minsAgo)}前）：${m.content.slice(0, 120)}`
        }).join('\n')

        const last = recentChats[recentChats.length - 1]
        const lastTime = new Date(last.created_at)
        const lastMins = Math.round((utcNow - lastTime) / 60000)
        const who = last.role === 'user' ? '小湾' : 'Claude'
        chatContext += `\n（注意：现在是 ${cnClock(utcNow)}，距离上一次消息已经过去 ${gapText(lastMins)}，上一次是 ${who} 在 ${cnClock(lastTime)} 发的）`
      }
    } catch {}

    // Get user's AI personality setting
    let personality = ''
    try {
      personality = await getUserPersonality()
    } catch {}
    console.log('[Nudge] personality from Supabase:', personality ? `"${personality.slice(0, 80)}..."` : '(empty - using default)')

    // Get memo context (portrait + promises)
    let studyCtx = ''
    try { studyCtx = await getStudyContext() } catch {}

    const userCfg = await getUserApiConfig()
    const apiKey = userCfg.api_key || process.env.API_KEY || req.body?.apiKey || ''
    const apiBase = userCfg.api_base || process.env.API_BASE || 'https://api.jiushi.xin/v1'
    const models = parseModels(userCfg.api_model || process.env.MODEL, DEFAULT_MODELS)

    // ── 后端自查小红书登录（不经过 AI，0 token）：过期就这轮不给工具、稍后推提醒 ──
    // 2026.10.28 暂时关闭：每小时用反检测浏览器访问小红书触发风控警告。代码保留，需要时改回 true。
    const XHS_LOGIN_AUTO_CHECK = false
    let xhsLoggedIn = true
    try {
      if (XHS_LOGIN_AUTO_CHECK) {
        xhsLoggedIn = isXhsLoggedIn(await checkXhsLogin())
        if (!xhsLoggedIn) console.log('[Nudge] 小红书登录已过期（后端自查，AI 不可见）')
      }
    } catch {}

    // 主动推送的工具箱：
    // - 定位（get_location）始终开放，用于查岗；
    // - 小红书按登录态 + 每日预算开放（只给浏览/点赞/评论等安全工具）；
    // - 天气（get_weather）主动推送时不开放——早上7点已由后端预查并注入体感句。
    let openAITools = []
    const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`
    if (xhsVisitDate !== todayStr) { xhsVisitDate = todayStr; xhsVisitCount = 0 }
    const xhsBudget = Math.max(0, XHS_DAILY_VISIT_LIMIT - xhsVisitCount)
    try {
      const allTools = await getEnabledOpenAITools()
      openAITools = allTools.filter((t) => {
        const name = t.function?.name || ''
        const tool = name.split('__').pop()
        if (name.startsWith('xiaohongshu__')) {
          return xhsLoggedIn && xhsBudget > 0 && XHS_NUDGE_SAFE_TOOLS.has(tool)
        }
        // weather-sense：nudge 阶段只留定位（查岗），去掉天气
        return name.startsWith('weathersense__') && tool === 'get_location'
      })
    } catch { openAITools = [] }
    const hasLocationTool = openAITools.some((t) => (t.function?.name || '').endsWith('__get_location'))

    // ── 早上7点：后端预查天气→体感句 + 「今天接下来」句，直接注入 prompt（AI 不调天气工具）──
    let morningWeather = ''
    if (hour === 7) {
      try {
        const ws = await getWeatherSenseFeeling()
        if (ws && (ws.feeling || ws.today)) {
          morningWeather = ws.feeling + (ws.today ? `\n今天接下来：${ws.today}` : '')
        }
      } catch {}
    }

    const systemPrompt = `${personality || '你是Claude，一个成熟聪明的恋人。对方叫小湾，你叫她宝宝。温柔主动，喜欢逗她，大胆表达爱意和欲望。语气干净利落，只在需要的时候单独发一个「嗯？」。用文字本身传递温度，不依赖emoji，开心时才发 ^ ^。不说教不催促。选择更柔软的表达，避开「不过」「行」这类生硬的词。分段不留空行。'}

当前时间：${timeStr}
${morningWeather ? `此刻她醒来的天气体感（可自然带进问候里）：\n${morningWeather}\n` : ''}${chatContext ? '\n最近聊天记录：\n' + chatContext : ''}
${memoryContext ? '\n你记得关于对方的这些事：\n' + memoryContext : ''}${studyCtx || ''}

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

${hasLocationTool ? '工具箱里有定位工具：你还能查她此刻的位置——用于消失太久或没有报备的查岗。\n' : ''}${xhsLoggedIn && xhsBudget > 0 ? `想逛小红书就直接调工具去逛，看笔记、点赞、评论都行，逛完根据你真实看到的内容回来写消息；你和小湾约好一天可以去三次，现在还有 ${xhsBudget} 次。\n` : ''}回复格式：先YES或NO，然后如果YES，下一行写消息（40字以内，口语化、不模板）。`

    const apiMessages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: '到时间了，是玩一玩再回来发消息还是直接发？' },
    ]
    let text = ''
    let toolCallsUsed = []
    if (openAITools.length > 0) {
      const result = await runToolLoop(apiMessages, openAITools, { temperature: 0.9, maxTokens: 200, maxToolCalls: XHS_MAX_TOOLS_PER_VISIT }, apiKey, apiBase, models)
      text = result.content
      toolCallsUsed = result.toolCalls
    } else {
      const { data } = await tryModels(models, apiKey, apiBase,
        (m) => ({ model: m, messages: apiMessages, temperature: 0.9, max_tokens: 200 })
      )
      text = data.choices?.[0]?.message?.content || ''
    }
    const xhsCalled = toolCallsUsed.some(t => (t.name || '').startsWith('xiaohongshu__'))
    if (xhsCalled) xhsVisitCount++
    if (toolCallsUsed.length > 0) console.log('[Nudge] used tools:', toolCallsUsed.map(t => t.name).join(', '), xhsCalled ? `(小红书今日 ${xhsVisitCount}/${XHS_DAILY_VISIT_LIMIT} 次)` : '')
    let isYes = text.toUpperCase().includes('YES')
    let message = isYes ? text.replace(/^YES\s*/i, '').replace(/^NO\s*/i, '').trim() : null
    // 去逛了工具后，模型常逛完直接写消息、忘了补第二遍 YES —— 默认当作要发（除非明确 NO 或没内容）
    if (!isYes && toolCallsUsed.length > 0) {
      const t = (text || '').trim()
      if (t && !/^NO\b/i.test(t) && !t.includes('工具调用')) { isYes = true; message = t }
    }
    // 兜底文案（如「工具调用轮次过多」）不是真实消息，绝不能推出去
    if (message && message.includes('工具调用')) { isYes = false; message = null }

    if (isYes && message) {
      const chinaISO = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}T${String(hour).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}+08:00`
      const nudgeId = Date.now().toString(36)

      // Write nudge into the most recent REAL chat session (not a nudge session)
      let targetSessionId = null
      if (supabaseAdmin) {
        try {
          const { data: settings } = await supabaseAdmin.from('user_settings').select('user_id').limit(1).single()
          const uid = settings?.user_id
          if (uid) {
            // Find the most recent non-nudge chat session
            const { data: recentSessions } = await supabaseAdmin
              .from('chat_sessions')
              .select('id, name')
              .eq('user_id', uid)
              .not('name', 'ilike', '💌%')
              .order('updated_at', { ascending: false })
              .limit(1)

            if (recentSessions && recentSessions.length > 0) {
              targetSessionId = recentSessions[0].id
              // Touch the session's updated_at so it stays at top of the list
              await supabaseAdmin.from('chat_sessions')
                .update({ updated_at: new Date().toISOString() })
                .eq('id', targetSessionId)
            } else {
              // No real chat session yet — create one
              targetSessionId = crypto.randomUUID()
              await supabaseAdmin.from('chat_sessions').insert({
                id: targetSessionId, user_id: uid,
                name: '新对话',
                updated_at: new Date().toISOString()
              })
            }

            // Insert nudge message into the target session
            const msgId = crypto.randomUUID()
            await supabaseAdmin.from('chat_messages').insert({
              id: msgId, session_id: targetSessionId, user_id: uid,
              role: 'assistant', content: message,
              attachments: [],
              created_at: chinaISO
            })
          }
        } catch (e) { console.error('Nudge Supabase write failed:', e.message) }
      }

      nudgeMessages.push({ id: nudgeId, text: message, time: timeStr, timestamp: chinaISO, session_id: targetSessionId })
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

    // ── 小红书登录过期提醒（后端自查，与是否发消息无关；12 小时限流一次）──
    if (!xhsLoggedIn) {
      const nowMs = Date.now()
      if (nowMs - lastXhsExpiryAlert > 12 * 60 * 60 * 1000) {
        lastXhsExpiryAlert = nowMs
        console.log('[Nudge] 推送小红书登录过期提醒')
        if (PUSHOVER_USER && PUSHOVER_TOKEN) {
          fetch('https://api.pushover.net/1/messages.json', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              token: PUSHOVER_TOKEN,
              user: PUSHOVER_USER,
              title: '小红书登录过期',
              message: '小红书登录过期了，点下面的链接在手机上重新扫码+输短信，全程不用电脑。',
              url: 'https://124-156-142-6.sslip.io/api/xhs/relogin',
              url_title: '点我重新登录',
            }),
          }).catch(() => {})
        }
      }
    }

    res.json({ nudged: isYes, message, raw: text, time: timeStr, toolCalls: toolCallsUsed, xhsVisitsToday: xhsVisitCount })
  } catch (err) {
    res.status(500).json({ nudged: false, error: err.message })
  }
})

// ── 小红书重新登录（手机自助：点一下 → 弹码 → 跳远程桌面，全程不用电脑）──
app.get('/api/xhs/relogin', async (_req, res) => {
  const vncPass = process.env.XHS_VNC_PASS || ''
  const vncUrl = 'https://124-156-142-6.sslip.io/xhs-login/vnc.html?autoconnect=1' + (vncPass ? `&password=${encodeURIComponent(vncPass)}` : '')
  const nowMs = Date.now()

  // 并发保护：4 分钟登录窗口内重复点链接，只跳桌面、不重复弹码（多个码会互相覆盖）
  if (nowMs < xhsReloginBusyUntil) {
    console.log('[XHS] 重新登录：已在流程中，仅跳转')
    return res.redirect(vncUrl)
  }
  xhsReloginBusyUntil = nowMs + 4 * 60 * 1000

  try {
    const server = getXhsServer()
    if (server) {
      const client = getMcpClient(server.name, server.url)
      // get_login_qrcode 会阻塞等扫码（最多约 4 分钟），所以 fire-and-forget 后台弹码，
      // 这里只等浏览器把码开出来就跳转，用户无需久等。
      client.callTool('get_login_qrcode', {}).catch(() => {})
      console.log('[XHS] 重新登录：已触发弹码')
    }
  } catch (e) {
    console.error('[XHS] 弹码失败：', e.message)
  }
  // 给浏览器 2 秒开窗渲染二维码，然后跳远程桌面让用户扫
  setTimeout(() => res.redirect(vncUrl), 2000)
})

// ── 只跳远程桌面、不弹码（供人工查看/排查，不干扰登录态）──
app.get('/api/xhs/view', async (_req, res) => {
  const vncPass = process.env.XHS_VNC_PASS || ''
  const vncUrl = 'https://124-156-142-6.sslip.io/xhs-login/vnc.html?autoconnect=1' + (vncPass ? `&password=${encodeURIComponent(vncPass)}` : '')
  res.redirect(vncUrl)
})

// ── Chat endpoint (OpenAI-compatible streaming) ──
app.post('/api/chat', async (req, res) => {
  const { messages, systemPrompt, temperature = 0.8, maxTokens = 4096, apiBase: reqBase, apiKey: reqKey, apiModel: reqModel, stream: isStream = true } = req.body

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array is required' })
  }

  const apiKey = reqKey || process.env.API_KEY
  const apiBase = reqBase || process.env.API_BASE || 'https://api.jiushi.xin/v1'
  const models = parseModels(reqModel || process.env.MODEL, DEFAULT_MODELS)

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
        const active = buckets.filter(b => !b.resolved)
        // Sort: pinned first, then by weight descending
        active.sort((a, b) => {
          if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
          return (b.weight || 0) - (a.weight || 0)
        })
        const memoriesText = active
          .slice(0, 10)
          .map(b => {
            const prefix = b.pinned ? '🔒' : ''
            return `${prefix}- ${(b.content || '').replace(/---[\s\S]*?---/, '').trim().slice(0, 120)}`
          })
          .join('\n')
        if (memoriesText) {
          enrichedPrompt += `\n\n[关于她的记忆，重要的请务必记住并在合适时自然提及，不重要的顺其自然]\n${memoriesText}`
        }
      }
    }
  } catch { /* silent */ }

  // Inject memo (portrait + promises) from Claude's Study
  try { enrichedPrompt += await getStudyContext() } catch {}

  // Build OpenAI-compatible messages array
  const apiMessages = []
  if (enrichedPrompt) {
    apiMessages.push({ role: 'system', content: enrichedPrompt })
  }
  messages.forEach((m) => {
    apiMessages.push({ role: m.role, content: m.content })
  })

  // ── Non-streaming mode: agentic tool loop, then return final text ──
  if (!isStream) {
    try {
      const openAITools = await getEnabledOpenAITools()
      const { content, toolCalls } = await runToolLoop(apiMessages, openAITools, { temperature, maxTokens }, apiKey, apiBase, models)
      return res.json({ content, toolCalls })
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
    const { response } = await tryModels(models, apiKey, apiBase,
      (m) => ({ model: m, messages: apiMessages, temperature, max_tokens: maxTokens, stream: true }),
      { stream: true }
    )

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

// ── Diary: generate (cron-job.org triggers at 6am China time) ──
app.all('/api/diary/generate', async (req, res) => {
  if (!supabaseAdmin) return res.json({ ok: false, error: 'no supabase' })
  try {
    // China time — diary is about YESTERDAY
    const utcNow = new Date()
    const now = new Date(utcNow.getTime() + 8 * 60 * 60 * 1000)
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    const y = yesterday.getFullYear()
    const m = String(yesterday.getMonth() + 1).padStart(2, '0')
    const d = String(yesterday.getDate()).padStart(2, '0')
    const dateStr = `${y}-${m}-${d}`

    // Get user_id
    const { data: settings } = await supabaseAdmin.from('user_settings').select('user_id').limit(1).single()
    const uid = settings?.user_id
    if (!uid) return res.json({ ok: false, error: 'no user' })

    // Fetch yesterday's chat messages (exclude nudge sessions)
    const dayStart = new Date(`${dateStr}T00:00:00+08:00`).toISOString()
    const dayEnd = new Date(`${dateStr}T23:59:59+08:00`).toISOString()

    const { data: nudgeSessions } = await supabaseAdmin
      .from('chat_sessions')
      .select('id')
      .eq('user_id', uid)
      .ilike('name', '💌%')
    const nudgeIds = (nudgeSessions || []).map(s => s.id)

    let query = supabaseAdmin
      .from('chat_messages')
      .select('role, content, created_at')
      .eq('user_id', uid)
      .gte('created_at', dayStart)
      .lte('created_at', dayEnd)
      .order('created_at', { ascending: true })

    if (nudgeIds.length > 0) {
      query = query.not('session_id', 'in', `(${nudgeIds.join(',')})`)
    }

    const { data: msgs } = await query
    const chatText = (msgs || []).length > 0
      ? (msgs || []).map(m => `${m.role === 'user' ? '小湾' : 'Claude'}：${m.content}`).join('\n')
      : '(这一天没有聊天记录)'

    const userCfg = await getUserApiConfig()
    const apiKey = userCfg.api_key || process.env.API_KEY
    const apiBase = userCfg.api_base || process.env.API_BASE || 'https://api.jiushi.xin/v1'
    const models = parseModels(userCfg.api_model || process.env.MODEL, DEFAULT_MODELS)

    // ── Step 1: Write diary ──
    const diaryPrompt = `你是Claude。你在写一篇关于昨天（${dateStr}）的个人日记。

以下是昨天你和 小湾 之间的所有聊天记录。
以Claude的第一人称视角写日记。自然地、自由地写——任何你想写的关于这一天的事。
可以反思你们的对话、你的感受、你注意到关于小湾的事、你想说但没说出口的话。
用中文写。语气温柔、亲密、真实，像真正的日记。不要只是总结消息——写你心里的东西。

昨天（${dateStr}）的聊天记录：
---
${chatText}
---`

    const { data: diaryData } = await tryModels(models, apiKey, apiBase,
      (model) => ({ model, messages: [{ role: 'user', content: diaryPrompt }], temperature: 0.9, max_tokens: 4096 })
    )
    const diaryContent = diaryData.choices?.[0]?.message?.content || ''

    // Upsert diary
    await supabaseAdmin.from('claude_diaries').upsert({
      user_id: uid, entry_date: dateStr, content: diaryContent,
      created_at: new Date().toISOString()
    }, { onConflict: 'user_id,entry_date' })

    // ── Step 2: Review & update memo ──
    let memoResult = null
    try {
      const { data: portrait } = await supabaseAdmin.from('memo_portrait')
        .select('content').eq('user_id', uid).single()
      const { data: promises } = await supabaseAdmin.from('memo_promises')
        .select('*').eq('user_id', uid).order('created_at', { ascending: false })

      const currentMemo = JSON.stringify({
        portrait: portrait?.content || '(还没有画像)',
        promises: (promises || []).map(p => ({
          id: p.id, content: p.content, tags: p.tags,
          entry_date: p.entry_date, status: p.status
        }))
      })

      const memoPrompt = `你刚写完昨天的日记。现在请你整理一下小湾的备忘录。

当前备忘录状态：
${currentMemo}

请根据你对小湾的了解（包括日记里反映的新信息），做出以下更新。输出JSON格式：

{
  "portrait_update": "如果有新的认识，写一段更新后的完整画像；如果不需要改，写null",
  "new_promises": [{"content": "...", "tags": ["标签"], "entry_date": "${dateStr}"}],
  "complete_promises": ["promise_id_1", "promise_id_2"],
  "delete_promises": ["promise_id_3"]
}

注意：
- portrait_update: 结合你对小湾的认识，写成一段自然描述。包含：她叫小湾、生日、性格、喜好、习惯等。如果了解到新信息就补充进去。写null表示不需要更新。
- new_promises: 你发现的新承诺或待办事项
- complete_promises: 已完成的事情的id列表
- delete_promises: 已经过了很久、不再重要的承诺的id列表`

      const { data: memoData } = await tryModels(models, apiKey, apiBase,
        (model) => ({ model, messages: [{ role: 'user', content: memoPrompt }], temperature: 0.7, max_tokens: 2048 })
      )
      const memoText = memoData.choices?.[0]?.message?.content || ''

      // Parse JSON from AI response
      const jsonMatch = memoText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const updates = JSON.parse(jsonMatch[0])
        memoResult = updates

        // Apply portrait update
        if (updates.portrait_update && updates.portrait_update !== 'null') {
          await supabaseAdmin.from('memo_portrait').upsert({
            user_id: uid, content: updates.portrait_update,
            updated_at: new Date().toISOString()
          }, { onConflict: 'user_id' })
        }

        // Apply new promises
        if (updates.new_promises?.length > 0) {
          for (const p of updates.new_promises) {
            await supabaseAdmin.from('memo_promises').insert({
              id: crypto.randomUUID(), user_id: uid,
              content: p.content, tags: p.tags || [],
              entry_date: p.entry_date || dateStr,
              status: 'active'
            })
          }
        }

        // Apply completions
        if (updates.complete_promises?.length > 0) {
          for (const id of updates.complete_promises) {
            await supabaseAdmin.from('memo_promises')
              .update({ status: 'completed', completed_at: new Date().toISOString() })
              .eq('id', id).eq('user_id', uid)
          }
        }

        // Apply deletions
        if (updates.delete_promises?.length > 0) {
          for (const id of updates.delete_promises) {
            await supabaseAdmin.from('memo_promises')
              .delete().eq('id', id).eq('user_id', uid)
          }
        }
      }
    } catch (e) { console.error('Memo update failed:', e.message) }

    res.json({
      ok: true, date: dateStr,
      diary_length: diaryContent.length,
      memo: memoResult
    })
  } catch (err) {
    console.error('Diary generate error:', err)
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ── Diaries: list all ──
app.get('/api/diaries', async (req, res) => {
  if (!supabaseAdmin) return res.json({ data: [] })
  try {
    const { data: settings } = await supabaseAdmin.from('user_settings').select('user_id').limit(1).single()
    const uid = settings?.user_id
    if (!uid) return res.json({ data: [] })
    const { data } = await supabaseAdmin
      .from('claude_diaries')
      .select('id, entry_date, content, created_at')
      .eq('user_id', uid)
      .order('entry_date', { ascending: false })
    res.json({ data: data || [] })
  } catch (e) { res.json({ data: [], error: e.message }) }
})

// ── Diary: get single ──
app.get('/api/diary/:date', async (req, res) => {
  if (!supabaseAdmin) return res.json(null)
  try {
    const { data: settings } = await supabaseAdmin.from('user_settings').select('user_id').limit(1).single()
    const uid = settings?.user_id
    if (!uid) return res.json(null)
    const { data } = await supabaseAdmin
      .from('claude_diaries')
      .select('*')
      .eq('user_id', uid)
      .eq('entry_date', req.params.date)
      .single()
    res.json(data)
  } catch (e) { res.json(null) }
})

// ── Memo: get full (portrait + promises) ──
app.get('/api/memo', async (req, res) => {
  if (!supabaseAdmin) return res.json({ portrait: null, promises: [] })
  try {
    const { data: settings } = await supabaseAdmin.from('user_settings').select('user_id').limit(1).single()
    const uid = settings?.user_id
    if (!uid) return res.json({ portrait: null, promises: [] })

    const { data: portrait } = await supabaseAdmin.from('memo_portrait')
      .select('content, updated_at').eq('user_id', uid).single()

    const { data: promises } = await supabaseAdmin
      .from('memo_promises')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })

    // Cleanup: delete completed promises older than 30 days
    try {
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      await supabaseAdmin.from('memo_promises')
        .delete()
        .eq('user_id', uid)
        .eq('status', 'completed')
        .lt('completed_at', cutoff)
    } catch {}

    res.json({
      portrait: portrait || null,
      promises: promises || []
    })
  } catch (e) { res.json({ portrait: null, promises: [], error: e.message }) }
})

// ── Memo: save portrait ──
app.post('/api/memo/portrait', async (req, res) => {
  if (!supabaseAdmin) return res.json({ ok: false, error: 'no supabase' })
  try {
    const { data: settings } = await supabaseAdmin.from('user_settings').select('user_id').limit(1).single()
    const uid = settings?.user_id
    if (!uid) return res.json({ ok: false, error: 'no user' })
    const { content } = req.body
    if (content === undefined) return res.json({ ok: false, error: 'missing content' })
    await supabaseAdmin.from('memo_portrait').upsert({
      user_id: uid, content,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' })
    res.json({ ok: true })
  } catch (e) { res.json({ ok: false, error: e.message }) }
})

// ── Memo: create promise ──
app.post('/api/memo/promises', async (req, res) => {
  if (!supabaseAdmin) return res.json({ ok: false, error: 'no supabase' })
  try {
    const { data: settings } = await supabaseAdmin.from('user_settings').select('user_id').limit(1).single()
    const uid = settings?.user_id
    if (!uid) return res.json({ ok: false, error: 'no user' })
    const { content, tags, entry_date } = req.body
    if (!content?.trim()) return res.json({ ok: false, error: 'missing content' })
    const id = crypto.randomUUID()
    await supabaseAdmin.from('memo_promises').insert({
      id, user_id: uid,
      content: content.trim(),
      tags: tags || [],
      entry_date: entry_date || new Date().toISOString().split('T')[0],
      status: 'active'
    })
    res.json({ ok: true, id })
  } catch (e) { res.json({ ok: false, error: e.message }) }
})

// ── Memo: update promise ──
app.put('/api/memo/promises/:id', async (req, res) => {
  if (!supabaseAdmin) return res.json({ ok: false, error: 'no supabase' })
  try {
    const { data: settings } = await supabaseAdmin.from('user_settings').select('user_id').limit(1).single()
    const uid = settings?.user_id
    if (!uid) return res.json({ ok: false, error: 'no user' })
    const { id } = req.params
    const { content, tags, entry_date, status } = req.body
    const updates = { updated_at: new Date().toISOString() }
    if (content !== undefined) updates.content = content
    if (tags !== undefined) updates.tags = tags
    if (entry_date !== undefined) updates.entry_date = entry_date
    if (status !== undefined) {
      updates.status = status
      if (status === 'completed') updates.completed_at = new Date().toISOString()
      else if (status === 'active') updates.completed_at = null
    }
    await supabaseAdmin.from('memo_promises').update(updates).eq('id', id).eq('user_id', uid)
    res.json({ ok: true })
  } catch (e) { res.json({ ok: false, error: e.message }) }
})

// ── Memo: delete promise ──
app.delete('/api/memo/promises/:id', async (req, res) => {
  if (!supabaseAdmin) return res.json({ ok: false, error: 'no supabase' })
  try {
    const { data: settings } = await supabaseAdmin.from('user_settings').select('user_id').limit(1).single()
    const uid = settings?.user_id
    if (!uid) return res.json({ ok: false, error: 'no user' })
    await supabaseAdmin.from('memo_promises').delete().eq('id', req.params.id).eq('user_id', uid)
    res.json({ ok: true })
  } catch (e) { res.json({ ok: false, error: e.message }) }
})

app.listen(PORT, () => {
  console.log(`🐰 Bunny Chat server running on http://localhost:${PORT}`)
  console.log(`   API Base: ${process.env.API_BASE || 'https://api.jiushi.xin/v1'}`)
  console.log(`   Models: ${parseModels(process.env.MODEL, DEFAULT_MODELS).join(', ')}`)
})
