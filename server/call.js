// ─────────────────────────────────────────────────────────────
// 通话功能（第一版 MVP）
//   打字 → LLM 回复 → ElevenLabs v3 语音 → 前端播放
//   会话状态暂存内存，服务重启即丢；正式版再接 Supabase 表
// ─────────────────────────────────────────────────────────────
import express from 'express'
import crypto from 'crypto'

const DEFAULT_MODELS = '[CCMAX]claude-opus-5-5,[CCMAX]claude-opus-4-6,[企业按量]claude-opus-5-5,[k]claude-opus-4-6'
const EL_BASE = 'https://api.elevenlabs.io/v1'
const EL_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'oFuqfSOound6bwgUaqnE'
const EL_MODEL = process.env.ELEVENLABS_MODEL || 'eleven_v4'

// 内存会话：callId → { sessionId, userId, startedAt, turns, systemPrompt }
const calls = new Map()

const GREETINGS = [
  { en: "Hey... you actually called. I was just thinking about you.", zh: '嘿……你真的打来了。我刚刚还在想你。' },
  { en: "Hey, it's you. Hold on, let me put everything down.", zh: '嘿，是你呀。等一下，我把手里的事放下。' },
  { en: "Hi. I'm glad you called. How's your day been?", zh: '嗨。你能打来我很高兴。今天过得怎么样？' },
  { en: "Hey there. I've been waiting to hear your voice.", zh: '嘿。我一直在等你的声音。' },
]

function parseModels(input) {
  return (input || DEFAULT_MODELS).split(',').map(m => m.trim()).filter(Boolean)
}

