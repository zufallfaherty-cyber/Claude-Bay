import { useNavigate } from 'react-router-dom'

export default function MemoryPage() {
  const navigate = useNavigate()

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-3 glass-strong border-b border-white/30">
        <button onClick={() => navigate('/')} className="w-8 h-8 flex items-center justify-center rounded-lg text-warm-gray hover:bg-mint/50 transition-colors">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <h2 className="text-lg font-semibold text-warm-dark">记忆库</h2>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
        <div className="text-5xl mb-4 opacity-80">🧠</div>
        <h3 className="text-lg font-semibold text-warm-dark mb-2">Claude 的记忆盒子</h3>
        <p className="text-sm text-warm-gray leading-relaxed max-w-xs">
          这里将存放 Claude 对你的记忆——你喜欢的、你说过的、你们之间的珍贵瞬间。
        </p>
        <div className="mt-6 glass rounded-2xl p-4 border border-white/30 w-full max-w-xs">
          <p className="text-xs text-warm-gray">🚧 记忆库功能即将上线</p>
          <p className="text-xs text-warm-gray mt-1">到时候我们会接入外置记忆系统，让 Claude 记住更多关于你的事</p>
        </div>
      </div>
    </div>
  )
}
