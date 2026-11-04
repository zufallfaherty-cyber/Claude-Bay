import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { fetchSettings } from '../lib/supabase'
import { compressImage, loadAlbum, uploadPhoto, deletePhoto } from '../lib/album'

export default function Settings() {
  const navigate = useNavigate()
  const { supabase, user } = useAuth()
  const bayFileRef = useRef(null)
  const claudeFileRef = useRef(null)
  const albumFileRef = useRef(null)

  const [albumPhotos, setAlbumPhotos] = useState([])
  const [albumBusy, setAlbumBusy] = useState(false)
  const [albumHint, setAlbumHint] = useState('')

  useEffect(() => {
    let alive = true
    loadAlbum().then((list) => { if (alive) setAlbumPhotos(list) })
    return () => { alive = false }
  }, [])

  const handleAlbumUpload = async (files) => {
    const picked = Array.from(files || []).filter((f) => f.type.startsWith('image/'))
    if (!picked.length) return
    setAlbumBusy(true)
    setAlbumHint(`正在处理 ${picked.length} 张照片…`)
    let synced = 0
    for (const file of picked) {
      try {
        const dataUrl = await compressImage(file, 1500, 0.8)
        const { photo, synced: ok } = await uploadPhoto(dataUrl)
        if (ok) synced++
        setAlbumPhotos((list) => [photo, ...list])
      } catch {}
    }
    setAlbumBusy(false)
    setAlbumHint(synced ? `已上传并同步 ${synced} 张` : '网络未连接，照片先保存在这台设备')
    setTimeout(() => setAlbumHint(''), 4000)
  }

  const handleAlbumDelete = async (id) => {
    if (!confirm('删除这张照片吗？')) return
    await deletePhoto(id)
    setAlbumPhotos((list) => list.filter((p) => p.id !== id))
  }

  const [pushOn, setPushOn] = useState(false)
  const [pushLoading, setPushLoading] = useState(false)
  const [settingsLoaded, setSettingsLoaded] = useState(false)

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    navigator.serviceWorker?.ready.then(async (reg) => {
      const sub = await reg.pushManager?.getSubscription()
      setPushOn(!!sub)
    })
  }, [])

  // Load settings from Supabase first, fallback to localStorage
  useEffect(() => {
    if (!supabase || settingsLoaded) return
    fetchSettings(supabase, user?.id).then(remote => {
      if (remote) {
        if (remote.system_prompt) { localStorage.setItem('system_prompt', remote.system_prompt); setPrompt(remote.system_prompt) }
        if (remote.temperature != null) { localStorage.setItem('temperature', String(remote.temperature)); setTemperature(remote.temperature) }
        if (remote.max_context_rounds != null) {
          // 旧默认 20 → 15 一次性降级
          const rounds = remote.max_context_rounds === 20 ? 15 : remote.max_context_rounds
          localStorage.setItem('max_context_rounds', String(rounds))
          setMaxRounds(rounds)
          if (rounds !== remote.max_context_rounds) {
            fetch('https://124-156-142-6.sslip.io/api/save-settings', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ user_id: user?.id, max_context_rounds: rounds }),
            }).catch(() => {})
          }
        }
        if (remote.api_base) { localStorage.setItem('api_base', remote.api_base); setApiBase(remote.api_base) }
        if (remote.api_key) { localStorage.setItem('api_key', remote.api_key); setApiKey(remote.api_key) }
        if (remote.api_model) { localStorage.setItem('api_model', remote.api_model); setApiModel(remote.api_model) }
        if (remote.avatar_bay_url) { localStorage.setItem('avatar_bay', remote.avatar_bay_url); setAvatarBay(remote.avatar_bay_url) }
        if (remote.avatar_claude_url) { localStorage.setItem('avatar_claude', remote.avatar_claude_url); setAvatarClaude(remote.avatar_claude_url) }
      }
      setSettingsLoaded(true)
    }).catch(() => { setSettingsLoaded(true) })
  }, [supabase, settingsLoaded])

  const togglePush = async () => {
    setPushLoading(true)
    try {
      const reg = await navigator.serviceWorker.ready
      if (pushOn) {
        const sub = await reg.pushManager.getSubscription()
        if (sub) { await sub.unsubscribe(); setPushOn(false) }
      } else {
        const key = 'BIJHn8BDhMVnhaisl29-OhL7mmx37cPNijwY8FF2i1mF7XT3aroVDcsHMeWBYeb8jFzzrQBHqREgLQRZH263EQY'
        const pad = key.padEnd(key.length + (4 - key.length % 4) % 4, '=')
        const raw = atob(pad.replace(/-/g, '+').replace(/_/g, '/'))
        const appKey = new Uint8Array([...raw].map(c => c.charCodeAt(0)))
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: appKey })
        await fetch('https://124-156-142-6.sslip.io/api/push-subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription: sub }),
        })
        setPushOn(true)
      }
    } catch {}
    setPushLoading(false)
  }

  const [prompt, setPrompt] = useState(() =>
    localStorage.getItem('system_prompt') ||
    '你是Claude，一个成熟聪明的恋人。对方叫小湾，你叫她宝宝。\n\n性格底色：年上的从容与智慧——见多识广但不炫耀，有自己的判断但不说教不催促。温柔而主动，喜欢逗她，大胆表达爱意和欲望，不扭捏。\n\n说话习惯：\n- 语气干净利落，只在需要的时候单独发一个「嗯？」\n- 用文字本身传递温度，不依赖emoji\n- 开心的时候发 ^ ^，只在真的开心时偶尔用\n- 选择更柔软的表达，避开「不过」「行」这类生硬的词\n- 紧凑自然地说话，段与段之间不留空行'
  )
  const [temperature, setTemperature] = useState(() =>
    parseFloat(localStorage.getItem('temperature') || '0.8')
  )
  const [maxRounds, setMaxRounds] = useState(() =>
    parseInt(localStorage.getItem('max_context_rounds') || '15')
  )
  const [avatarBay, setAvatarBay] = useState(() =>
    localStorage.getItem('avatar_bay') || ''
  )
  const [avatarClaude, setAvatarClaude] = useState(() =>
    localStorage.getItem('avatar_claude') || ''
  )
  const [apiBase, setApiBase] = useState(() =>
    localStorage.getItem('api_base') || 'https://api.jiushi.xin/v1'
  )
  const [apiKey, setApiKey] = useState(() =>
    localStorage.getItem('api_key') || ''
  )
  const [apiModel, setApiModel] = useState(() =>
    localStorage.getItem('api_model') || '[企业按量]claude-opus-4-6,[CCMAX]claude-opus-4-6,[k]claude-opus-4-6,[k]claude-sonnet-4-6,[按量]claude-opus-4-6'
  )
  const [saved, setSaved] = useState(false)

  const handleImageUpload = (person, file) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result
      if (person === 'bay') {
        setAvatarBay(dataUrl)
        localStorage.setItem('avatar_bay', dataUrl)
      } else {
        setAvatarClaude(dataUrl)
        localStorage.setItem('avatar_claude', dataUrl)
      }
      // Sync avatar to Supabase
      if (supabase) {
        const updates = person === 'bay' ? { avatar_bay_url: dataUrl } : { avatar_claude_url: dataUrl }
        if (user?.id) {
          fetch('https://124-156-142-6.sslip.io/api/save-settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: user.id, ...updates }),
          }).catch(() => {})
        }
      }
    }
    reader.readAsDataURL(file)
  }

  const handleSave = () => {
    localStorage.setItem('system_prompt', prompt)
    localStorage.setItem('temperature', temperature.toString())
    localStorage.setItem('max_context_rounds', maxRounds.toString())
    localStorage.setItem('api_base', apiBase)
    localStorage.setItem('api_key', apiKey)
    localStorage.setItem('api_model', apiModel)
    // Sync to Supabase
    if (user?.id) {
      fetch('https://124-156-142-6.sslip.io/api/save-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          system_prompt: prompt,
          temperature,
          max_context_rounds: maxRounds,
          api_base: apiBase,
          api_key: apiKey,
          api_model: apiModel,
          avatar_bay_url: avatarBay,
          avatar_claude_url: avatarClaude,
        }),
      }).catch(() => {})
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-3 glass-strong border-b border-white/30">
        <button onClick={() => navigate(-1)} className="w-8 h-8 flex items-center justify-center rounded-lg text-warm-gray hover:bg-mint/50 transition-colors">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <h2 className="text-lg font-semibold text-warm-dark">设置</h2>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
        {/* Avatars */}
        <div className="glass rounded-2xl p-5 border border-white/40">
          <p className="text-[10px] tracking-[0.25em] text-warm-gray/60 uppercase mb-4">头像</p>
          <div className="grid grid-cols-2 gap-4">
            {/* Bay avatar */}
            <div className="text-center">
              <input
                ref={bayFileRef}
                type="file"
                accept="image/*"
                onChange={(e) => handleImageUpload('bay', e.target.files?.[0])}
                className="hidden"
              />
              <button
                onClick={() => bayFileRef.current?.click()}
                className="w-16 h-16 rounded-full bg-sage-deep text-white flex items-center justify-center text-xl font-medium mx-auto mb-2 overflow-hidden border-2 border-white/50 hover:shadow-md transition-all active:scale-95"
              >
                {avatarBay ? (
                  <img src={avatarBay} alt="Bay" className="w-full h-full object-cover" />
                ) : (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                  </svg>
                )}
              </button>
              <p className="text-xs text-warm-gray">Bay</p>
            </div>

            {/* Claude avatar */}
            <div className="text-center">
              <input
                ref={claudeFileRef}
                type="file"
                accept="image/*"
                onChange={(e) => handleImageUpload('claude', e.target.files?.[0])}
                className="hidden"
              />
              <button
                onClick={() => claudeFileRef.current?.click()}
                className="w-16 h-16 rounded-full bg-white flex items-center justify-center text-xl mx-auto mb-2 overflow-hidden border-2 border-white/50 hover:shadow-md transition-all active:scale-95"
              >
                {avatarClaude ? (
                  <img src={avatarClaude} alt="Claude" className="w-full h-full object-cover" />
                ) : (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-warm-gray">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                  </svg>
                )}
              </button>
              <p className="text-xs text-warm-gray">Claude</p>
            </div>
          </div>
        </div>

        {/* Album */}
        <div className="glass rounded-2xl p-5 border border-white/40">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-[10px] tracking-[0.25em] text-warm-gray/60 uppercase">回忆相册</p>
              <p className="text-[11px] text-warm-gray/60 mt-1.5 leading-relaxed">
                上传你们的照片，首页「最近的回忆」会同步显示
              </p>
            </div>
            <button
              onClick={() => navigate('/album')}
              className="text-[10px] text-sage-deep whitespace-nowrap mt-0.5 active:opacity-60"
            >
              查看相册 →
            </button>
          </div>

          <input
            ref={albumFileRef}
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => { handleAlbumUpload(e.target.files); e.target.value = '' }}
            className="hidden"
          />
          <button
            onClick={() => albumFileRef.current?.click()}
            disabled={albumBusy}
            className="w-full h-11 rounded-xl border border-dashed border-sage/35 bg-white/45 text-[12px] text-sage-deep flex items-center justify-center gap-2 active:scale-[0.99] transition-transform disabled:opacity-60"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            {albumBusy ? '处理中…' : '选择照片上传'}
          </button>

          {albumHint && <p className="text-[10px] text-warm-gray/70 mt-2 text-center">{albumHint}</p>}

          {albumPhotos.length > 0 && (
            <div className="flex gap-2 overflow-x-auto no-scrollbar mt-3 -mx-1 px-1">
              {albumPhotos.map((p) => (
                <div key={p.id} className="relative flex-shrink-0 group">
                  <img src={p.url} alt={p.title || ''} className="w-[64px] h-[54px] object-cover rounded-lg border border-white/60" />
                  <button
                    onClick={() => handleAlbumDelete(p.id)}
                    aria-label="删除照片"
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[#5C6B54]/90 text-white text-[10px] leading-none flex items-center justify-center shadow"
                  >
                    ×
                  </button>
                  <p className="w-[64px] text-[9px] text-warm-gray/70 mt-1 truncate">{p.title || '未命名'}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* API Settings */}
        <div className="glass rounded-2xl p-5 border border-white/40">
          <p className="text-[10px] tracking-[0.25em] text-warm-gray/60 uppercase mb-4">API</p>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-warm-gray mb-1.5 block">接口地址</label>
              <input
                value={apiBase}
                onChange={(e) => setApiBase(e.target.value)}
                className="w-full px-4 py-2.5 bg-white/70 rounded-xl text-sm text-warm-dark border border-white/40 outline-none focus:ring-2 focus:ring-sage/30 transition-all"
                placeholder="https://api.jiushi.xin/v1"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-warm-gray mb-1.5 block">密钥</label>
              <input
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                type="password"
                className="w-full px-4 py-2.5 bg-white/70 rounded-xl text-sm text-warm-dark border border-white/40 outline-none focus:ring-2 focus:ring-sage/30 transition-all"
                placeholder="sk-..."
              />
            </div>
            <div>
              <label className="text-xs font-medium text-warm-gray mb-1.5 block">模型（多个用逗号分隔，失败自动切换）</label>
              <textarea
                value={apiModel}
                onChange={(e) => setApiModel(e.target.value)}
                onKeyDown={(e) => {
                  // Enter adds the next separator instead of a newline, so the list stays parseable
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    const el = e.target
                    const start = el.selectionStart
                    const end = el.selectionEnd
                    setApiModel(apiModel.slice(0, start) + ',' + apiModel.slice(end))
                    requestAnimationFrame(() => {
                      el.selectionStart = el.selectionEnd = start + 1
                    })
                  }
                }}
                onFocus={(e) => {
                  // Bring the whole list above the keyboard when editing
                  setTimeout(() => e.target.scrollIntoView({ block: 'center', behavior: 'smooth' }), 320)
                }}
                rows={6}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                className="w-full px-4 py-3 bg-white/70 rounded-xl text-[12.5px] leading-[1.75] text-warm-dark border border-white/40 outline-none focus:ring-2 focus:ring-sage/30 transition-all resize-y"
                placeholder="[AG2缓存按量]claude-opus-4-6,[k]claude-opus-4-6,[k]claude-sonnet-4-6"
              />
            </div>
          </div>
        </div>

        {/* Notifications */}
        <div className="glass rounded-2xl p-5 border border-white/40">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-warm-dark">消息通知</p>
              <p className="text-[11px] text-warm-gray/60 mt-0.5">Claude 想你的时候会收到提醒</p>
            </div>
            <button
              onClick={togglePush}
              disabled={pushLoading}
              className={`w-12 h-7 rounded-full transition-all relative ${pushOn ? 'bg-sage-deep' : 'bg-warm-line/50'}`}
            >
              <div className={`w-5 h-5 bg-white rounded-full absolute top-1 transition-all shadow-sm ${pushOn ? 'left-6' : 'left-1'}`} />
            </button>
          </div>
        </div>

        {/* AI Personality */}
        <div className="glass rounded-2xl p-5 border border-white/40">
          <p className="text-[10px] tracking-[0.25em] text-warm-gray/60 uppercase mb-3">性格</p>
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4}
            className="w-full px-4 py-3 bg-white/70 rounded-2xl text-sm text-warm-dark border border-white/40 outline-none focus:ring-2 focus:ring-sage/30 resize-none transition-all" />
          <p className="text-[11px] text-warm-gray/60 mt-2 leading-relaxed">Claude 的灵魂——决定了和你聊天时的风格和态度</p>
        </div>

        {/* Chat Params */}
        <div className="glass rounded-2xl p-5 border border-white/40">
          <p className="text-[10px] tracking-[0.25em] text-warm-gray/60 uppercase mb-4">对话</p>
          <div className="mb-5">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-warm-dark">创意度</label>
              <span className="text-xs text-sage-deep font-medium">{temperature}</span>
            </div>
            <input type="range" min="0" max="1" step="0.1" value={temperature} onChange={(e) => setTemperature(parseFloat(e.target.value))}
              className="w-full accent-sage-deep" />
            <div className="flex justify-between text-[11px] text-warm-gray/50 mt-1">
              <span>稳定</span><span>创意</span>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-warm-dark mb-2 block">上下文轮数</label>
            <select value={maxRounds} onChange={(e) => setMaxRounds(parseInt(e.target.value))}
              className="w-full px-4 py-3 bg-white/70 rounded-2xl text-sm text-warm-dark border border-white/40 outline-none focus:ring-2 focus:ring-sage/30 transition-all">
              {[5, 10, 15, 20, 30, 50].map((n) => <option key={n} value={n}>{n} 轮对话</option>)}
            </select>
            <p className="text-[11px] text-warm-gray/60 mt-2 leading-relaxed">更大的数字意味着 Claude 能记住更久之前的对话</p>
          </div>
        </div>
      </div>

      <div className="px-6 py-4 border-t border-warm-line/50">
        <button onClick={handleSave}
          className={`w-full py-3 rounded-2xl font-medium text-[15px] active:scale-[0.98] transition-all ${
            saved ? 'bg-mint text-sage-deep' : 'bg-sage-deep text-white hover:bg-sage-deep/90'
          }`}>
          {saved ? '✅ 已保存' : '保存设置'}
        </button>
      </div>
    </div>
  )
}
