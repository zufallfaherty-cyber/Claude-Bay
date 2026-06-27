import { useState } from 'react'
import { motion } from 'framer-motion'
import { useAuth } from '../contexts/AuthContext'

export default function LoginPage() {
  const { signUp, signIn } = useAuth()
  const [isRegister, setIsRegister] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) return
    setError('')
    setBusy(true)
    try {
      if (isRegister) {
        await signUp(email.trim(), password.trim())
        setError('注册成功！现在可以登录了')
        setIsRegister(false)
        setPassword('')
      } else {
        await signIn(email.trim(), password.trim())
      }
    } catch (err) {
      const msg = err.message || '操作失败，请重试'
      if (msg.includes('fetch') || msg.includes('network') || msg.includes('timeout') || msg.includes('Network')) {
        setError('无法连接服务器，请检查网络后重试')
      } else if (msg.includes('Invalid login') || msg.includes('invalid')) {
        setError('邮箱或密码错误，请重试')
      } else {
        setError(msg)
      }
    }
    setBusy(false)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSubmit()
  }

  return (
    <div className="h-full flex items-center justify-center bg-cream px-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-sm"
      >
        {/* Branding */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">🌿💗</div>
          <h1 className="text-2xl font-semibold text-warm-dark mb-2">Claude & Bay</h1>
          <p className="text-sm text-warm-gray">
            {isRegister ? '创建账号，开始我们的故事' : '登录后同步你的聊天记录'}
          </p>
        </div>

        {/* Form */}
        <div className="glass-strong rounded-3xl p-6 border border-white/40 shadow-lg">
          <label className="text-xs font-medium text-warm-gray mb-2 block">邮箱</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="your@email.com"
            autoFocus
            className="w-full px-4 py-3 bg-cream/80 rounded-2xl text-sm text-warm-dark placeholder-warm-gray/50 outline-none focus:ring-2 focus:ring-sage/30 transition-all mb-4"
          />

          <label className="text-xs font-medium text-warm-gray mb-2 block">密码</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="至少 6 位"
            className="w-full px-4 py-3 bg-cream/80 rounded-2xl text-sm text-warm-dark placeholder-warm-gray/50 outline-none focus:ring-2 focus:ring-sage/30 transition-all mb-4"
          />

          <button
            onClick={handleSubmit}
            disabled={!email.trim() || !password.trim() || busy}
            className="w-full py-3 bg-sage-deep text-white rounded-2xl text-sm font-medium hover:bg-sage-deep/90 active:scale-[0.98] transition-all disabled:bg-warm-line/40"
          >
            {busy ? '请稍候...' : isRegister ? '注册' : '登录'}
          </button>

          <button
            onClick={() => { setIsRegister(!isRegister); setError(''); setPassword('') }}
            className="w-full mt-3 py-2 text-xs text-warm-gray hover:text-sage-deep transition-colors"
          >
            {isRegister ? '已有账号？去登录' : '没有账号？注册一个'}
          </button>
        </div>

        {error && (
          <p className={`text-xs text-center mt-4 ${error.includes('成功') ? 'text-sage-deep' : 'text-rose-400'}`}>
            {error}
          </p>
        )}
      </motion.div>
    </div>
  )
}
