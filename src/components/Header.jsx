export default function Header({ onMenuClick, title }) {
  return (
    <header className="flex items-center gap-3 px-4 py-3 border-b border-warm-line bg-cream/80 backdrop-blur-sm sticky top-0 z-30">
      <button
        onClick={onMenuClick}
        className="w-9 h-9 flex items-center justify-center rounded-xl text-warm-gray hover:bg-rose-light/50 hover:text-warm-dark transition-colors active:scale-95"
        aria-label="菜单"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      <div className="flex items-center gap-2 flex-1">
        <div className="w-7 h-7 rounded-full bg-rose-light flex items-center justify-center text-sm">
          💕
        </div>
        <span className="font-medium text-[15px] text-warm-dark">{title}</span>
      </div>

      <div className="w-2 h-2 rounded-full bg-green-400 ring-2 ring-green-100" title="在线" />
    </header>
  )
}
