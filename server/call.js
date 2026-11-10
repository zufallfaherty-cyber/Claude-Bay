// ─────────────────────────────────────────────────────────────
// 通话功能（第一版 MVP）
//   打字 → LLM 回复 → ElevenLabs v3 语音 → 前端播放
//   会话状态暂存内存，服务重启即丢；正式版再接 Supabase 表
// ─────────────────────────────────────────────────────────────
import express from 'express'
import crypto from 'crypto'
import OpenCC from 'opencc-js'

const DEFAULT_MODELS = '[CCMAX]claude-opus-5-5,[CCMAX]claude-opus-4-6,[企业按量]claude-opus-5-5,[k]claude-opus-4-6'
const EL_BASE = 'https://api.elevenlabs.io/v1'
const EL_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'RAVSDRorrJLHAFZaJiMu'
const EL_MODEL = process.env.ELEVENLABS_MODEL || 'eleven_v4'

// 内存会话：callId → { sessionId, userId, startedAt, turns, systemPrompt }
const calls = new Map()

function parseModels(input) {
  return (input || DEFAULT_MODELS).split(',').map(m => m.trim()).filter(Boolean)
}

// 语音识别同音错字纠正：只处理明确的专有名词，避免误伤普通词
const STT_HOMOPHONE_FIXES = [
  [/小[弯灣碗婉丸]/g, '小湾'],
  [/克劳[特得]/g, '克劳德'],
  [/埃利奥特|艾略特/g, 'Elliott'],
]
// Whisper 经常输出繁体，先转简体再纠同音
const toSimplified = OpenCC.Converter({ from: 't', to: 'cn' })
function fixSttHomophones(text) {
  if (!text) return text
  let t = toSimplified(text)
  for (const [re, to] of STT_HOMOPHONE_FIXES) t = t.replace(re, to)
  return t
}

// ── 声学特征 → 语气/环境线索（前端在录音时采样，这里是服务端清洗 + 翻译）──
function sanitizeVoiceFeatures(value) {
  if (!value || typeof value !== 'object') return null
  const num = (x, min, max) => {
    const n = Number(x)
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : 0
  }
  return {
    duration_s: num(value.duration_s, 0, 120),
    energy_mean: num(value.energy_mean, 0, 1),
    energy_var: num(value.energy_var, 0, 1),
    noise_floor: num(value.noise_floor, 0, 1),
    pause_ratio: num(value.pause_ratio, 0, 1),
    pitch_mean_hz: num(value.pitch_mean_hz, 0, 600),
    pitch_var: num(value.pitch_var, 0, 300),
    spectral_centroid_hz: num(value.spectral_centroid_hz, 0, 8000),
    zcr_mean: num(value.zcr_mean, 0, 1),
  }
}

