import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import useTiltParallax from '../hooks/useTiltParallax'

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
}

// ── 与首页同一套细线条图标（stroke 1.3，圆头）──
// 记忆库 / 文件库直接用首页那两个，保证两边一模一样
function IconMoon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M20.6 14.3A8.6 8.6 0 1 1 12.7 2.9a6.7 6.7 0 0 0 7.9 11.4Z" />
      <path d="M17.4 5.1l.5 1.2 1.2.5-1.2.5-.5 1.2-.5-1.2-1.2-.5 1.2-.5z" fill="currentColor" stroke="none" />
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
// 简洁扳手
function IconWrench(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94Z" />
    </svg>
  )
}
// 齿轮轮廓（不是辐条）
function IconGear(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="5.4" />
      <circle cx="12" cy="12" r="1.9" />
      <path d="M12 3v3.2M12 17.8V21M3 12h3.2M17.8 12H21M5.8 5.8l2.3 2.3M15.9 15.9l2.3 2.3M18.2 5.8l-2.3 2.3M8.1 15.9l-2.3 2.3" />
    </svg>
  )
}

function ArrowCircle(props) {
  return (
    <span className={`w-6 h-6 rounded-full bg-white/15 border border-white/35 flex items-center justify-center text-white/70 ${props.className || ''}`}>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12h14M13 6l6 6-6 6" />
      </svg>
    </span>
  )
}

const features = [
  { label: '记忆库', desc: 'Memories', sub: '/ 我们的点滴 /', path: '/profile/memory', Icon: IconMoon },
  { label: '文件库', desc: 'Files', sub: '/ 你的文件，我来保管 /', path: '/profile/files', Icon: IconFolder },
  { label: '工具箱', desc: 'MCP Tools', sub: '/ 我能帮你做的事 /', path: '/profile/tools', Icon: IconWrench },
  { label: '设置', desc: 'Settings', sub: '/ 把这里变成家 /', path: '/settings', Icon: IconGear },
]

export default function ProfilePage() {
  const navigate = useNavigate()
  // 和首页同一套陀螺仪，幅度取最小的一档（3px），像纸片被轻轻推了一下
  useTiltParallax()

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

      {/* Feature Cards — 首页同款液体玻璃 + 细线图标 */}
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
              className="island glass-water shape-island tilt-layer-1 relative pl-4 pr-11 py-4 text-left flex flex-col items-start justify-center min-h-[118px] active:scale-[0.96] transition-transform"
            >
              <f.Icon className="relative w-[24px] h-[24px] text-white/85" />
              <span className="relative mt-2 text-[14px] leading-tight tracking-[0.06em] text-white/95">{f.label}</span>
              <span
                className="relative mt-0.5 text-[9px] italic text-white/60 leading-none"
                style={{ fontFamily: '"Playfair Display", serif' }}
              >
                {f.desc}
              </span>
              <span className="relative mt-1 text-[7.5px] tracking-[0.08em] text-white/45 leading-none">{f.sub}</span>
              <ArrowCircle className="absolute right-3.5 top-1/2 -translate-y-1/2" />
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  )
}
