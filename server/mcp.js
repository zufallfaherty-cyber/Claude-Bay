// ── Generic MCP client (JSON-RPC 2.0 over HTTP, SSE responses) ──
// Works with any MCP server using the "Streamable HTTP" transport, e.g.:
//   - Ombre-Brain (memory):  http://baymemory:8000/mcp
//   - xiaohongshu-mcp:       http://xhs-mcp:18061/mcp
import fs from 'node:fs'
import path from 'node:path'

// 单次 MCP 请求超时。工具卡死（如小红书发帖的浏览器自动化）时，
// 不能让聊天请求永远挂着——超时后返回错误文本给模型继续。
const MCP_TIMEOUT_MS = Number(process.env.MCP_TIMEOUT_MS || 150000)

function parseSSEResponse(text) {
  const lines = text.split('\n')
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      try { return JSON.parse(line.substring(6)) } catch { /* skip */ }
    }
  }
  try { return JSON.parse(text) } catch { return null }
}

export function createMcpClient(endpoint) {
  let sessionId = null
  let callId = 0

  async function request(method, params, { notify = false } = {}) {
    const headers = {
      'Content-Type': 'application/json; charset=utf-8',
      'Accept': 'application/json, text/event-stream',
    }
    if (sessionId) headers['Mcp-Session-Id'] = sessionId
    const body = { jsonrpc: '2.0', method }
    if (!notify) body.id = ++callId
    if (params !== undefined) body.params = params
    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(MCP_TIMEOUT_MS),
    })
    const sid = res.headers.get('mcp-session-id')
    if (sid) sessionId = sid
    const text = await res.text()
    return parseSSEResponse(text)
  }

  async function init() {
    try {
      await request('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'bunny-chat', version: '1.0' },
      })
      await request('notifications/initialized', undefined, { notify: true })
      return true
    } catch (err) {
      sessionId = null
      return false
    }
  }

  // Call a tool. Mirrors the original Ombre-Brain client semantics:
  // returns joined text content on success, a JSON string otherwise, null on failure.
  async function callTool(toolName, args = {}, retry = true) {
    try {
      if (!sessionId) { const ok = await init(); if (!ok) return null }
      const parsed = await request('tools/call', { name: toolName, arguments: args })
      if (parsed?.result?.content) {
        return parsed.result.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n')
      }
      const errStr = typeof parsed === 'string' ? parsed : JSON.stringify(parsed)
      if (retry && (errStr.includes('Session not found') || errStr.includes('session'))) {
        sessionId = null
        return callTool(toolName, args, false)
      }
      return parsed ? JSON.stringify(parsed) : null
    } catch (err) {
      sessionId = null
      const isTimeout = err?.name === 'TimeoutError' || /timeout|timed out|aborted/i.test(err?.message || '')
      // 超时不重试（否则又会再等一轮），直接把错误交给模型
      if (isTimeout) return `ERROR: 工具 ${toolName} 超时（${Math.round(MCP_TIMEOUT_MS / 1000)}秒未返回）`
      if (retry) return callTool(toolName, args, false)
      return null
    }
  }

  async function listTools() {
    try {
      if (!sessionId) { const ok = await init(); if (!ok) return [] }
      const parsed = await request('tools/list', {})
      return parsed?.result?.tools || []
    } catch {
      sessionId = null
      return []
    }
  }

  return { init, callTool, listTools }
}

// ── Config file: MCP server list + enabled tools ──
const CONFIG_PATH = process.env.MCP_CONFIG_PATH || './mcp-config.json'

export function loadMcpConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8')
    const cfg = JSON.parse(raw)
    if (cfg && typeof cfg === 'object' && Array.isArray(cfg.servers)) {
      return { servers: cfg.servers, enabled: cfg.enabled || {} }
    }
  } catch { /* missing or corrupt → fresh */ }
  return { servers: [], enabled: {} }
}

export function saveMcpConfig(cfg) {
  try {
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true })
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2))
    return true
  } catch (err) {
    console.error('[mcp] save config failed:', err.message)
    return false
  }
}
