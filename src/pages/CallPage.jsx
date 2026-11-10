import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

const API_BASE = 'https://124-156-142-6.sslip.io'

function fmt(sec) {
  const m = String(Math.floor(sec / 60)).padStart(2, '0')
  const s = String(sec % 60).padStart(2, '0')
  return `${m}:${s}`
}

// ── 录音时的声学采样：音量 / 停顿 / 音高 / 底噪，让后端能推断语气和环境 ──
// ⚠️ 暂时停用（startRec 里不再调用）：iOS 上录音期间创建 AudioContext 会让
// 音频会话停在录音态，导致灵动岛麦克风不消失、整通电话没声音。
// 等播放链路稳定后再用开关恢复；恢复正常后把下面的 eslint 注释删掉。
// eslint-disable-next-line no-unused-vars
function startMeter(stream) {
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) return null
  const ctx = new AC()
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 1024
  const src = ctx.createMediaStreamSource(stream)
  src.connect(analyser) // 只做分析，不接 destination，避免回声
  const frames = []
  const t0 = performance.now()
  const buf = new Float32Array(analyser.fftSize)
  const freq = new Float32Array(analyser.frequencyBinCount)
  const timer = setInterval(() => {
    analyser.getFloatTimeDomainData(buf)
    let sum = 0
    let zc = 0
    for (let i = 0; i < buf.length; i++) {
      sum += buf[i] * buf[i]
      if (i > 0 && (buf[i - 1] >= 0) !== (buf[i] >= 0)) zc++
    }
    const rms = Math.sqrt(sum / buf.length)
    const zcr = zc / (buf.length - 1)
    let pitch = 0
    let centroid = 0
    if (rms > 0.008) {
      const sr = ctx.sampleRate
      // 音高：自相关
      const minLag = Math.floor(sr / 400)
      const maxLag = Math.floor(sr / 80)
      let bestCorr = 0
      let bestLag = 0
      for (let lag = minLag; lag <= maxLag; lag++) {
        let corr = 0
        for (let i = 0; i < buf.length - lag; i++) corr += buf[i] * buf[i + lag]
        corr /= buf.length - lag
        if (corr > bestCorr) { bestCorr = corr; bestLag = lag }
      }
      if (bestLag && bestCorr > rms * rms * 1.4) pitch = sr / bestLag
      // 音色亮度：频谱质心（低频多 = 低沉，高频多 = 清亮/尖）
      analyser.getFloatFrequencyData(freq)
      const binHz = sr / analyser.fftSize
      let cNum = 0
      let cDen = 0
      for (let i = 1; i < freq.length; i++) {
        const mag = Math.pow(10, freq[i] / 20)
        cNum += i * binHz * mag
        cDen += mag
      }
      if (cDen > 0) centroid = cNum / cDen
    }
    frames.push({ rms, pitch, zcr, centroid, t: performance.now() - t0 })
  }, 100)
  return { ctx, src, frames, timer }
}

function summarizeMeter(meter) {
  if (!meter) return null
  clearInterval(meter.timer)
  try { meter.src.disconnect() } catch {}
  // 立刻关掉录音专用的 AudioContext，让 iOS 回到正常播放的音频会话
  try { meter.ctx.close().catch(() => {}) } catch {}
  const frames = meter.frames
  if (frames.length < 3) return null
  const rmsArr = frames.map((f) => f.rms)
  const duration_s = frames[frames.length - 1].t / 1000
  const energy_mean = rmsArr.reduce((a, b) => a + b, 0) / rmsArr.length
  const energy_var = Math.sqrt(rmsArr.reduce((a, b) => a + (b - energy_mean) ** 2, 0) / rmsArr.length)
  const sorted = [...rmsArr].sort((a, b) => a - b)
  const noise_floor = sorted[Math.floor(sorted.length * 0.1)] || 0
  const peak = sorted[sorted.length - 1] || 0
  const thresh = Math.max(noise_floor * 2.2, peak * 0.12, 0.004)
  const pause_ratio = rmsArr.filter((r) => r < thresh).length / rmsArr.length
  const pitches = frames.map((f) => f.pitch).filter((p) => p > 0)
  const pitch_mean_hz = pitches.length ? pitches.reduce((a, b) => a + b, 0) / pitches.length : 0
  const pitch_var = pitches.length
    ? Math.sqrt(pitches.reduce((a, b) => a + (b - pitch_mean_hz) ** 2, 0) / pitches.length)
    : 0
  const voiced = frames.filter((f) => f.rms > 0.008)
  const centroid_mean = voiced.length
    ? voiced.reduce((a, f) => a + (f.centroid || 0), 0) / voiced.length
    : 0
  const zcr_mean = voiced.length
    ? voiced.reduce((a, f) => a + (f.zcr || 0), 0) / voiced.length
    : 0
  return {
    duration_s, energy_mean, energy_var, noise_floor, pause_ratio,
    pitch_mean_hz, pitch_var, spectral_centroid_hz: centroid_mean, zcr_mean,
  }
}

