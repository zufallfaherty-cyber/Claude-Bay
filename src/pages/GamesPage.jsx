import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
}

const games = [
  { label: '飞行棋', desc: 'Ludo', path: '/games/ludo', gradient: 'from-mint/40 to-sage/10' },
]

export default function GamesPage() {
  const navigate = useNavigate()

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-3 glass-strong border-b border-white/30">
        <button onClick={() => navigate('/')} className="w-8 h-8 flex items-center justify-center rounded-lg text-warm-gray hover:bg-mint/50 transition-colors">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <h2 className="text-lg font-semibold text-warm-dark">小游戏</h2>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <p className="text-[10px] tracking-[0.25em] text-warm-gray/60 uppercase mb-3 px-1">游戏</p>
        <div className="grid grid-cols-2 gap-3">
          {games.map((g) => (
            <motion.button
              key={g.label}
              variants={fadeUp}
              initial="initial"
              animate="animate"
              onClick={() => navigate(g.path)}
              className={`glass rounded-2xl p-5 border border-white/40 flex flex-col items-center justify-center text-center gap-3 hover:shadow-md transition-all active:scale-[0.96] bg-gradient-to-b ${g.gradient}`}
            >
              <span className="text-[15px] font-semibold text-warm-dark tracking-[0.05em]">{g.label}</span>
              <span className="text-[12px] text-warm-gray/70 tracking-[0.04em]">{g.desc}</span>
            </motion.button>
          ))}

          {/* Placeholder for future games */}
          <div className="glass rounded-2xl p-5 border border-white/20 border-dashed flex flex-col items-center justify-center text-center gap-2 opacity-60">
            <span className="text-2xl">🎴</span>
            <span className="text-[11px] text-warm-gray/50">更多游戏</span>
          </div>
        </div>
      </div>
    </div>
  )
}
