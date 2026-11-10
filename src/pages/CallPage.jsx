import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

const API_BASE = 'https://124-156-142-6.sslip.io'

function fmt(sec) {
  const m = String(Math.floor(sec / 60)).padStart(2, '0')
  const s = String(sec % 60).padStart(2, '0')
  return `${m}:${s}`
}

// ── 录音时的声学采样：音量 / 停顿 / 音高 / 底噪，让后端能推断语气和环境 ──
// 注意：必须用独立 AudioContext。共用播放用的 ctx 会让 iOS 把整个音频会话
// 切到录音模式，导致之后的通话播放只有声波没有声音（且页面内无法恢复）。
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
  const startedAtRef = useRef(demo ? Date.now() - 47 * 1000 : Date.now())
  const speakingRef = useRef(false)
  const audioRef = useRef(null)
  const mediaRef = useRef(null)
  const meterRef = useRef(null)
  const chunksRef = useRef([])
  const canvasRef = useRef(null)
  const audioCtxRef = useRef(null)
  const analyserRef = useRef(null)
  const sourceRef = useRef(null)
  const listRef = useRef(null)

  // 有新消息就滚到底部
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [history, thinking, transcribing])

  // 通话页固定用这张照片（不跟随设置里的头像）
  const avatar = '/portrait-call.jpg'

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

  // ── 环绕音波：把播放中的音频接进 AnalyserNode，逐帧画环形频谱 ──
  function ensureAudioCtx() {
    try {
      if (!audioCtxRef.current) {
        const AC = window.AudioContext || window.webkitAudioContext
        if (!AC) return null
        audioCtxRef.current = new AC()
        const analyser = audioCtxRef.current.createAnalyser()
        analyser.fftSize = 512
        analyser.smoothingTimeConstant = 0.8
        analyser.connect(audioCtxRef.current.destination)
        analyserRef.current = analyser
      }
      // iOS 必须在用户手势里放一点声音，后面的程序化播放才不会被拦
      try {
        if (!audioCtxRef.current.__unlocked) {
          const buf = audioCtxRef.current.createBuffer(1, 1, 22050)
          const src = audioCtxRef.current.createBufferSource()
          src.buffer = buf
          src.connect(audioCtxRef.current.destination)
          src.start(0)
          audioCtxRef.current.__unlocked = true
        }
      } catch {}
      if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume().catch(() => {})
      return audioCtxRef.current
    } catch { return null }
  }

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
        let data = null
        if (analyserRef.current) {
          data = new Uint8Array(analyserRef.current.frequencyBinCount)
          analyserRef.current.getByteFrequencyData(data)
        }

        for (let i = 0; i < bars; i += 1) {
          const t = i / bars
          const angle = t * Math.PI * 2 - Math.PI / 2
          let v
          if (data) {
            v = data[Math.floor(t * data.length * 0.55)] / 255
          }
          // 原生播放时 analyser 没有数据，用时间驱动让声波保持轻微呼吸感
          if (!data || v < 0.02) v = 0.10 + 0.05 * Math.sin(time / 900 + t * Math.PI * 4)
          const len = 1.9 + v * 18
          const alpha = 0.14 + v * 0.55
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
    try { audioRef.current?.pause() } catch {}
    setSpeaking(true)
    const done = () => setSpeaking(false)

    let url = ''
    try { url = URL.createObjectURL(new Blob([b64ToArrayBuffer(b64)], { type: 'audio/mpeg' })) }
    catch { url = `data:audio/mpeg;base64,${b64}` }
    const audio = new Audio(url)
    audioRef.current = audio
    audio.preload = 'auto'
    audio.onended = () => {
      done()
      if (url.startsWith('blob:')) { try { URL.revokeObjectURL(url) } catch {} }
    }
    audio.onerror = audio.onended
    audio.play().catch((e) => {
      console.warn('[Call] 播放失败', e)
      audio.onended()
    })
  }

  async function startCall() {
    ensureAudioCtx() // 在用户手势里创建，iOS 才允许出声音
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
        setHistory([{ role: 'assistant', en: data.reply.display || data.reply.en, zh: data.reply.zh }])
        playBase64(data.reply?.audio)
      }
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
      setHistory((h) => [...h, { role: 'assistant', en: data.reply.display || data.reply.en, zh: data.reply.zh }].slice(-10))
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
      // 同时采样声学特征（音量/停顿/音高/底噪），随录音一起送去转写。
      // startMeter 会自己建独立 AudioContext，不碰播放用的那个。
      meterRef.current = null
      try {
        meterRef.current = startMeter(stream)
      } catch (e) {
        console.warn('[Call] 声学采样不可用，仅转文字', e)
      }
      mr.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data) }
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        const features = summarizeMeter(meterRef.current)
        meterRef.current = null
        // iOS 录音会把音频会话切走，旧 AudioContext 之后往往只有数据没有声音。
        // 直接丢弃它，下一次播放由 ensureAudioCtx 重建一个新会话；新会话不可用时
        // playBase64 会自动回退到原生 <audio>（一定能发声，代价是没有声波）。
        try { audioCtxRef.current?.close?.() } catch {}
        audioCtxRef.current = null
        analyserRef.current = null
        sourceRef.current = null
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
      }}
    >
      {/* 顶部状态 */}
      <div className="w-full flex items-center justify-between px-6 pt-[max(18px,env(safe-area-inset-top))]">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 shrink-0 rounded-full bg-white/45 backdrop-blur flex items-center justify-center text-[#5f5442]"
          aria-label="返回"
        >
          ‹
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
        {phase === 'idle' && (
          <div className="flex-1 flex flex-col items-center justify-center">
            <p className="text-[13px] tracking-[0.2em] text-[#8b7f68]">{incoming ? '他想和你说说话' : '他在等你的电话'}</p>
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
                <div key={i} className="text-center">
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
                  onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture?.(e.pointerId); startRec() }}
                  onPointerUp={(e) => { e.preventDefault(); stopRec() }}
                  onPointerCancel={(e) => { e.preventDefault(); stopRec() }}
                  onPointerLeave={() => { if (recording) stopRec() }}
                  onContextMenu={(e) => e.preventDefault()}
                  disabled={thinking || transcribing}
                  className={`w-16 h-16 rounded-full flex items-center justify-center transition-all duration-150 disabled:opacity-40 ${
                    recording
                      ? 'bg-[#b8584a] text-white scale-95 shadow-[0_0_0_10px_rgba(184,88,74,.16),0_16px_30px_-12px_rgba(150,70,55,.8)]'
                      : 'bg-[#6f8462] text-[#fbf8f0] shadow-[0_16px_32px_-14px_rgba(90,110,75,.9)] active:scale-95'
                  }`}
                  aria-label="按住说话"
                  style={{ touchAction: 'none' }}
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
                  {recording ? '松开发送' : transcribing ? '识别中…' : '按住说话'}
                </span>
              </div>
            </div>
          </>
        ) : phase === 'ended' ? (
          <p className="text-center text-[12px] tracking-[0.2em] text-[#8b7f68] pb-4">挂断中…</p>
        ) : (
          // 等待接通：来电页面样式，挂断在左、接听在右
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
              aria-label="接通"
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
