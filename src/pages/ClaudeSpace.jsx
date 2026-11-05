import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'

const API = 'https://124-156-142-6.sslip.io'
const playfair = { fontFamily: '"Playfair Display", serif' }

// The artwork is 941 × 1672. Hotspots are given in % of that canvas so they
// stay glued to the books no matter how the image is cropped on screen.
const ART_W = 941
const ART_H = 1672

// Same anniversary as the home page's date drop
const START_DATE = new Date('2026-06-28')

const BOOKS = [
  { id: 'portrait',  left: '9.2%',  top: '40.4%', width: '31.9%', height: '22.3%', cn: '小湾画像',  en: 'Portrait', tone: 'on-green', labelLeft: '52%', labelBottom: '5%' },
  { id: 'memory',    left: '39.6%', top: '40.0%', width: '25.2%', height: '22.9%', cn: '记忆档案',  en: 'Archive',  tone: 'on-cream', labelLeft: '59%', labelBottom: '8.5%' },
  { id: 'promises',  left: '67.7%', top: '40.1%', width: '25.5%', height: '22.6%', cn: '承诺&待办', en: 'Promises', tone: 'on-blue',  labelLeft: '56%', labelBottom: '8.5%' },
]

export default function ClaudeSpace() {
  const navigate = useNavigate()

  const wrapRef = useRef(null)
  const [stage, setStage] = useState(null)

  const [portrait, setPortrait] = useState('')
  const [view, setView] = useState(null) // null | 'portrait'
  const [editingPortrait, setEditingPortrait] = useState(false)
  const [portraitDraft, setPortraitDraft] = useState('')
  const [toast, setToast] = useState('')
  const toastTimer = useRef(null)

  // ── Fit the artwork like background-size: cover, but as a measurable stage ──
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const measure = () => {
      const cw = el.clientWidth
      const ch = el.clientHeight
      if (!cw || !ch) return
      const s = Math.max(cw / ART_W, ch / ART_H)
      const w = ART_W * s
      const h = ART_H * s
      setStage({ w, h, x: (cw - w) / 2, y: (ch - h) / 2, k: w / ART_W })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // ── Load portrait ──
  const loadMemo = async () => {
    try {
      const res = await fetch(`${API}/api/memo`)
      const json = await res.json()
      setPortrait(json.portrait?.content || '')
    } catch {}
  }

  useEffect(() => { loadMemo() }, [])

  useEffect(() => () => clearTimeout(toastTimer.current), [])

  const showToast = (message) => {
    setToast(message)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 2200)
  }

  const openPortraitEditor = () => {
    setPortraitDraft(portrait)
    setEditingPortrait(true)
  }

  const savePortrait = async () => {
    await fetch(`${API}/api/memo/portrait`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: portraitDraft }),
    })
    setPortrait(portraitDraft)
    setEditingPortrait(false)
  }

  const openRoom = (id) => {
    if (id === 'portrait') return setView('portrait')
    if (id === 'anniversary') return setView('anniversary')
    if (id === 'memory') return navigate('/profile/memory')
    showToast(id === 'promises' ? '承诺 & 待办 · 功能页面稍后开放' : '日记 · 功能页面稍后开放')
  }

  const daysTogether = Math.max(1, Math.floor((new Date() - START_DATE) / 86400000) + 1)

  return (
    <div className="relative flex flex-col h-full">
      {/* ── The shelf scene ── */}
      <div ref={wrapRef} className="study-wrap">
        {stage && (
          <div
            className="study-stage"
            style={{ width: stage.w, height: stage.h, left: stage.x, top: stage.y, '--k': stage.k }}
          >
            <img src="/bg-study.jpg" alt="" draggable="false" />

            {BOOKS.map((book) => (
              <button
                key={book.id}
                onClick={() => openRoom(book.id)}
                aria-label={book.cn}
                className="book-hotspot"
                style={{ left: book.left, top: book.top, width: book.width, height: book.height }}
              >
                <span className={`book-title ${book.tone}`} style={{ left: book.labelLeft, bottom: book.labelBottom }}>
                  <span className="cn">{book.cn}</span>
                  <span className="rule" />
                  <span className="en">{book.en}</span>
                </span>
              </button>
            ))}

            {/* Diary — written on the upper right of the open book */}
            <button
              onClick={() => openRoom('diary')}
              aria-label="日记"
              className="study-diary"
              style={{ left: '61%', top: '81.6%' }}
            >
              <span className="cn">日记</span>
              <span className="rule" />
            </button>

            {/* Anniversary, beside the crystal ball */}
            <button
              onClick={() => openRoom('anniversary')}
              aria-label="纪念日"
              className="study-anniv"
              style={{ left: '28.2%', top: '75.9%' }}
            >
              <span className="cn">纪念日</span>
              <span className="rule" />
              <span className="en">Anniversary</span>
            </button>

          </div>
        )}
      </div>

      {/* ── Floating header ── */}
      <header className="absolute top-0 inset-x-0 z-20 flex items-center gap-3 px-4 pt-4 pb-2 pointer-events-none">
        <button
          onClick={() => navigate(-1)}
          aria-label="返回"
          className="study-back pointer-events-auto w-9 h-9 rounded-full flex items-center justify-center text-warm-dark/65 active:scale-90 transition-transform"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div className="flex-1 min-w-0 text-center">
          <h1 className="text-[15px] font-semibold text-warm-dark tracking-[0.08em]">Claude的书房</h1>
          <p className="italic text-[9px] text-warm-gray/65 leading-none mt-1" style={playfair}>Claude&apos;s Study</p>
        </div>
        <div className="w-9 h-9 flex items-center justify-center text-sage-deep/40">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 6.4C10.5 4.8 8.2 4 5 4H3v14h2c3.2 0 5.5.8 7 2.4 1.5-1.6 3.8-2.4 7-2.4h2V4h-2c-3.2 0-5.5.8-7 2.4Z" />
            <path d="M12 6.4v14" />
          </svg>
        </div>
      </header>

      {toast && <div className="study-toast">{toast}</div>}

      {/* ── Portrait room ── */}
      {view === 'portrait' && createPortal(
        <div className="fixed inset-y-0 inset-x-0 mx-auto w-full max-w-lg z-40 bg-[#f8f6f0] flex flex-col page-in">
          <header className="flex-shrink-0 flex items-center gap-3 px-4 pt-4 pb-3 border-b border-warm-line/50">
            <button
              onClick={() => setView(null)}
              aria-label="返回书房"
              className="study-back w-9 h-9 rounded-full flex items-center justify-center text-warm-dark/65 active:scale-90 transition-transform"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-semibold text-warm-dark tracking-[0.06em]">小湾画像</p>
              <p className="italic text-[9px] text-warm-gray/65 leading-none mt-1" style={playfair}>Portrait</p>
            </div>
            <button
              onClick={openPortraitEditor}
              aria-label="编辑画像"
              className="rounded-full bg-white/65 border border-sage-deep/25 px-3.5 py-1.5 text-[12px] text-sage-deep font-medium active:scale-95 transition-all"
            >编辑</button>
          </header>

          <div className="flex-1 overflow-y-auto px-5 pt-4 pb-[calc(env(safe-area-inset-bottom)+28px)]">
            <div className="study-paper rounded-[26px] px-5 py-5">
              {portrait ? (
                <p className="text-[14px] leading-[1.95] tracking-[0.02em] text-[#45423E] whitespace-pre-wrap">{portrait}</p>
              ) : (
                <p className="text-[12.5px] text-warm-gray/55 italic">还没有画像，点「编辑」写一段关于小湾的描述…</p>
              )}
            </div>
            <p className="text-center italic text-[9px] text-warm-gray/40 mt-6" style={playfair}>
              A quiet place for us
            </p>
          </div>
        </div>,
        document.body
      )}

      {/* ── Anniversary room (layout to be designed later) ── */}
      {view === 'anniversary' && createPortal(
        <div className="fixed inset-y-0 inset-x-0 mx-auto w-full max-w-lg z-40 bg-[#f8f6f0] flex flex-col page-in">
          <header className="flex-shrink-0 flex items-center gap-3 px-4 pt-4 pb-3 border-b border-warm-line/50">
            <button
              onClick={() => setView(null)}
              aria-label="返回书房"
              className="study-back w-9 h-9 rounded-full flex items-center justify-center text-warm-dark/65 active:scale-90 transition-transform"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-semibold text-warm-dark tracking-[0.06em]">纪念日</p>
              <p className="italic text-[9px] text-warm-gray/65 leading-none mt-1" style={playfair}>Anniversary</p>
            </div>
            <div className="w-9 h-9" />
          </header>

          <div className="flex-1 overflow-y-auto px-5 pt-6 pb-[calc(env(safe-area-inset-bottom)+28px)]">
            <div className="study-paper rounded-[26px] px-6 py-9 text-center">
              <p className="italic text-[40px] leading-none text-[#5D6856]" style={playfair}>Jun. 28</p>
              <p className="text-[9px] tracking-[0.32em] text-warm-gray/55 mt-2">2026</p>
              <div className="w-10 h-px bg-warm-gray/20 mx-auto my-6" />
              <p className="text-[12px] text-warm-gray/65">我们在一起</p>
              <p className="mt-1">
                <span className="text-[28px] text-warm-dark/85" style={playfair}>{daysTogether}</span>
                <span className="text-[12px] text-warm-gray/65 ml-1">天</span>
              </p>
              <p className="text-[11px] text-warm-gray/50 mt-7 leading-relaxed">
                纪念日界面还在设计，之后一起完善
              </p>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Portrait editor ── */}
      {editingPortrait && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6" onClick={() => setEditingPortrait(false)}>
          <div className="absolute inset-0 bg-[#2f3a2b]/35 backdrop-blur-[3px]" />
          <div
            className="relative bg-cream/95 backdrop-blur-xl rounded-[28px] w-full max-w-lg flex flex-col overflow-hidden border border-white/60 shadow-2xl animate-[modalPop_0.25s_ease-out]"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 pt-6 pb-4">
              <div>
                <p className="text-[17px] font-semibold text-warm-dark">编辑画像</p>
                <p className="italic text-[10px] text-warm-gray/60 mt-1" style={playfair}>About Bay</p>
              </div>
              <button onClick={() => setEditingPortrait(false)} aria-label="关闭" className="text-warm-gray active:scale-90 p-1">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="px-6 pb-6 flex flex-col gap-5">
              <textarea
                value={portraitDraft}
                onChange={e => setPortraitDraft(e.target.value)}
                className="w-full bg-white/70 border border-white/40 rounded-2xl p-5 text-[15px] text-warm-dark leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-sage/30"
                rows={9}
                placeholder="写一段关于小湾的描述…"
              />
              <div className="flex gap-3">
                <button
                  onClick={() => setEditingPortrait(false)}
                  className="flex-1 py-3.5 rounded-2xl border border-sage-deep/30 text-sage-deep text-[15px] font-medium active:scale-[0.98] transition-all"
                >取消</button>
                <button
                  onClick={savePortrait}
                  className="flex-1 py-3.5 bg-sage-deep text-white rounded-2xl text-[15px] font-semibold active:scale-[0.98] transition-all"
                >保存</button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
