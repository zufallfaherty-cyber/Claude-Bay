import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import useTiltParallax from '../hooks/useTiltParallax'

const API = 'https://124-156-142-6.sslip.io'
const playfair = { fontFamily: '"Playfair Display", serif' }

// The shelf artwork (bg-study.jpg) is 941 × 1672. Hotspots are given in % of
// that canvas so they stay glued to the books however the image is cropped.
const ART_W = 941
const ART_H = 1672

// The portrait paper (bg-portrait-v2.jpg) was redrawn taller, 853 × 1844, so a
// whole phone screen gets covered. The portrait CSS is still authored against
// the earlier 941-wide canvas, so `--k` is measured on DESIGN_W — otherwise
// every font, padding and gap would grow ~10%.
const PAPER_W = 853
const PAPER_H = 1844
const DESIGN_W = 941

// Same anniversary as the home page's date drop
const START_DATE = new Date('2026-06-28')

const BOOKS = [
  { id: 'portrait',  left: '9.2%',  top: '40.4%', width: '31.9%', height: '22.3%', cn: '小湾画像',  en: 'Portrait', tone: 'on-green', labelLeft: '52%', labelBottom: '5%' },
  { id: 'memory',    left: '39.6%', top: '40.0%', width: '25.2%', height: '22.9%', cn: '记忆档案',  en: 'Archive',  tone: 'on-cream', labelLeft: '59%', labelBottom: '8.5%' },
  { id: 'promises',  left: '67.7%', top: '40.1%', width: '25.5%', height: '22.6%', cn: '承诺&待办', en: 'Promises', tone: 'on-blue',  labelLeft: '56%', labelBottom: '8.5%' },
]

