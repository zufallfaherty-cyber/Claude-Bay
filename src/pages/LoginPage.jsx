import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../contexts/AuthContext'

export default function LoginPage() {
  const { signIn, verifyOtp } = useAuth()
  const [step, setStep] = useState('email') // 'email' | 'otp'
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const inputRef = useRef(null)

  const handleSendCode = async () => {
    if (!email.trim() || sending) return
    setError('')
    setSending(true)
    try {
      await signIn(email.trim())
      setMessage('验证码已发送到你的邮箱')
      setStep('otp')
      setCountdown(60)
      setTimeout(() => inputRef.current?.focus(), 100)
    } catch (err) {
      setError(err.message || '发送失败，请重试')
    }
    setSending(false)
  }

  const handleVerify = async () => {
    if (otp.length !== 6) return
    setError('')
    try {
      await verifyOtp(email.trim(), otp)
    } catch (err) {
      setError('验证码错误或已过期，请重试')
      setOtp('')
    }
  }

  // Countdown timer for resend
  if (countdown > 0) {
    setTimeout(() => setCountdown(c => c - 1), 1000)
  }

  const handleOtpChange = (e) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 6)
    setOtp(val)
    if (val.length === 6) handleVerify()
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      if (step === 'email') handleSendCode()
      else if (step === 'otp' && otp.length === 6) handleVerify()
    }
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
          <p className="text-sm text-warm-gray">登录后，你的聊天记录将同步到云端</p>
        </div>

        {/* Card */}
        <div className="glass-strong rounded-3xl p-6 border border-white/40 shadow-lg">
          <AnimatePresence mode="wait">
            {step === 'email' ? (
              <motion.div
                key="email"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
              >
                <label className="text-xs font-medium text-warm-gray mb-2 block">邮箱地址</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="your@email.com"
                  autoFocus
                  className="w-full px-4 py-3 bg-cream/80 rounded-2xl text-sm text-warm-dark placeholder-warm-gray/50 outline-none focus:ring-2 focus:ring-sage/30 transition-all"
                />
                <button
                  onClick={handleSendCode}
                  disabled={!email.trim() || sending}
                  className="w-full mt-4 py-3 bg-sage-deep text-white rounded-2xl text-sm font-medium hover:bg-sage-deep/90 active:scale-[0.98] transition-all disabled:bg-warm-line/40"
                >
                  {sending ? '发送中...' : '发送验证码'}
                </button>
              </motion.div>
            ) : (
              <motion.div
                key="otp"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <label className="text-xs font-medium text-warm-gray mb-2 block">
                  输入 6 位验证码
                </label>
                <input
                  ref={inputRef}
                  type="text"
                  inputMode="numeric"
                  value={otp}
                  onChange={handleOtpChange}
                  onKeyDown={handleKeyDown}
                  placeholder="000000"
                  maxLength={6}
                  autoFocus
                  className="w-full px-4 py-3 bg-cream/80 rounded-2xl text-2xl tracking-[0.3em] text-center text-warm-dark placeholder-warm-gray/30 outline-none focus:ring-2 focus:ring-sage/30 transition-all font-mono"
                />
                <p className="text-xs text-warm-gray/60 text-center mt-3">
                  已发送至 <span className="text-warm-dark">{email}</span>
                </p>
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={() => { setStep('email'); setOtp(''); setError('') }}
                    className="flex-1 py-2.5 text-sm text-warm-gray hover:text-warm-dark transition-colors"
                  >
                    修改邮箱
                  </button>
                  <button
                    onClick={() => { handleSendCode(); setOtp(''); setError('') }}
                    disabled={countdown > 0 || sending}
                    className="flex-1 py-2.5 text-sm text-sage-deep hover:text-sage-deep/70 transition-colors disabled:text-warm-gray/30"
                  >
                    {countdown > 0 ? `${countdown}s 后重发` : '重新发送'}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Messages */}
        {message && (
          <p className="text-xs text-sage-deep text-center mt-4">{message}</p>
        )}
        {error && (
          <p className="text-xs text-rose-400 text-center mt-4">{error}</p>
        )}
      </motion.div>
    </div>
  )
}