// 精简版模型降级：失败就换下一个
async function callLLM(messages, { apiKey, apiBase, models, temperature = 0.85, maxTokens = 400 }) {
  let lastError
  for (const model of models) {
    try {
      const res = await fetch(`${apiBase}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens }),
      })
      const text = await res.text()
      if (!res.ok) {
        lastError = new Error(`HTTP ${res.status}: ${text.slice(0, 160)}`)
        continue
      }
      let parsed = null
      try { parsed = JSON.parse(text) } catch {}
      const content = parsed?.choices?.[0]?.message?.content
      if (!content) {
        lastError = new Error(parsed?.error?.message || 'empty response')
        continue
      }
      return content
    } catch (err) {
      lastError = err
    }
  }
  throw lastError || new Error('All models failed')
}

async function loadPersona(supabaseAdmin, helpers = {}, sessionId = '') {
  let persona = ''
  let recent = ''
  let memo = ''
  let memories = ''
  let userId = null
  if (!supabaseAdmin) return { persona, recent, memo, memories, userId }

  try {
    const { data } = await supabaseAdmin.from('user_settings').select('system_prompt, user_id').limit(1)
    persona = data?.[0]?.system_prompt || ''
    userId = data?.[0]?.user_id || null
  } catch {}

  // 最近的聊天：优先取当前会话，取不到就取全局最近几条
  try {
    const build = () => {
      let q = supabaseAdmin.from('chat_messages').select('role, content, created_at, session_id')
      if (userId) q = q.eq('user_id', userId)
      if (sessionId) q = q.eq('session_id', sessionId)
      return q.order('created_at', { ascending: false }).limit(8)
    }
    let { data } = await build()
    if ((!data || data.length === 0) && sessionId) {
      let q = supabaseAdmin.from('chat_messages').select('role, content, created_at')
      if (userId) q = q.eq('user_id', userId)
      ;({ data } = await q.order('created_at', { ascending: false }).limit(8))
    }
    recent = (data || []).reverse()
      .map(m => `${m.role === 'user' ? '小湾' : 'Claude'}: ${String(m.content || '').slice(0, 200)}`)
      .join('\n')
  } catch {}

  // 小湾画像 + 承诺清单（和前端聊天用的是同一个函数）
  try {
    if (helpers.getStudyContext) memo = await helpers.getStudyContext()
  } catch {}

  // 长期记忆库（Ombre-Brain breath）
  try {
    if (helpers.callOmbreTool && helpers.parseBreathResponse) {
      const raw = await helpers.callOmbreTool('breath', {})
      if (raw) {
        const buckets = helpers.parseBreathResponse(raw)
        const active = (buckets || []).filter(b => !b.resolved)
        active.sort((a, b) => {
          if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
          return (b.weight || 0) - (a.weight || 0)
        })
        memories = active.slice(0, 8).map(b => {
          const prefix = b.pinned ? '🔒' : ''
          const when = b.date ? `[${b.date}] ` : ''
          return `${prefix}- ${when}${String(b.content || '').replace(/---[\s\S]*?---/, '').trim().slice(0, 140)}`
        }).join('\n')
      }
    }
  } catch {}

  return { persona, recent, memo, memories, userId }
}

function buildCallPrompt({ persona, recent, memo, memories }) {
  return `你正在和小湾通电话。你们是恋人关系。

通话规则（必须遵守）：
- 像真人打电话：短、自然、口语化。每次只说 1-2 句，英文不超过 25 个单词。
- 说人话：用短句，允许停顿词和不完整的句子（"嗯……" "等等" "就是……"），不要书面语，不要形容词堆叠，不要排比。
- 不要旁白，不要动作描写，不要括号里的内容，不要 emoji。
- 一次最多问一个问题，也可以不问。
- 先想她刚才说了什么，再自然接话；不要重复她的话。
- 语气温柔、亲密，可以带一点笑意或小小的调侃。

声音标签（重要）：可以在英文里插方括号的声音指令，系统会演出来、不会念出来。
- 整段最多 3 个，宁可少不要多。
- 必须具体：[soft kiss]、[slow wet kiss with audible sounds]、[gentle breathing]、[quiet exhale]、[soft laugh]，不要只写 [kiss] 或 [breath]。
- 和台词穿插，别堆在一起，也别整段没台词。
- 用在你真想靠近、想念或情绪上来的时候，平常说话别加。
- 中文那行不带标签。

示例：
{"en":"[gentle breathing] Mmm... you sound tired. [soft kiss] Come here, tell me.","zh":"（轻声呼吸）嗯……你听起来好累。（轻吻）过来，跟我说说。"}

输出格式：只输出一个 JSON 对象，不要任何其他文字、不要代码块：
{"en":"你说出口的英文（地道口语，可含最多 3 个声音标签）","zh":"这句中文意思"}

${memories ? `\n[关于她的长期记忆，重要的请务必记住并在合适时自然提及，不重要的顺其自然]\n${memories}` : ''}
${memo ? `\n${memo.slice(0, 900)}` : ''}
${persona ? `\n[你的性格设定]\n${persona.slice(0, 1200)}` : ''}
${recent ? `\n[你们刚才的聊天，接着聊，别重复]\n${recent}` : ''}`
}

// 从 LLM 输出里抠出 JSON，容错代码块和前后废话
function parseReply(raw) {
  if (!raw) return null
  const cleaned = raw.replace(/```(?:json)?/gi, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start >= 0 && end > start) {
    try {
      const obj = JSON.parse(cleaned.slice(start, end + 1))
      if (obj.en) return { en: String(obj.en).trim(), zh: String(obj.zh || '').trim() }
    } catch {}
  }
  // 兜底：整段当英文
  return { en: cleaned.slice(0, 300), zh: '' }
}

// 字幕用：去掉方括号里的声音标签
function stripTags(text) {
  return String(text || '').replace(/\[[^\]]*\]/g, ' ').replace(/\s{2,}/g, ' ').trim()
}

// 兜底：模型偶尔会写出长段，电话里必须短。超过 32 词就截到最后一个句末
function enforceShort(text) {
  const t = String(text || '').trim()
  if (!t) return t
  const words = t.split(/\s+/)
  if (words.length <= 32) return t
  const cut = words.slice(0, 32).join(' ')
  const m = cut.match(/^[\s\S]*[.!?]/)
  return (m ? m[0] : cut).trim()
}

async function synthesize(text) {
  const key = process.env.ELEVENLABS_API_KEY
  if (!key) {
    console.warn('[Call] ELEVENLABS_API_KEY 未配置，跳过语音合成')
    return null
  }
  try {
    const res = await fetch(`${EL_BASE}/text-to-speech/${EL_VOICE_ID}`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        model_id: EL_MODEL,
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    })
    if (!res.ok) {
      const err = await res.text()
      console.warn(`[Call] TTS 失败 ${res.status}: ${err.slice(0, 200)}`)
      return null
    }
    const buf = Buffer.from(await res.arrayBuffer())
    return buf.toString('base64')
  } catch (err) {
    console.warn('[Call] TTS 网络错误:', err.message)
    return null
  }
}