function buildToneHint(f, text) {
  if (!f || !f.duration_s) return ''
  const db = (rms) => (rms > 1e-6 ? 20 * Math.log10(rms) : -90)
  const hints = []
  const edb = db(f.energy_mean)
  const fdb = db(f.noise_floor)

  // 音量
  if (edb < -47) hints.push('声音极轻，几乎是气声或耳语')
  else if (edb < -39) hints.push('声音比平时小，放得很轻')
  else if (edb > -10) hints.push('声音很响亮')

  // 节奏 / 停顿
  if (f.pause_ratio > 0.5) hints.push('停顿很多，断断续续，像在犹豫或没什么力气')
  else if (f.pause_ratio > 0.35) hints.push('中间停顿偏多')
  else if (f.pause_ratio < 0.08 && f.duration_s > 2) hints.push('几乎一口气说完，很连贯')

  // 语速（用转写字数 / 时长粗估）
  const chars = (text || '').replace(/\s/g, '').length
  const cps = chars / Math.max(f.duration_s, 0.8)
  if (cps > 6.5) hints.push('语速明显偏快')
  else if (chars > 2 && cps < 2.2) hints.push('说得比较慢')

  // 音高 / 起伏
  if (f.pitch_var > 45) hints.push('音调起伏大，情绪外露（撒娇、兴奋或委屈都可能）')
  else if (f.pitch_var > 0 && f.pitch_var < 12 && f.duration_s > 2) hints.push('音调平稳，情绪收敛')
  if (f.pitch_mean_hz > 280) hints.push('整体音高偏高')

  // 音色（粗略倾向，不是声纹识别）：音区 + 亮度 + 气声
  if (f.pitch_mean_hz > 0) {
    if (f.pitch_mean_hz < 120) hints.push('音区很低，声音压得比较沉')
    else if (f.pitch_mean_hz > 300) hints.push('音区偏高，声音比较细')
  }
  if (f.spectral_centroid_hz > 0) {
    if (f.spectral_centroid_hz < 1100) hints.push('音色偏低沉、偏厚')
    else if (f.spectral_centroid_hz > 2800) hints.push('音色清亮、偏尖')
  }
  if (f.zcr_mean > 0.16) hints.push('声音带明显气声或沙哑感')

  // 环境：底噪离说话音量太近 → 房间里不安静
  if (fdb > -50 && edb - fdb < 9) hints.push('周围环境有点吵，不像安静的室内')

  return hints.join('；')
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
- 她有时开口说话（语音转的文字），有时打字。消息前面的标注会告诉你，别搞混：打字来的不能夸她声音好听。
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

async function synthesize(text, attempt = 0) {
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
    // ElevenLabs 偶尔 200 但音频几乎是空的，前端会表现为「有字幕没声音」
    if (buf.length < 800) {
      console.warn(`[Call] TTS 音频异常（${buf.length} bytes），${attempt < 1 ? '重试' : '放弃'}`)
      if (attempt < 1) return synthesize(text, attempt + 1)
      return null
    }
    return buf.toString('base64')
  } catch (err) {
    console.warn('[Call] TTS 网络错误:', err.message)
    if (attempt < 1) return synthesize(text, attempt + 1)
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
      const systemPrompt = buildCallPrompt(context)
      const call = {
        sessionId: req.body?.sessionId || null,
        userId: context.userId,
        startedAt: Date.now(),
        turns: [],
        systemPrompt,
      }
      calls.set(callId, call)

      // 会话超过 2 小时自动清理，防止内存泄漏
      setTimeout(() => calls.delete(callId), 2 * 60 * 60 * 1000).unref?.()

      // 接通第一句由他主动说：按上下文现生成，不用固定台词
      let reply = null
      try {
        const cfg = await getUserApiConfig(supabaseAdmin)
        const apiKey = cfg.api_key || process.env.API_KEY
        const apiBase = cfg.api_base || process.env.API_BASE || 'https://api.jiushi.xin/v1'
        if (apiKey) {
          const raw = await callLLM([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: '（电话刚接通，她还没出声。你先开口。第一句要短、自然，像真的接起电话——可以逗逗她，表达想念，或者只是叫一声她的名字。不要寒暄套话。）' },
          ], { apiKey, apiBase, models: parseModels(cfg.api_model || process.env.MODEL) })
          const r = parseReply(raw)
          if (r) {
            r.en = enforceShort(r.en)
            const display = stripTags(r.en)
            call.turns.push({ role: 'assistant', content: display })
            const audio = await synthesize(r.en)
            reply = { en: r.en, display, zh: r.zh, audio }
          }
        }
      } catch (err) {
        console.warn('[Call] 开场生成失败:', err.message)
      }

      res.json({ callId, reply })
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

      const via = req.body?.via === 'voice' ? 'voice' : 'text'
      const toneHint = typeof req.body?.toneHint === 'string'
        ? req.body.toneHint.replace(/\s+/g, ' ').trim().slice(0, 200)
        : ''
      call.turns.push({ role: 'user', content: String(text).trim(), via, toneHint })
      const messages = [
        { role: 'system', content: call.systemPrompt },
        ...call.turns.map(t => {
          if (!t.via) return { role: t.role, content: t.content }
          const prefix = t.via === 'voice' ? '（她开口说的，语音转成的文字' : '（她打字发的'
          const hint = t.toneHint
            ? `\n[语音语气线索：${t.toneHint}。这是麦克风测出来的线索，用来体会她此刻的状态；不要复述，也不要提到“线索/测量/音高”这些词，自然回应她的语气就好]`
            : ''
          return { role: t.role, content: `${prefix}）${t.content}${hint}` }
        }),
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

    // 兜底转写：ElevenLabs Scribe
    async function scribeTranscribe() {
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
      return d.text || ''
    }

    try {
      // 香港直连 Groq 会被地区封锁，优先走 GROQ_PROXY_URL（Vercel /api/groq-stt）；
      // 没有代理时仍可直连（本地/其他地区），两者都失败才退回 Scribe。
      const groqProxy = process.env.GROQ_PROXY_URL
      const groqKey = process.env.GROQ_API_KEY
      let text = ''
      let groqFailed = false

      if (groqProxy || groqKey) {
        try {
          let r
          if (groqProxy) {
            r = await fetch(groqProxy, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ audioBase64: buf.toString('base64'), mimeType }),
            })
          } else {
            const fd = new FormData()
            fd.append('file', new Blob([buf], { type: mimeType }), 'audio.m4a')
            fd.append('model', 'whisper-large-v3-turbo')
            fd.append('response_format', 'json')
            r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
              method: 'POST',
              headers: { Authorization: `Bearer ${groqKey}` },
              body: fd,
            })
          }
          const d = await r.json().catch(() => ({}))
          if (!r.ok) throw new Error(d.error?.message || d.error || `Groq STT ${r.status}`)
          text = d.text || ''
        } catch (e) {
          // Groq 不可用（被封/限流/欠费）时自动退回 Scribe，不让整次转写失败
          console.warn('[Call] Groq 转写失败，退回 Scribe:', e.message)
          groqFailed = true
        }
      }

      if ((!groqProxy && !groqKey) || groqFailed) text = await scribeTranscribe()

      text = fixSttHomophones(text.trim())
      if (!text) return res.status(422).json({ error: '没听清，再说一次？' })
      const features = sanitizeVoiceFeatures(req.body?.features)
      res.json({ text, toneHint: buildToneHint(features, text) })
    } catch (err) {
      console.error('[Call] transcribe failed:', err)
      res.status(500).json({ error: err.message })
    }
  })

  // 挂断：让模型写一段旁白总结，存成一条居中的「通话记录」
  router.post('/end', async (req, res) => {
    const { callId } = req.body || {}
    const call = calls.get(callId)
    if (!call) return res.json({ ok: true })
    calls.delete(callId)

    try {
      const seconds = Math.round((Date.now() - call.startedAt) / 1000)
      const minutes = Math.max(1, Math.round(seconds / 60))

      const transcript = call.turns.map(t => {
        if (t.role === 'assistant') return `Claude：${t.content}`
        return `小湾${t.via === 'voice' ? '（开口说）' : '（打字）'}：${t.content}`
      }).join('\n')

      let body = ''
      if (transcript) body = await summarizeCall(transcript, minutes)

      if (supabaseAdmin && call.userId) {
        // 没有 sessionId 就落到最近的会话里，避免写进不存在的 session
        let sid = call.sessionId
        if (!sid) {
          const { data } = await supabaseAdmin.from('chat_messages')
            .select('session_id')
            .eq('user_id', call.userId)
            .order('created_at', { ascending: false })
            .limit(1)
          sid = data?.[0]?.session_id || null
        }
        if (!sid) return res.json({ ok: true })
        const { error } = await supabaseAdmin.from('chat_messages').insert({
          id: crypto.randomUUID(),
          session_id: sid,
          user_id: call.userId,
          role: 'assistant',
          content: `📞 通话 ${minutes} 分钟\n${body || '你们聊了一会儿。'}`,
          created_at: new Date().toISOString(),
        })
        if (error) console.warn('[Call] 写回聊天失败:', error.message)
      } else {
        console.warn('[Call] 跳过写回：userId=', call.userId)
      }
    } catch (err) {
      console.warn('[Call] 写回聊天失败:', err.message)
    }
    res.json({ ok: true })
  })

  // 通话旁白：第三人称、2-3 句中文
  // 和记忆库的记忆总结一样，优先交给 DeepSeek 写；没配置就回退到聊天主模型
  async function summarizeCall(transcript, minutes) {
    const messages = [
      {
        role: 'system',
        content: `你在整理一通电话的通话记录，是小湾和 Claude 双方都能看到的记录，像助手做的小结，不是写小说。
- 主语直接用「小湾」和「Claude」，不要用「你」「他」「她」代替。
- 2-6 句，平实、具体：聊了什么话题、小湾当时的状态和情绪、Claude 给了什么回应或安排。
- 句子要连贯，别每句都用名字开头，该合并就合并。
- 不要文学化描写，不要比喻、抒情。
- 通话时长会单独显示，正文不要重复。
- 不要 emoji、小标题、「总结」这类词，不要用引号引用原话。
- 只输出正文这几句话。`,
      },
      {
        role: 'user',
        content: `通话大约 ${minutes} 分钟。对话如下：\n${transcript.slice(0, 3000)}`,
      },
    ]

    const dsKey = process.env.DEEPSEEK_API_KEY
    if (dsKey) {
      try {
        const raw = await callLLM(messages, {
          apiKey: dsKey,
          apiBase: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',
          models: [process.env.DEEPSEEK_MODEL || 'deepseek-chat'],
          temperature: 0.7,
          maxTokens: 260,
        })
        return String(raw || '').trim().replace(/^["「]|["」]$/g, '')
      } catch (err) {
        console.warn('[Call] DS 旁白失败，回退主模型:', err.message)
      }
    }

    try {
      const cfg = await getUserApiConfig(supabaseAdmin)
      const apiKey = cfg.api_key || process.env.API_KEY
      const apiBase = cfg.api_base || process.env.API_BASE || 'https://api.jiushi.xin/v1'
      if (!apiKey) return ''
      const raw = await callLLM(messages, { apiKey, apiBase, models: parseModels(cfg.api_model || process.env.MODEL), temperature: 0.7, maxTokens: 260 })
      return String(raw || '').trim().replace(/^["「]|["」]$/g, '')
    } catch (err) {
      console.warn('[Call] 旁白生成失败:', err.message)
      return ''
    }
  }

  return router
}

async function getUserApiConfig(supabaseAdmin) {
  if (!supabaseAdmin) return {}
  try {
    const { data } = await supabaseAdmin.from('user_settings').select('api_model, api_key, api_base').limit(1)
    return data?.[0] || {}
  } catch { return {} }
}
