import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { getDailyQuote } from '../lib/quotes'
import { loadAlbum } from '../lib/album'
import { SAMPLE_PHOTOS } from '../lib/albumSamples'
import PhotoViewer from '../components/PhotoViewer'
import useTiltParallax from '../hooks/useTiltParallax'

// ── Animation variants (skip on re-mount to avoid flash) ──
const fadeUp = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
}

const CARDS_VISITED_KEY = 'dashboard_cards_shown'
function useSkipCardAnimation() {
  const visited = sessionStorage.getItem(CARDS_VISITED_KEY)
  if (!visited) {
    sessionStorage.setItem(CARDS_VISITED_KEY, '1')
    return false
  }
  return true
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 6) return '夜深了'
  if (h < 10) return '早安'
  if (h < 14) return '中午好'
  if (h < 18) return '下午好'
  if (h < 22) return '晚上好'
  return '夜深了'
}

// The day we started — shown in the date drop, days keep counting from it.
const START_DATE = new Date('2026-06-28')

function getTogether() {
  const today = new Date()
  return {
    month: 'Jun',
    day: '28',
    year: START_DATE.getFullYear(),
    days: Math.max(1, Math.floor((today - START_DATE) / 86400000) + 1),
  }
}

// ── Small line icons matching the concept art ──
function IconBook(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 6.4C10.5 4.8 8.2 4 5 4H3v14h2c3.2 0 5.5.8 7 2.4 1.5-1.6 3.8-2.4 7-2.4h2V4h-2c-3.2 0-5.5.8-7 2.4Z" />
      <path d="M12 6.4v14" />
    </svg>
  )
}
function IconGame(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="2.4" y="7" width="19.2" height="10.8" rx="5.4" />
      <path d="M7.4 10.2v4.2M5.3 12.3h4.2" />
      <circle cx="16.4" cy="11.1" r=".85" />
      <circle cx="18.2" cy="13.2" r=".85" />
    </svg>
  )
}
function IconFolder(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M3 7.4a2 2 0 0 1 2-2h4.2l2 2H19a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
    </svg>
  )
}
function IconChat(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M21 14.5a2 2 0 0 1-2 2H8l-4 3.5V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2Z" />
    </svg>
  )
}
function ArrowCircle(props) {
  return (
    <span className={`w-7 h-7 rounded-full bg-white/35 border border-white/55 flex items-center justify-center text-warm-gray/60 ${props.className || ''}`}>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12h14M13 6l6 6-6 6" />
      </svg>
    </span>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [together, setTogether] = useState(getTogether)
  const [photos, setPhotos] = useState([])
  const [active, setActive] = useState(null)
  const skipAnim = useSkipCardAnimation()
  useTiltParallax()
  const greeting = getGreeting()
  const quote = getDailyQuote()

  useEffect(() => {
    const timer = setInterval(() => setTogether(getTogether()), 60000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    let alive = true
    loadAlbum().then((list) => { if (alive) setPhotos(list) })
    return () => { alive = false }
  }, [])

  const shownPhotos = photos.length ? photos : SAMPLE_PHOTOS

  const cardAnim = (delay = 0) => ({
    variants: fadeUp,
    initial: skipAnim ? false : 'initial',
    animate: 'animate',
    transition: { duration: 0.5, delay: skipAnim ? 0 : delay, ease: [0.32, 0, 0.23, 1] },
  })

  return (
    <div className="home-shell flex flex-col h-full">
      {/* ── Header ── */}
      <div className="px-6 pt-5 flex items-start justify-between gap-2 shrink-0">
        <motion.div className="min-w-0 pt-1 tilt-layer-1" {...cardAnim(0)}>
          <h1
            className="italic font-light text-[36px] leading-none text-[#5D6856] whitespace-nowrap"
            style={{ fontFamily: '"Playfair Display", serif', letterSpacing: '0.015em' }}
          >
            Claude &amp; Bay
          </h1>
          <div className="flex items-center gap-2.5 mt-2.5">
            <span className="text-[10px] tracking-[0.24em] text-warm-gray/70">Always here</span>
            <span className="h-px w-9 bg-warm-gray/25" />
          </div>
        </motion.div>

        {/* Date drop — anniversary, not today */}
        <motion.div
          {...cardAnim(0.08)}
          className="shape-date glass-water tilt-layer-1 flex-shrink-0 w-[80px] h-[104px] px-1 py-2.5 flex flex-col items-center justify-center text-center"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" className="text-warm-gray/60">
            <rect x="3" y="5" width="18" height="16" rx="2" />
            <path d="M8 3v4M16 3v4M3 10h18" />
          </svg>
          <p className="italic text-[12px] text-[#5D6856] mt-1 leading-none" style={{ fontFamily: '"Playfair Display", serif' }}>
            {together.month}. {together.day}
          </p>
          <p className="text-[8px] tracking-[0.14em] text-warm-gray/55 mt-0.5">{together.year}</p>
          <div className="mt-1.5 pt-1.5 border-t border-white/55 w-12 text-[8px] leading-[1.4] text-warm-gray/60">
            <span className="text-[11px] text-warm-dark/80" style={{ fontFamily: '"Playfair Display", serif' }}>
              {together.days}
            </span>{' '}days<br />together
          </div>
        </motion.div>
      </div>

      {/* ── Chat pill ── */}
      <motion.div className="px-4 mt-3 shrink-0" {...cardAnim(0.14)}>
        <button
          onClick={() => navigate('/chat')}
          className="shape-chat glass-water chat-glass tilt-layer-2 relative w-full h-[98px] px-4 flex items-center gap-3 active:scale-[0.985] transition-transform"
        >
          <span className="w-[44px] h-[44px] rounded-full flex-shrink-0 flex items-center justify-center text-white shadow-[0_6px_14px_-6px_rgba(60,82,54,0.55)]"
            style={{ background: 'linear-gradient(145deg, #8AA680 0%, #5C7A54 55%, #4C6747 100%)' }}
          >
            <IconChat className="w-[19px] h-[19px]" />
          </span>
          <div className="flex-1 text-center pr-1">
            <p className="text-[17px] tracking-[0.08em] text-[#4C4945]">开始聊天</p>
            <p className="italic text-[11.5px] text-warm-gray/75 leading-tight" style={{ fontFamily: '"Playfair Display", serif' }}>
              Chat with Claude
            </p>
            <p className="text-[9px] text-warm-gray/60 mt-0.5 tracking-[0.06em]">
              {greeting}，今天也想听你说说话
            </p>
          </div>
          <ArrowCircle className="flex-shrink-0" />
        </button>
      </motion.div>

      {/* ── Feature islands ── */}
      <div className="home-cards relative flex-1 min-h-0 flex flex-col justify-center px-4 py-3">
        <motion.button
          {...cardAnim(0.2)}
          onClick={() => navigate('/profile/memory')}
          className="shape-island island glass-water tilt-layer-3 relative flex-1 min-h-0 max-h-[126px] w-[62%] self-start px-5 py-1.5 text-left flex flex-col items-start justify-center active:scale-[0.97] transition-transform"
          style={{ rotate: '-0.8deg' }}
        >
          <IconBook className="island-icon w-[22px] h-[22px] text-[#647359]" />
          <p className="island-title text-[13px] leading-tight tracking-[0.06em] text-[#4C4945] mt-0.5">记忆库</p>
          <p className="island-en italic text-[8.5px] text-warm-gray/70 leading-none mt-0.5" style={{ fontFamily: '"Playfair Display", serif' }}>
            Memories
          </p>
          <p className="island-sub text-[7px] text-warm-gray/60 tracking-[0.08em] leading-none mt-0.5">/ 我们的点滴 /</p>
          <ArrowCircle className="absolute right-3.5 top-1/2 -translate-y-1/2" />
        </motion.button>

        <motion.button
          {...cardAnim(0.26)}
          onClick={() => navigate('/games')}
          className="shape-island island glass-water tilt-layer-3 relative flex-1 min-h-0 max-h-[126px] -mt-2.5 w-[58%] self-end px-5 py-1.5 text-left flex flex-col items-start justify-center active:scale-[0.97] transition-transform"
          style={{ rotate: '0.8deg' }}
        >
          <IconGame className="island-icon w-[22px] h-[22px] text-[#647359]" />
          <p className="island-title text-[13px] leading-tight tracking-[0.06em] text-[#4C4945] mt-0.5">小游戏</p>
          <p className="island-en italic text-[8.5px] text-warm-gray/70 leading-none mt-0.5" style={{ fontFamily: '"Playfair Display", serif' }}>
            Games
          </p>
          <p className="island-sub text-[7px] text-warm-gray/60 tracking-[0.08em] leading-none mt-0.5">/ 一起玩一下 /</p>
          <ArrowCircle className="absolute right-3.5 top-1/2 -translate-y-1/2" />
        </motion.button>

        <motion.button
          {...cardAnim(0.32)}
          onClick={() => navigate('/profile/files')}
          className="shape-island island glass-water tilt-layer-3 relative flex-1 min-h-0 max-h-[126px] -mt-2.5 w-[54%] self-start px-5 py-1.5 text-left flex flex-col items-start justify-center active:scale-[0.97] transition-transform"
          style={{ rotate: '-0.8deg' }}
        >
          <span className="absolute right-14 top-2.5 w-11 h-7 rounded-[6px] bg-white/20 border border-white/35 rotate-6" />
          <span className="absolute right-[70px] top-[16px] w-9 h-6 rounded-[6px] bg-white/15 border border-white/30 -rotate-6" />
          <IconFolder className="island-icon w-[22px] h-[22px] text-[#647359] relative" />
          <p className="island-title text-[13px] leading-tight tracking-[0.06em] text-[#4C4945] mt-0.5 relative">文件库</p>
          <p className="island-en italic text-[8.5px] text-warm-gray/70 leading-none mt-0.5 relative" style={{ fontFamily: '"Playfair Display", serif' }}>
            Files
          </p>
          <p className="island-sub text-[7px] text-warm-gray/60 tracking-[0.08em] leading-none mt-0.5 relative">/ 你的文件，我来保管 /</p>
          <ArrowCircle className="absolute right-3.5 top-1/2 -translate-y-1/2" />
        </motion.button>
      </div>

      {/* ── Album strip (photos only, no memory link) ── */}
      <motion.div className="px-4 shrink-0 tilt-layer-2" {...cardAnim(0.42)}>
        <div className="shape-panel album-panel glass-water px-4 pt-2 pb-1.5">
          <div className="flex items-start justify-between">
            <div>
              <p className="album-title text-[12.5px] tracking-[0.08em] text-[#4C4945]">最近的回忆</p>
              <p className="album-sub italic text-[9.5px] text-warm-gray/65 leading-none mt-0.5" style={{ fontFamily: '"Playfair Display", serif' }}>
                Our Memories
              </p>
            </div>
            <button
              onClick={() => navigate('/album')}
              className="text-[9.5px] text-warm-gray/70 flex items-center gap-0.5 mt-0.5 active:opacity-60"
            >
              查看全部
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          </div>

          <div className="flex gap-1.5 overflow-x-auto no-scrollbar mt-1.5 -mx-1 px-1">
            {shownPhotos.map((p) => (
              <button
                key={p.id}
                onClick={() => setActive(p)}
                className="album-item flex-shrink-0 w-[74px] text-left active:scale-[0.96] transition-transform"
              >
                <div className="album-thumb h-[64px] rounded-[10px] relative overflow-hidden border border-white/50 shadow-[inset_0_1px_1px_rgba(255,255,255,0.6)] bg-mint/25">
                  <img
                    src={p.url}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover saturate-[0.95] contrast-[1.04] brightness-[0.99]"
                  />
                  <span className="absolute inset-0 bg-gradient-to-t from-[#3C4636]/25 via-transparent to-white/5" />
                  {p.date && (
                    <span
                      className="absolute bottom-1 left-1.5 album-date text-[7.5px] italic text-white/95 drop-shadow-[0_1px_2px_rgba(50,60,45,0.55)]"
                      style={{ fontFamily: '"Playfair Display", serif' }}
                    >
                      {p.date}
                    </span>
                  )}
                </div>
                <p className="album-name text-[9.5px] text-warm-dark/80 mt-1 truncate">{p.title || '未命名'}</p>
              </button>
            ))}
          </div>
        </div>
      </motion.div>

      {/* ── Daily quote — right edge, resting on the nav ── */}
      <motion.div className="home-quote px-5 pt-2 pb-1.5 shrink-0 text-right tilt-layer-1" {...cardAnim(0.46)}>
        <p className="text-[9.5px] text-warm-dark/55 leading-[1.45] tracking-[0.04em]">「{quote.text}」</p>
        <p className="text-[8px] text-warm-gray/45 tracking-[0.08em] leading-[1.4]">—— {quote.film}</p>
      </motion.div>

      {active && (
        <PhotoViewer
          photo={active}
          onClose={() => setActive(null)}
          onSaved={(updated) => {
            setPhotos((list) => list.map((p) => (p.id === updated.id ? updated : p)))
            setActive(updated)
          }}
          onDeleted={(id) => setPhotos((list) => list.filter((p) => p.id !== id))}
        />
      )}
    </div>
  )
}
