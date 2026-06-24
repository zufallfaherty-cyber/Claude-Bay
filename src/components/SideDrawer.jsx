import { useNavigate } from 'react-router-dom'

const menuItems = [
  { icon: '💬', label: '新对话', action: 'new' },
  { icon: '💌', label: '情绪日记', path: '/moods' },
  { icon: '⚙️', label: '设置', path: '/settings' },
]

export default function SideDrawer({
  open,
  onClose,
  sessions,
  currentSessionId,
  onSelectSession,
  onNewSession,
}) {
  const navigate = useNavigate()

  if (!open) return null

  const handleItemClick = (item) => {
    if (item.action === 'new') {
      onNewSession()
      navigate('/')
    } else if (item.path) {
      navigate(item.path)
    }
    onClose()
  }

  return (
    <aside className="fixed top-0 left-0 h-full w-72 bg-white z-50 shadow-2xl rounded-r-2xl flex flex-col animate-[slideIn_0.25s_ease-out]">
      {/* Drawer Header */}
      <div className="px-5 py-5 border-b border-warm-line flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-rose-light flex items-center justify-center text-lg">
          💕
        </div>
        <div>
          <p className="font-semibold text-[15px] text-warm-dark">Claude&Bay</p>
          <p className="text-xs text-warm-gray">随时陪伴你</p>
        </div>
      </div>

      {/* Menu Items */}
      <div className="px-3 py-3 border-b border-warm-line">
        {menuItems.map((item) => (
          <button
            key={item.label}
            onClick={() => handleItemClick(item)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[14px] text-warm-dark hover:bg-rose-light/30 transition-colors active:scale-[0.98]"
          >
            <span className="text-lg">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </div>

      {/* Sessions List */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        <p className="text-xs text-warm-gray px-3 mb-2 uppercase tracking-wider">历史对话</p>
        {sessions.length === 0 ? (
          <p className="text-sm text-warm-gray px-3 py-4 text-center">
            还没有对话记录 💭
          </p>
        ) : (
          sessions.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                onSelectSession(s.id)
                navigate('/')
                onClose()
              }}
              className={`w-full text-left px-3 py-2.5 rounded-xl text-[14px] mb-1 transition-colors active:scale-[0.98] ${
                s.id === currentSessionId
                  ? 'bg-rose-light/40 text-warm-dark font-medium'
                  : 'text-warm-dark hover:bg-rose-light/20'
              }`}
            >
              <p className="truncate">{s.name || '新对话'}</p>
              <p className="text-xs text-warm-gray mt-0.5">{s.updated_at}</p>
            </button>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-warm-line text-center">
        <p className="text-[11px] text-warm-gray">Bunny Style · Claude API</p>
      </div>
    </aside>
  )
}
