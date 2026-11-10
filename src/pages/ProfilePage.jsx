import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
}

const features = [
  { label: '记忆库', desc: 'Our Memories', path: '/profile/memory' },
  { label: '文件库', desc: 'Files', path: '/profile/files' },
  { label: '工具箱', desc: 'MCP Tools', path: '/profile/tools' },
  { label: '设置', desc: 'Settings', path: '/settings' },
]

export default function ProfilePage() {
  const navigate = useNavigate()

  return (
    <div className="relative flex flex-col min-h-full">
      {/* Header — 直接落在夜色上，浅色字 + 轻描边保证可读 */}
      <div className="relative z-10 px-6 pt-10 pb-7">
        <motion.p
          variants={fadeUp}
          initial="initial"
          animate="animate"
          className="text-[9.5px] tracking-[0.34em] uppercase text-white/55"
        >
          Claude &amp; Bay
        </motion.p>
        <motion.h1
          variants={fadeUp}
          initial="initial"
          animate="animate"
          className="mt-2.5 text-[30px] font-light tracking-[0.12em] text-white/95"
          style={{ textShadow: '0 2px 16px rgba(10, 16, 28, 0.45)' }}
        >
          我的
        </motion.h1>
        <motion.div
          variants={fadeUp}
          initial="initial"
          animate="animate"
          className="mt-4 h-px w-12 bg-white/25"
        />
      </div>

      {/* Feature Cards — 与首页同一套液体玻璃 */}
      <div className="relative z-10 px-5 pb-10">
        <p className="text-[9.5px] tracking-[0.3em] text-white/50 uppercase mb-3 px-2">功能</p>
        <div className="grid grid-cols-2 gap-3">
          {features.map((f, i) => (
            <motion.button
              key={f.path}
              variants={fadeUp}
              initial="initial"
              animate="animate"
              transition={{ delay: 0.05 + i * 0.05, duration: 0.45, ease: [0.32, 0, 0.23, 1] }}
              onClick={() => navigate(f.path)}
              className="glass-water shape-island relative px-4 py-6 flex flex-col items-center justify-center text-center gap-2.5 active:scale-[0.96] transition-transform"
            >
              <span className="relative text-[15px] font-medium tracking-[0.08em] text-white/95">{f.label}</span>
              <span className="relative text-[10.5px] tracking-[0.16em] text-white/55">{f.desc}</span>
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  )
}
