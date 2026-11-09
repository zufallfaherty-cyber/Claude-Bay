import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import useTiltParallax from '../hooks/useTiltParallax'

const playfair = { fontFamily: '"Playfair Display", serif' }

// The living-room artwork (bg-games.jpg) is 851 × 1849. Labels sit at % of
// that canvas, so they stay glued to the table however the image is cropped.
const ART_W = 851
const ART_H = 1849

const SPOTS = [
  { id: 'ludo', cn: '飞行棋', en: 'Ludo', left: '44%', top: '77%', align: 'is-center', tone: 'on-board' },
  { id: 'call', cn: '通话', en: 'Call', left: '78.5%', top: '64.5%', align: 'is-right', tone: 'on-wood' },
]

export default function GamesPage() {
  const navigate = useNavigate()
  useTiltParallax() // same glasses-free drift as the home page / study

  const wrapRef = useRef(null)
  const [stage, setStage] = useState(null)
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

  useEffect(() => () => clearTimeout(toastTimer.current), [])

  const showToast = (message) => {
    setToast(message)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 2200)
  }

  const openSpot = (id) => {
    if (id === 'ludo') return navigate('/games/ludo')
    if (id === 'call') return navigate('/call')
    showToast('功能页面稍后开放')
  }

  return (
    <div className="relative flex flex-col h-full">
      {/* ── The living-room scene ── */}
      <div ref={wrapRef} className="games-wrap">
        {stage && (
          <div
            className="games-stage"
            style={{ width: stage.w, height: stage.h, left: stage.x, top: stage.y, '--k': stage.k }}
          >
            <img src="/bg-games.jpg" alt="" draggable="false" />

            {SPOTS.map((spot) => (
              <button
                key={spot.id}
                onClick={() => openSpot(spot.id)}
                aria-label={spot.cn}
                className={`game-label ${spot.align} ${spot.tone} study-float`}
                style={{ left: spot.left, top: spot.top }}
              >
                <span className="cn">{spot.cn}</span>
                <span className="rule" />
                <span className="en">{spot.en}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Floating header ── */}
      <header className="absolute top-0 inset-x-0 z-20 flex items-center gap-3 px-4 pt-4 pb-2 pointer-events-none">
        <button
          onClick={() => navigate('/')}
          aria-label="返回"
          className="study-back pointer-events-auto w-9 h-9 rounded-full flex items-center justify-center text-warm-dark/65 active:scale-90 transition-transform"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div className="flex-1 min-w-0 text-center">
          <h1 className="text-[15px] font-semibold text-warm-dark tracking-[0.08em]">小游戏</h1>
          <p className="italic text-[9px] text-warm-gray/65 leading-none mt-1" style={playfair}>Little Games</p>
        </div>
        <div className="w-9 h-9 flex items-center justify-center text-sage-deep/40">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
            <path d="M8 8h2v2H8zM14 8h2v2h-2zM8 14h2v2H8zM14 14h2v2h-2z" />
          </svg>
        </div>
      </header>

      {toast && <div className="study-toast">{toast}</div>}
    </div>
  )
}
