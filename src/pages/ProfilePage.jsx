import { useNavigate } from 'react-router-dom'

const items = [
  { icon: '🧠', title: '记忆库', desc: 'Claude 对你的记忆', path: '/profile/memory' },
  { icon: '📁', title: '文件库', desc: '存放我们之间的小玩意', path: '/profile/files' },
  { icon: '⚙️', title: '设置', desc: '调整 Claude 的性格和参数', path: '/settings' },
]

export default function ProfilePage() {
  const navigate = useNavigate()

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-6 pt-8 pb-6">
        <h1 className="text-2xl font-semibold text-warm-dark">我的</h1>
        <p className="text-xs text-warm-gray mt-1">Claude&Bay</p>
      </div>

      {/* Stats */}
      <div className="px-6 mb-6">
        <div className="glass rounded-2xl p-5 border border-white/40">
          <div className="grid grid-cols-3 gap-4 text-center">
            {[
              { value: '∞', label: '对话' },
              { value: '24', label: '日记' },
              { value: '3', label: '游戏' },
            ].map((s) => (
              <div key={s.label}>
                <p className="text-xl font-bold text-sage-deep">{s.value}</p>
                <p className="text-[10px] text-warm-gray">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Menu Items */}
      <div className="px-6 pb-8 space-y-2">
        {items.map((item) => (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            className="w-full flex items-center gap-4 p-4 glass rounded-2xl border border-white/30 hover:shadow-md transition-all active:scale-[0.98]"
          >
            <span className="text-2xl">{item.icon}</span>
            <div className="text-left flex-1">
              <p className="text-sm font-semibold text-warm-dark">{item.title}</p>
              <p className="text-xs text-warm-gray">{item.desc}</p>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-warm-gray/30"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        ))}
      </div>
    </div>
  )
}