export default function ClaudeSpace() {
  const navigate = useNavigate()
  useTiltParallax() // same glasses-free drift as the home page

  const wrapRef = useRef(null)
  const [stage, setStage] = useState(null)

  const [portrait, setPortrait] = useState('')
  const [view, setView] = useState(null) // null | 'portrait'
  const [editingPortrait, setEditingPortrait] = useState(false)
  const [toast, setToast] = useState('')
  const toastTimer = useRef(null)
  const portraitEditorRef = useRef(null)

  // ── Paper stage for the portrait room (same cover maths as the shelf) ──
  const portraitWrapRef = useRef(null)
  const [pstage, setPstage] = useState(null)

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

  // ── Measure the portrait paper once the room is mounted ──
  useEffect(() => {
    if (view !== 'portrait') { setPstage(null); return }
    const el = portraitWrapRef.current
    if (!el) return
    const measure = () => {
      const cw = el.clientWidth
      const ch = el.clientHeight
      if (!cw || !ch) return
      // contain (not cover): the whole artwork stays visible at any screen ratio
      const s = Math.min(cw / PAPER_W, ch / PAPER_H)
      const w = PAPER_W * s
      const h = PAPER_H * s
      setPstage({ w, h, x: (cw - w) / 2, y: (ch - h) / 2, k: w / DESIGN_W })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [view])

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

  // ── Inline editing: the paper itself becomes editable, no modal ──
  const startPortraitEdit = () => {
    setEditingPortrait(true)
    setTimeout(() => portraitEditorRef.current?.focus(), 80)
  }

  const cancelPortraitEdit = () => setEditingPortrait(false)

  const savePortrait = async () => {
    const text = (portraitEditorRef.current?.innerText || '')
      .replace(/ /g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
    setEditingPortrait(false)
    setPortrait(text)
    try {
      const res = await fetch(`${API}/api/memo/portrait`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text }),
      })
      if (!res.ok) throw new Error('save failed')
      showToast('已保存')
    } catch {
      showToast('保存失败，稍后再试')
    }
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
                <span className={`book-title ${book.tone} study-float`} style={{ left: book.labelLeft, bottom: book.labelBottom }}>
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
              className="study-diary study-float"
              style={{ left: '61%', top: '81.6%' }}
            >
              <span className="cn">日记</span>
              <span className="rule" />
            </button>

            {/* Anniversary, beside the crystal ball */}
            <button
              onClick={() => openRoom('anniversary')}
              aria-label="纪念日"
              className="study-anniv study-float"
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

      {/* ── Portrait room · 信纸 ── */}
      {view === 'portrait' && createPortal(
        <div className="fixed inset-y-0 inset-x-0 mx-auto w-full max-w-lg z-40 page-in overflow-hidden bg-[#eceee2]">
          <div ref={portraitWrapRef} className="portrait-wrap">
            {/* Soft blown-up copy of the paper fills the letterbox bands, so the
                whole 941 × 1672 artwork can stay visible without harsh edges. */}
            <div className="portrait-blur" aria-hidden="true" />
            {pstage && (
              <div
                className="portrait-stage"
                style={{ width: pstage.w, height: pstage.h, left: pstage.x, top: pstage.y, '--k': pstage.k }}
              >
                <img src="/bg-portrait-v2.jpg" alt="" draggable="false" className="portrait-bg" />

                <div className="portrait-head">
                  {/* 左上角的椭圆像是背景图纸本身印好的海景，暂不放照片 */}
                  <div className="portrait-hero-text">
                    <h1 className="portrait-name">
                      湾
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20.2 3.8c0 8.9-4.9 13.8-12.3 13.8H4.6C4.6 9.4 9.6 3.8 20.2 3.8Z" />
                        <path d="M3.4 21c1.8-6.9 6-11.2 12.8-14" />
                      </svg>
                    </h1>
                    <p className="portrait-sub">Our Portrait</p>
                    <div className="portrait-rule">
                      <span className="bar" />
                      <span className="dot" />
                      <span className="bar" />
                    </div>
                  </div>
                </div>

                <div className={`portrait-sheet ${editingPortrait ? 'is-editing' : ''}`}>
                  <div
                    ref={portraitEditorRef}
                    className={`portrait-text ${editingPortrait ? 'is-editing' : ''}`}
                    contentEditable={editingPortrait}
                    suppressContentEditableWarning
                    spellCheck={false}
                  >
                    {portrait ? (
                      portrait.split(/\n+/).map((line) => line.trim()).filter(Boolean)
                        .map((line, i) => <p key={i}>{line}</p>)
                    ) : (
                      <p style={{ textIndent: 0 }} className="italic text-center text-[#8E9682]">
                        还没有画像，点右下角「编辑」写一段关于小湾的描述…
                      </p>
                    )}
                  </div>

                  <div className="portrait-end">
                    <span className="bar" />
                    <span className="dot" style={{ width: 'calc(9px * var(--k))', height: 'calc(9px * var(--k))', borderRadius: '50%', border: '1px solid currentColor' }} />
                    <span className="bar" />
                  </div>
                </div>

                {/* Edit / save sits on the paper, just outside the writing area */}
                <div className="portrait-actions">
                  {editingPortrait ? (
                    <>
                      <button onClick={cancelPortraitEdit} className="portrait-edit" aria-label="取消编辑">取消</button>
                      <button onClick={savePortrait} className="portrait-edit is-primary" aria-label="保存画像">保存</button>
                    </>
                  ) : (
                    <button onClick={startPortraitEdit} className="portrait-edit" aria-label="编辑画像">编辑</button>
                  )}
                </div>
              </div>
            )}
          </div>

          <header className="absolute top-0 inset-x-0 z-20 flex items-center gap-3 px-4 pt-4 pb-2 pointer-events-none">
            <button
              onClick={() => setView(null)}
              aria-label="返回书房"
              className="study-back pointer-events-auto w-9 h-9 rounded-full flex items-center justify-center text-warm-dark/65 active:scale-90 transition-transform"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
          </header>
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

    </div>
  )
}