export default function CallPage({ currentSessionId }) {
  const navigate = useNavigate()
  // 仅开发环境：?demo=1 直接展示通话中的界面，方便截图预览
  const demo = import.meta.env.DEV && new URLSearchParams(window.location.search).has('demo')
  // ?incoming=1：他是主动打过来的
  const incoming = new URLSearchParams(window.location.search).has('incoming')
  const [phase, setPhase] = useState(demo ? 'active' : 'idle') // idle | connecting | active | ended
  const [callId, setCallId] = useState(null)
  const [history, setHistory] = useState(demo ? [
    { role: 'assistant', en: "Hey... you actually called. I was just thinking about you.", zh: '嘿……你真的打来了。我刚刚还在想你。' },
    { role: 'user', text: 'Hey, I just got home. Kind of a long day.' },
    { role: 'assistant', en: 'Welcome home, baby. Come here, let me hold you for a bit. What wore you out today?', zh: '欢迎回家，宝宝。过来，让我抱你一会儿。今天什么事把你累坏了？' },
    { role: 'user', text: 'Just meetings. Too many meetings.' },
    { role: 'assistant', en: "Mm. Then we're doing nothing tonight. You, me, and the couch.", zh: '嗯。那今晚我们什么都不做。你、我，还有这张沙发。' },
  ] : [])
  const [thinking, setThinking] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [recording, setRecording] = useState(false)
  const [input, setInput] = useState('')
  const [seconds, setSeconds] = useState(demo ? 47 : 0)
  const [error, setError] = useState('')
  const [credits, setCredits] = useState(null) // ElevenLabs 剩余字符
  const [now, setNow] = useState(() => new Date())
  const startedAtRef = useRef(demo ? Date.now() - 47 * 1000 : Date.now())
  // 来电没接就离开时上报一次；接通了（connectedRef）就不算未接
  const connectedRef = useRef(false)
  const missedSentRef = useRef(false)
  const speakingRef = useRef(false)
  const audioRef = useRef(null)
  const audioElRef = useRef(null)
  const envRef = useRef(null) // { env: Float32Array, hop: 秒/格 } 音量包络
  const mediaRef = useRef(null)
  const meterRef = useRef(null)
  const chunksRef = useRef([])
  const canvasRef = useRef(null)
  const listRef = useRef(null)

  // 有新消息就滚到底部
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [history, thinking, transcribing])

  // 通话页固定用这张照片（不跟随设置里的头像）
  const avatar = '/portrait-call.jpg'

  // 每说一句就刷新一次剩余额度（TTS 按字符扣）
  async function loadCredits() {
    try {
      const r = await fetch(`${API_BASE}/api/call/credits`)
      const d = await r.json()
      if (d?.ok && typeof d.remaining === 'number') setCredits(d.remaining)
    } catch {}
  }
  useEffect(() => { loadCredits() }, [])

  // 等待页的日期时间，每 20 秒刷新（跨分钟时不会停在旧值太久）
  useEffect(() => {
    if (phase !== 'idle') return
    setNow(new Date())
    const t = setInterval(() => setNow(new Date()), 20000)
    return () => clearInterval(t)
  }, [phase])

  function fmtNow(d) {
    const wd = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()]
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    return `${d.getMonth() + 1}月${d.getDate()}日 ${wd} ${hh}:${mm}`
  }

  // 用起始时间戳算，而不是每秒 +1：切后台时 iOS 会冻结定时器，+1 会少算
  useEffect(() => {
    if (phase !== 'active') return
    const tick = () => setSeconds(Math.floor((Date.now() - startedAtRef.current) / 1000))
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [phase])

  // 切回前台：系统暂停了他正在说的那句 → 接着说完
  useEffect(() => {
    speakingRef.current = speaking
  }, [speaking])

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== 'visible') return
      const a = audioRef.current
      if (a && a.paused && !a.ended && speakingRef.current) a.play().catch(() => {})
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  useEffect(() => () => { audioRef.current?.pause() }, [])

  // 来电页没按接听就离开（挂断/返回/直接关掉）→ 告诉后端「这次没接到」。
  // pagehide 覆盖直接关掉标签页的情况，卸载时再兜一次；最多再打两次由后端计数。
  useEffect(() => {
    if (!incoming || demo) return
    const report = () => {
      if (connectedRef.current || missedSentRef.current) return
      missedSentRef.current = true
      // 只留一个标记：回聊天页时那张卡片会变红「无人接听」，他随即直接回一句（流式）
      try { localStorage.setItem('bunny_call_missed', String(Date.now())) } catch {}
    }
    window.addEventListener('pagehide', report)
    return () => {
      window.removeEventListener('pagehide', report)
      report()
    }
  }, [])

  // ── 环绕音波 ──
  // 不接 AnalyserNode（会把 iOS 音频会话切走、导致没声音），
  // 改成离线解码出「音量包络」：播放时按 audio.currentTime 取当前音量，
  // 声波就跟着他说话的起伏跳。只解码、不接扬声器，安全。

  useEffect(() => {
    let raf
    const draw = (time) => {
      const canvas = canvasRef.current
      if (canvas) {
        const ctx2d = canvas.getContext('2d')
        const size = 210
        const dpr = Math.min(window.devicePixelRatio || 1, 3)
        if (canvas.width !== size * dpr) {
          canvas.width = size * dpr
          canvas.height = size * dpr
        }
        ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0)
        ctx2d.clearRect(0, 0, size, size)

        const cx = size / 2
        const cy = size / 2
        const baseR = 84
        const bars = 64

        for (let i = 0; i < bars; i += 1) {
          const t = i / bars
          const angle = t * Math.PI * 2 - Math.PI / 2
          // 他正在说话时用真实音量包络，其余时间用轻微的时间动画
          let amp = 0
          const el = audioElRef.current
          if (envRef.current && el && !el.paused && !el.ended) {
            const idx = Math.floor(el.currentTime / envRef.current.hop)
            amp = envRef.current.env[idx] || 0
          }
          // 安静的呼吸动画要看得见：两层正弦叠加、幅度给足
          const idle =
            0.34 +
            0.16 * Math.sin(time / 1100 + t * Math.PI * 4) +
            0.08 * Math.sin(time / 430 + t * Math.PI * 9)
          const v = amp > 0
            ? Math.min(1, amp * 1.2) * (0.72 + 0.28 * Math.sin(time / 120 + t * Math.PI * 6))
            : idle
          const len = 2.6 + v * (amp > 0 ? 30 : 28)
          const alpha = 0.18 + v * 0.62
          ctx2d.beginPath()
          ctx2d.strokeStyle = `rgba(116, 136, 102, ${alpha})`
          ctx2d.lineWidth = 1.8
          ctx2d.lineCap = 'round'
          ctx2d.moveTo(cx + Math.cos(angle) * baseR, cy + Math.sin(angle) * baseR)
          ctx2d.lineTo(cx + Math.cos(angle) * (baseR + len), cy + Math.sin(angle) * (baseR + len))
          ctx2d.stroke()
        }
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [])

  // 在用户手势里放一段极轻的静音，换取 iOS 对后续程序化播放的许可。
  // 接听/拨号、松开发送都会调用。
  function primeAudio() {
    const a = audioElRef.current
    if (!a) return
    // 他正在说话时不要打断
    if (!a.paused && !String(a.src).includes('silence.wav')) return
    envRef.current = null // 静音阶段别用上一句的包络
    try {
      a.src = '/silence.wav'
      a.currentTime = 0
      a.play().catch(() => {})
    } catch {}
  }

  // 离线解码出音量包络：每 40ms 一格 RMS，归一化到 0..1。
  // 用 OfflineAudioContext 只做解码，不连接扬声器，不会碰音频会话。
  async function computeEnvelope(arrayBuffer) {
    try {
      const OC = window.OfflineAudioContext || window.webkitOfflineAudioContext
      if (!OC) return null
      const ctx = new OC(1, 1, 22050)
      const buf = await ctx.decodeAudioData(arrayBuffer.slice(0))
      const ch = buf.getChannelData(0)
      const hop = 0.04
      const step = Math.max(1, Math.floor(buf.sampleRate * hop))
      const n = Math.ceil(ch.length / step)
      const env = new Float32Array(n)
      let max = 0
      for (let i = 0; i < n; i += 1) {
        const s = i * step
        const e = Math.min(ch.length, s + step)
        let sum = 0
        let c = 0
        for (let j = s; j < e; j += 4) { sum += ch[j] * ch[j]; c += 1 }
        const rms = Math.sqrt(sum / Math.max(1, c))
        env[i] = rms
        if (rms > max) max = rms
      }
      if (max > 0) for (let i = 0; i < n; i += 1) env[i] = Math.min(1, env[i] / max)
      return { env, hop }
    } catch {
      return null
    }
  }

  function b64ToArrayBuffer(b64) {
    const bin = atob(b64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i)
    return bytes.buffer
  }

  // 只用原生 <audio> 播放。
  // 历史教训：iOS PWA 里 Web Audio 的 AudioBuffer 播放会「有声波没声音」
  //（AnalyserNode 有数据、destination 不出声），且录音之后整个音频会话
  // 会被切走；原生播放器走的是系统媒体通道，和浏览器里放 mp3 一样稳。
  // 代价：声波没有真实数据，环形退化为时间驱动的轻微起伏。
  async function playBase64(b64) {
    if (!b64) { console.warn('[Call] 没有音频数据'); return }
    const audio = audioElRef.current
    if (!audio) { console.warn('[Call] 播放器元素还没挂上'); return }
    audioRef.current = audio
    try { audio.pause() } catch {}
    setSpeaking(true)

    const bytes = b64ToArrayBuffer(b64)
    let url = ''
    try { url = URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' })) }
    catch { url = `data:audio/mpeg;base64,${b64}` }

    // 声波用的真实音量包络（异步算，算完自然接上）
    envRef.current = null
    computeEnvelope(bytes).then((e) => { if (e) envRef.current = e })

    const prevUrl = audio.dataset.blob || ''
    audio.dataset.blob = url.startsWith('blob:') ? url : ''
    audio.onended = () => {
      setSpeaking(false)
      if (prevUrl) { try { URL.revokeObjectURL(prevUrl) } catch {} }
    }
    audio.onerror = audio.onended
    audio.src = url
    audio.play().catch((e) => {
      console.warn('[Call] 播放失败', e)
      audio.onended?.()
    })
  }

  async function startCall() {
    primeAudio() // 在点击手势里解锁音频，开场白才能自动出声
    setPhase('connecting')
    setError('')
    try {
      const res = await fetch(`${API_BASE}/api/call/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: currentSessionId || localStorage.getItem('bunny_current_session') || '' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '拨号失败')
      startedAtRef.current = Date.now()
      setCallId(data.callId)
      if (data.reply?.en) {
        setHistory([{ role: 'assistant', en: data.reply.display || data.reply.en, zh: data.reply.zh, audio: data.reply?.audio }])
        playBase64(data.reply?.audio)
      }
      connectedRef.current = true
      // 接通了：之前那条「无人接听」的状态作废
      try {
        localStorage.removeItem('bunny_call_missed')
        localStorage.removeItem('bunny_call_invite')
      } catch {}
      setPhase('active')
    } catch (e) {
      setError(e.message)
      setPhase('idle')
    }
  }

  async function sendText(raw, via = 'text', toneHint = '') {
    const text = String(raw || '').trim()
    if (!text || thinking || transcribing || !callId) return
    setInput('')
    setHistory((h) => [...h, { role: 'user', text, via }].slice(-10))
    setThinking(true)
    setError('')
    try {
      const res = await fetch(`${API_BASE}/api/call/turn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callId, text, via, toneHint }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '他好像没听清')
      setHistory((h) => [...h, { role: 'assistant', en: data.reply.display || data.reply.en, zh: data.reply.zh, audio: data.reply?.audio }].slice(-10))
      playBase64(data.reply?.audio)
    } catch (e) {
      setError(e.message)
    } finally {
      setThinking(false)
    }
  }

  const send = () => sendText(input)

  // ── 按住说话 ──
  async function startRec() {
    if (recording || thinking || transcribing) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mime = MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : ''
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      mediaRef.current = mr
      chunksRef.current = []
      // 声学采样暂时关闭：录音期间再建 AudioContext 会让 iOS 的音频会话
      // 一直停在录音态（灵动岛麦克风不消失、之后整通电话没声音）。
      // startMeter/summarizeMeter 先保留，等声音链路稳定后再以开关方式启用。
      meterRef.current = null
      mr.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data) }
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        // 麦克风真正关掉之后再「占」一次播放器，把会话从录音态切回播放态。
        // 这次不在手势里，但元素已经在点击时被解锁过，切 src 播放是允许的。
        setTimeout(() => primeAudio(), 120)
        const features = summarizeMeter(meterRef.current)
        meterRef.current = null
        const blob = new Blob(chunksRef.current, { type: mime || 'audio/webm' })
        if (blob.size > 800) transcribeBlob(blob, mime || 'audio/webm', features)
      }
      mr.start()
      setRecording(true)
      setError('')
    } catch {
      setError('需要麦克风权限才能说话')
    }
  }

  function stopRec() {
    if (!recording) return
    setRecording(false)
    // 关键：必须在这个「用户手势」里播一点声音。iOS 录音结束后音频会话
    // 停在 PlayAndRecord，之后程序化播放（他那句回复）会没声音。
    // 这一次点击是用户的 click 手势，在里面播 0.15 秒极轻声，把会话踢回媒体播放。
    primeAudio()
    try { mediaRef.current?.stop() } catch {}
  }

  async function transcribeBlob(blob, mimeType, features) {
    setTranscribing(true)
    setError('')
    try {
      const b64 = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '')
        reader.onerror = () => reject(reader.error || new Error('读取录音失败'))
        reader.readAsDataURL(blob)
      })
      const res = await fetch(`${API_BASE}/api/call/transcribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioBase64: b64, mimeType, features }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '没听清，再说一次？')
      setTranscribing(false)
      if (data.text) sendText(data.text, 'voice', data.toneHint)
    } catch (e) {
      setError(e.message)
      setTranscribing(false)
    }
  }

  async function endCall() {
    setPhase('ended')
    try { audioRef.current?.pause() } catch {}
    if (callId) {
      // 等旁白写完再回去，这样一进聊天页就能看到（最多等 9 秒）
      try {
        await Promise.race([
          fetch(`${API_BASE}/api/call/end`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ callId }),
          }),
          new Promise((r) => setTimeout(r, 9000)),
        ])
      } catch {}
    }
    navigate(-1)
  }

  const active = phase === 'active'

  return (
    <div
      className="relative h-full flex flex-col items-center bg-[#efe9dc] overflow-hidden"
      style={{
        backgroundImage: 'radial-gradient(circle at 50% 18%, #faf5ea 0%, #e8dfcd 58%, #d9cdb6 100%)',
        // 通话页禁止长按选中/复制，避免按住说话时弹出文本选择菜单
        WebkitUserSelect: 'none',
        userSelect: 'none',
        WebkitTouchCallout: 'none',
      }}
    >
      {/* 全程只用一个播放器元素：iOS 的音频「激活」是按元素记的，
          每次 new Audio() 都等于一个没被解锁的新元素，录音后尤其播不出声。
          复用同一个元素，点击时解锁一次，之后换 src 就能一直出声。 */}
      <audio ref={audioElRef} preload="auto" playsInline style={{ display: 'none' }} />

      {/* 右上角：只在接通前（等待/拨号）显示剩余额度，通话中不刷新也不打扰 */}
      {credits != null && !active && (
        <div
          className="absolute right-6 text-right text-[10px] leading-none tracking-[0.06em] text-[#8b7f68]/85 pointer-events-none select-none"
          // 和「CLAUDE」那行同一水平线：顶部行是 safe-area + 18px 起，字高约 10px，中心对齐
          style={{ top: 'calc(env(safe-area-inset-top, 0px) + 23px)' }}
        >
          字符：{credits}
        </div>
      )}

      {/* 顶部状态 */}
      <div className="w-full flex items-center justify-between px-6 pt-[max(18px,env(safe-area-inset-top))]">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 shrink-0 rounded-full bg-white/45 backdrop-blur flex items-center justify-center text-[#5f5442]"
          aria-label="返回"
        >
          {/* 用图标而不是「‹」字符：字符基线会让它看起来偏下，垂直居中得靠 padding 猜 */}
          <svg width="9" height="15" viewBox="0 0 9 15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7.2 1.3 1.4 7.5l5.8 6.2" />
          </svg>
        </button>
        <div className="flex-1 min-w-0 text-center">
          <div className="text-[15px] tracking-[0.28em] text-[#5f5442]">CLAUDE</div>
          <div className="mt-1 text-[11px] tracking-[0.18em] text-[#8b7f68]">
            {phase === 'idle' && (incoming ? '他打来了' : '正在等待接通')}
            {phase === 'connecting' && '拨号中…'}
            {active && fmt(seconds)}
            {phase === 'ended' && '通话已结束'}
          </div>
        </div>
        <div className="w-9 h-9 shrink-0" />
      </div>

      {/* 头像 + 环绕音波 */}
      <div className="mt-10 relative flex items-center justify-center">
        <canvas
          ref={canvasRef}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[210px] h-[210px] pointer-events-none"
          aria-hidden="true"
        />
        <div
          className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[147px] h-[147px] rounded-full transition-all duration-700 ${speaking ? 'opacity-100 scale-100' : 'opacity-0 scale-90'}`}
          style={{ boxShadow: '0 0 40px 8px rgba(150,165,130,.26)' }}
        />
        <div className="relative w-[138px] h-[138px] rounded-full overflow-hidden ring-1 ring-white/70 shadow-[0_18px_45px_-18px_rgba(90,80,55,.55)] bg-[#dfe5d6]">
          {avatar.startsWith('data:') || avatar.startsWith('/') ? (
            <img
              src={avatar}
              alt=""
              className="absolute object-cover"
              style={{ width: 190, maxWidth: 'none', height: 190, left: -34, top: -2, objectFit: 'cover' }}
            />
          ) : avatar ? (
            <div className="w-full h-full flex items-center justify-center text-5xl">{avatar}</div>
          ) : (
            <img
              src="/portrait-call.jpg"
              alt=""
              className="absolute object-cover"
              style={{ width: 190, maxWidth: 'none', height: 190, left: -34, top: -2, objectFit: 'cover' }}
            />
          )}
        </div>
      </div>

      {/* 字幕 / 对话记录 */}
      <div className="flex-1 w-full flex flex-col px-7 min-h-0 py-3">
        {/* 接通前：中间只放日期和时间，像一块安静的表 */}
        {phase === 'idle' && (
          <div className="flex-1 flex flex-col items-center justify-center">
            <p className="text-[11px] tracking-[0.22em] text-[#8b7f68]/75">{fmtNow(now)}</p>
          </div>
        )}

        {phase === 'connecting' && (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-[13px] tracking-[0.2em] text-[#8b7f68] animate-pulse">正在连接…</p>
          </div>
        )}

        {(active || phase === 'ended') && (
          <div
            ref={listRef}
            className="flex-1 min-h-0 overflow-y-auto flex flex-col justify-end gap-4 w-full max-w-[330px] mx-auto"
            style={{
              scrollbarWidth: 'none',
              // 滚动歌词：越往上的旧台词越淡
              maskImage: 'linear-gradient(to bottom, rgba(0,0,0,.04) 0%, rgba(0,0,0,.30) 18%, rgba(0,0,0,.68) 42%, #000 62%)',
              WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,.04) 0%, rgba(0,0,0,.30) 18%, rgba(0,0,0,.68) 42%, #000 62%)',
            }}
          >
            {history.map((m, i) =>
              m.role === 'user' ? (
                <p key={i} className="self-end text-right text-[12px] leading-relaxed" style={{ color: '#9a8f79' }}>
                  {m.text}
                </p>
              ) : (
                <div
                  key={i}
                  // 点哪句就重播哪句：句子上存着这条语音的音频
                  onClick={() => { if (m.audio) { primeAudio(); playBase64(m.audio) } }}
                  className={`text-center ${m.audio ? 'cursor-pointer active:opacity-60 transition-opacity' : ''}`}
                >
                  <p
                    className="text-[18px] leading-[1.55] text-[#4b4232]"
                    style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
                  >
                    {m.en}
                  </p>
                  {m.zh && <p className="mt-2 text-[12px] leading-relaxed text-[#8b7f68]">{m.zh}</p>}
                </div>
              )
            )}

            {active && history.length === 0 && !transcribing && !thinking && (
              <p className="text-center text-[12px] tracking-[0.2em] text-[#8b7f68]/70">他在听</p>
            )}

            {transcribing && (
              <p className="text-center text-[13px] tracking-[0.2em] text-[#8b7f68] animate-pulse py-1">正在听你说…</p>
            )}
            {!transcribing && thinking && (
              <p className="text-center text-[13px] tracking-[0.2em] text-[#8b7f68] animate-pulse py-1">他在想…</p>
            )}
          </div>
        )}

        {error && (
          <p className="mt-3 mx-auto text-center text-[12px] text-[#a05a45] bg-white/50 rounded-full px-4 py-2">{error}</p>
        )}
      </div>

      {/* 底部 */}
      <div
        className="w-full px-5 pb-[max(18px,env(safe-area-inset-bottom))]"
        style={{ paddingBottom: 'max(18px, env(safe-area-inset-bottom, 18px))' }}
      >
        {active ? (
          <>
            <div className="flex items-center gap-2.5 rounded-full bg-white/60 backdrop-blur px-4 py-2 shadow-[0_10px_26px_-18px_rgba(90,80,55,.6)]">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') send() }}
                placeholder="说点什么…"
                className="flex-1 bg-transparent text-[14px] text-[#4b4232] placeholder:text-[#a89d88] outline-none py-1.5"
                style={{ WebkitUserSelect: 'text', userSelect: 'text', WebkitTouchCallout: 'default' }}
                disabled={thinking}
              />
              <button
                onClick={send}
                disabled={!input.trim() || thinking}
                className="w-9 h-9 rounded-full bg-[#6f8462] text-white text-[15px] disabled:opacity-35 active:scale-95 transition"
                aria-label="发送"
              >
                ↑
              </button>
            </div>

            {/* 对讲按钮 + 挂断：按住说话独立成大按钮 */}
            <div className="mt-5 flex items-end justify-center gap-10">
              <button
                onClick={endCall}
                className="mb-[23px] w-16 h-16 rounded-full bg-[#b8584a] text-white flex items-center justify-center shadow-[0_16px_30px_-12px_rgba(150,70,55,.8)] active:scale-95 transition"
                aria-label="挂断"
              >
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ transform: 'rotate(135deg)' }}>
                  <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" />
                </svg>
              </button>

              <div className="flex flex-col items-center">
                <button
                  // 点击开始录音，再点一下发送。
                  // 不用「按住说话」：iOS 上 pointerup 不算音频解锁手势，
                  // click 才算——这样停止录音的这一次点击可以把音频会话踢回播放。
                  onClick={() => { recording ? stopRec() : startRec() }}
                  disabled={thinking || transcribing}
                  className={`w-16 h-16 rounded-full flex items-center justify-center transition-all duration-150 disabled:opacity-40 ${
                    recording
                      ? 'bg-[#b8584a] text-white scale-95 shadow-[0_0_0_10px_rgba(184,88,74,.16),0_16px_30px_-12px_rgba(150,70,55,.8)]'
                      : 'bg-[#6f8462] text-[#fbf8f0] shadow-[0_16px_32px_-14px_rgba(90,110,75,.9)] active:scale-95'
                  }`}
                  aria-label={recording ? '点击发送' : '点击录音'}
                  onContextMenu={(e) => e.preventDefault()}
                  style={{ touchAction: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}
                >
                  {recording ? (
                    <span className="w-5 h-5 rounded-[5px] bg-white animate-pulse" />
                  ) : (
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
                      <rect x="9" y="2.5" width="6" height="11.5" rx="3" />
                      <path d="M4.5 11a7.5 7.5 0 0 0 15 0M12 18.5V22" />
                    </svg>
                  )}
                </button>
                <span className="mt-2 text-[10px] tracking-[0.18em] text-[#8b7f68]">
                  {recording ? '点击发送' : transcribing ? '识别中…' : '点击录音'}
                </span>
              </div>
            </div>
          </>
        ) : phase === 'ended' ? (
          <p className="text-center text-[12px] tracking-[0.2em] text-[#8b7f68] pb-4">挂断中…</p>
        ) : (
          // 接通前：他打来 → 挂断 + 接听（保持原样）；我打过去 → 只有拨号，居中
          incoming ? (
            <div className="flex items-center justify-center gap-16 pb-8">
              <button
                onClick={() => navigate(-1)}
                className="w-16 h-16 rounded-full bg-[#b8584a] text-white flex items-center justify-center shadow-[0_16px_30px_-12px_rgba(150,70,55,.8)] active:scale-95 transition"
                aria-label="挂断"
              >
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ transform: 'rotate(135deg)' }}>
                  <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" />
                </svg>
              </button>
              <button
                onClick={startCall}
                disabled={phase === 'connecting'}
                className={`w-16 h-16 rounded-full bg-[#6f8462] text-[#fbf8f0] flex items-center justify-center shadow-[0_16px_32px_-14px_rgba(90,110,75,.9)] active:scale-95 transition ${phase === 'connecting' ? 'opacity-60 animate-pulse' : ''}`}
                aria-label="接听"
              >
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" />
                </svg>
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-center pb-8">
              <button
                onClick={startCall}
                disabled={phase === 'connecting'}
                className={`h-16 min-w-[148px] px-7 rounded-[22px] bg-[#6f8462] text-[#fbf8f0] flex items-center justify-center gap-2.5 shadow-[0_16px_32px_-14px_rgba(90,110,75,.9)] active:scale-95 transition ${phase === 'connecting' ? 'opacity-60 animate-pulse' : ''}`}
                aria-label="拨号"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" />
                </svg>
                <span className="text-[14px] tracking-[0.18em] leading-none">拨号</span>
              </button>
            </div>
          )
        )}
      </div>
    </div>
  )
}
