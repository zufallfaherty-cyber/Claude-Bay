import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
}

const features = [
  { label: '记忆库', desc: 'Our Memories', path: '/profile/memory', gradient: 'from-warm-line/50 to-cream' },
  { label: '文件库', desc: 'Files', path: '/profile/files', gradient: 'from-sage/10 to-mint/30' },
  { label: '设置', desc: 'Settings', path: '/settings', gradient: 'from-warm-gray/10 to-cream' },
]

export default function ProfilePage() {
  const navigate = useNavigate()

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="px-6 pt-10 pb-6">
        <motion.h1 variants={fadeUp} initial="initial" animate="animate" className="text-2xl font-semibold text-warm-dark">我的</motion.h1>
        <motion.p variants={fadeUp} initial="initial" animate="animate" className="text-xs text-warm-gray mt-1">Claude&Bay</motion.p>
      </div>

      {/* Feature Cards */}
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
              className={`glass rounded-2xl p-5 border border-white/40 flex flex-col items-center justify-center text-center gap-3 hover:shadow-md transition-shadow active:scale-[0.96] bg-gradient-to-b ${f.gradient}`}
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
