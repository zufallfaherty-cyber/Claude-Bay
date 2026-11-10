// POST /api/groq-stt
// 为什么需要它：香港服务器直连 api.groq.com 会被 Cloudflare 按地区 403。
// 这个函数跑在 Vercel（美国），只负责把音频转给 Groq Whisper 再把文字带回来。
// GROQ_API_KEY 配在 Vercel 项目的环境变量里，不进代码仓库。
export const config = { maxDuration: 30 }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const key = process.env.GROQ_API_KEY
  if (!key) return res.status(500).json({ error: 'GROQ_API_KEY 未配置' })

  const { audioBase64, mimeType = 'audio/mp4' } = req.body || {}
  if (!audioBase64) return res.status(400).json({ error: '缺少音频' })

  let buf
  try {
    buf = Buffer.from(String(audioBase64), 'base64')
  } catch {
    return res.status(400).json({ error: '音频格式不对' })
  }
  if (!buf.length) return res.status(400).json({ error: '音频是空的' })
  if (buf.length > 8 * 1024 * 1024) return res.status(413).json({ error: '录音太长了' })

  try {
    const fd = new FormData()
    fd.append('file', new Blob([buf], { type: mimeType }), 'audio.m4a')
    fd.append('model', 'whisper-large-v3-turbo')
    fd.append('response_format', 'json')

    const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: fd,
    })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) return res.status(r.status).json({ error: d.error?.message || `Groq ${r.status}` })
    return res.status(200).json({ text: d.text || '' })
  } catch (e) {
    return res.status(502).json({ error: e.message })
  }
}