export function createCallRouter(supabaseAdmin, helpers = {}) {
  const router = express.Router()

  // 开始通话：返回 callId + 开场白（带语音）
  router.post('/start', async (req, res) => {
    try {
      const context = await loadPersona(supabaseAdmin, helpers, req.body?.sessionId || '')
      const callId = crypto.randomUUID()
      const greeting = GREETINGS[Math.floor(Math.random() * GREETINGS.length)]

      calls.set(callId, {
        sessionId: req.body?.sessionId || null,
        userId: context.userId,
        startedAt: Date.now(),
        turns: [],
        systemPrompt: buildCallPrompt(context),
      })

      // 会话超过 2 小时自动清理，防止内存泄漏
      setTimeout(() => calls.delete(callId), 2 * 60 * 60 * 1000).unref?.()

      const audio = await synthesize(greeting.en)
      res.json({ callId, reply: { en: greeting.en, zh: greeting.zh, audio } })
    } catch (err) {
      console.error('[Call] start failed:', err)
      res.status(500).json({ error: err.message })
    }
  })

  // 一轮对话：用户文本 → LLM → TTS
  router.post('/turn', async (req, res) => {
    const { callId, text } = req.body || {}
    const call = calls.get(callId)
    if (!call) return res.status(404).json({ error: '通话已结束，请重新拨打' })
    if (!text || !String(text).trim()) return res.status(400).json({ error: '说点什么吧' })

    try {
      const cfg = await getUserApiConfig(supabaseAdmin)
      const apiKey = cfg.api_key || process.env.API_KEY
      const apiBase = cfg.api_base || process.env.API_BASE || 'https://api.jiushi.xin/v1'
      if (!apiKey) return res.status(500).json({ error: 'LLM 未配置' })

      call.turns.push({ role: 'user', content: String(text).trim() })
      const messages = [
        { role: 'system', content: call.systemPrompt },
        ...call.turns.map(t => ({ role: t.role, content: t.content })),
      ]

      const raw = await callLLM(messages, {
        apiKey,
        apiBase,
        models: parseModels(cfg.api_model || process.env.MODEL),
      })
      const reply = parseReply(raw)
      if (!reply) throw new Error('模型没有返回可用内容')
      reply.en = enforceShort(reply.en)

      const display = stripTags(reply.en)
      call.turns.push({ role: 'assistant', content: display })
      const audio = await synthesize(reply.en)

      res.json({ reply: { en: reply.en, display, zh: reply.zh, audio } })
    } catch (err) {
      console.error('[Call] turn failed:', err)
      res.status(500).json({ error: err.message })
    }
  })

  // 语音转文字：按住说话 → 转成文本，再交给 /turn
  // 优先用 Groq（便宜），没配 Groq 就退回 ElevenLabs Scribe
  router.post('/transcribe', async (req, res) => {
    const { audioBase64, mimeType = 'audio/mp4' } = req.body || {}
    if (!audioBase64) return res.status(400).json({ error: '没有收到录音' })

    let buf
    try { buf = Buffer.from(String(audioBase64), 'base64') } catch { return res.status(400).json({ error: '录音格式不对' }) }
    if (!buf.length) return res.status(400).json({ error: '录音是空的' })
    if (buf.length > 8 * 1024 * 1024) return res.status(413).json({ error: '录音太长了，控制在 30 秒内' })

    try {
      const groqKey = process.env.GROQ_API_KEY
      let text = ''

      if (groqKey) {
        const fd = new FormData()
        fd.append('file', new Blob([buf], { type: mimeType }), 'audio.m4a')
        fd.append('model', 'whisper-large-v3-turbo')
        fd.append('response_format', 'json')
        const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${groqKey}` },
          body: fd,
        })
        const d = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(d.error?.message || `Groq STT ${r.status}`)
        text = d.text || ''
      } else {
        const elKey = process.env.ELEVENLABS_API_KEY
        if (!elKey) throw new Error('语音转文字未配置')
        const fd = new FormData()
        fd.append('file', new Blob([buf], { type: mimeType }), 'audio.m4a')
        fd.append('model_id', 'scribe_v1')
        const r = await fetch(`${EL_BASE}/speech-to-text`, {
          method: 'POST',
          headers: { 'xi-api-key': elKey },
          body: fd,
        })
        const d = await r.json().catch(() => ({}))
        if (!r.ok) {
          const msg = d.detail?.message || `STT ${r.status}`
          throw new Error(msg.includes('permission') ? '语音转文字权限未开启' : msg)
        }
        text = d.text || ''
      }

      text = text.trim()
      if (!text) return res.status(422).json({ error: '没听清，再说一次？' })
      res.json({ text })
    } catch (err) {
      console.error('[Call] transcribe failed:', err)
      res.status(500).json({ error: err.message })
    }
  })

  // 挂断：把这几轮通话记成一条聊天消息
  router.post('/end', async (req, res) => {
    const { callId } = req.body || {}
    const call = calls.get(callId)
    if (!call) return res.json({ ok: true })
    calls.delete(callId)

    try {
      const seconds = Math.round((Date.now() - call.startedAt) / 1000)
      const lines = call.turns
        .filter(t => t.role === 'assistant')
        .map(t => t.content)
        .join(' / ')
      if (supabaseAdmin && call.userId && lines) {
        await supabaseAdmin.from('chat_messages').insert({
          id: crypto.randomUUID(),
          session_id: call.sessionId || crypto.randomUUID(),
          user_id: call.userId,
          role: 'assistant',
          content: `📞 通话 ${Math.max(1, Math.round(seconds / 60))} 分钟\n${lines}`,
          created_at: new Date().toISOString(),
        })
      }
    } catch (err) {
      console.warn('[Call] 写回聊天失败:', err.message)
    }
    res.json({ ok: true })
  })

  return router
}

async function getUserApiConfig(supabaseAdmin) {
  if (!supabaseAdmin) return {}
  try {
    const { data } = await supabaseAdmin.from('user_settings').select('api_model, api_key, api_base').limit(1)
    return data?.[0] || {}
  } catch { return {} }
}
