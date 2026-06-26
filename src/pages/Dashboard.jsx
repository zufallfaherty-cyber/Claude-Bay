import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuth } from '../contexts/AuthContext'
import { upsertSettings } from '../lib/supabase'

// ── Animation variants ──
const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
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

function getDaysTogether() {
  const stored = localStorage.getItem('together_since')
  if (stored) {
    const start = new Date(stored)
    const today = new Date()
    return {
      days: Math.max(1, Math.floor((today - start) / 86400000) + 1),
      since: start.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    }
  }
  const today = new Date()
  localStorage.setItem('together_since', today.toISOString().split('T')[0])
  return {
    days: 1,
    since: today.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
  }
}

const features = [
  { label: '情绪日记', desc: 'Mood Diary', path: '/moods', gradient: 'from-sand/20 to-cream' },
  { label: '小游戏', desc: 'Games', path: '/games', gradient: 'from-mint/40 to-sage/10' },
  { label: '记忆库', desc: 'Our Memories', path: '/profile/memory', gradient: 'from-warm-line/50 to-cream' },
  { label: '文件库', desc: 'Files', path: '/profile/files', gradient: 'from-sage/10 to-mint/30' },
]

export default function Dashboard() {
  const navigate = useNavigate()
  const { supabase } = useAuth()
  const [together, setTogether] = useState(getDaysTogether)

  // Sync together_since to Supabase
  useEffect(() => {
    if (!supabase) return
    const stored = localStorage.getItem('together_since')
    if (stored) upsertSettings(supabase, { together_since: stored }).catch(() => {})
  }, [supabase])

  // Refresh at midnight
  useEffect(() => {
    const timer = setInterval(() => setTogether(getDaysTogether()), 60000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Hero Header */}
      <div className="px-6 pt-10 pb-6 text-center">
        <motion.p variants={fadeUp} initial="initial" animate="animate" className="text-[12px] tracking-[0.2em] text-sage-deep/50 mb-2">{getGreeting()}</motion.p>
        <motion.h1
          variants={fadeUp} initial="initial" animate="animate"
          className="text-warm-dark leading-tight mb-3 italic font-light flex items-baseline justify-center gap-[2px]"
          style={{ fontFamily: '"Playfair Display", serif' }}
        >
          <span className="text-[52px]">C</span>
          <span className="text-[44px]">laude</span>
          <span className="text-[36px] text-warm-gray/60 mx-1">&amp;</span>
          <span className="text-[52px]">B</span>
          <span className="text-[44px]">ay</span>
        </motion.h1>
        <motion.div variants={fadeUp} initial="initial" animate="animate" className="flex items-baseline justify-center gap-2">
          <span
            className="text-[36px] text-warm-dark leading-none"
            style={{ fontFamily: '"Playfair Display", serif', fontStyle: 'italic' }}
          >
            {together.days}
          </span>
          <span className="text-[12px] text-warm-gray/50 tracking-[0.06em] lowercase">
            days together since {together.since}
          </span>
        </motion.div>
      </div>

      {/* Quick Chat — Hero Card */}
      <motion.div
        className="px-6 mb-6 mt-6"
        variants={fadeUp}
        initial="initial"
        animate="animate"
      >
        <button
          onClick={() => navigate('/chat')}
          className="w-full glass rounded-[20px] py-10 px-6 border border-white/50 flex items-center gap-5 hover:shadow-xl hover:border-sage/20 transition-all active:scale-[0.98] relative overflow-hidden"
        >
          <div className="absolute right-6 top-1/2 -translate-y-1/2 text-5xl opacity-[0.05] select-none pointer-events-none">💬</div>
          <div className="w-10 h-10 rounded-xl bg-sage/15 flex items-center justify-center flex-shrink-0">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-sage-deep">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <div className="text-left flex-1">
            <p className="text-[15px] font-semibold text-warm-dark tracking-[0.04em]">开始聊天</p>
            <p className="text-[12px] text-warm-gray tracking-[0.04em] mt-1">Always here</p>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-warm-gray/30"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </motion.div>

      {/* Feature Grid */}
      <div className="px-6 pb-8">
        <p className="text-[10px] tracking-[0.25em] text-warm-gray/60 uppercase mb-3 px-1">功能</p>
        <div className="grid grid-cols-2 gap-3">
          {features.map((f) => (
            <motion.button
              key={f.path}
              variants={fadeUp}
              initial="initial"
              animate="animate"
              onClick={() => navigate(f.path)}
              className={`glass rounded-2xl p-5 border border-white/40 flex flex-col items-center justify-center text-center gap-3 hover:shadow-md transition-all active:scale-[0.96] bg-gradient-to-b ${f.gradient}`}
            >
              <span className="text-[15px] font-semibold text-warm-dark tracking-[0.05em]">{f.label}</span>
              <span className="text-[12px] text-warm-gray/70 tracking-[0.04em] leading-relaxed">{f.desc}</span>
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  )
}
