import { useNavigate, useLocation } from 'react-router-dom'

const tabs = [
  {
    path: '/',
    label: '首页',
    icon: (active) => (
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 1.9 : 1.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
        <polyline points="9 22 9 12 15 12 15 22"/>
      </svg>
    ),
  },
  {
    path: '/moods',
    label: '书房',
    icon: (active) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 1.7 : 1.35} strokeLinecap="round" strokeLinejoin="round">
        <g transform="translate(12 12) scale(.86) translate(-12 -12)">
          <path d="M12 6.4C10.5 4.8 8.2 4 5 4H3v14h2c3.2 0 5.5.8 7 2.4 1.5-1.6 3.8-2.4 7-2.4h2V4h-2c-3.2 0-5.5.8-7 2.4Z" />
          <path d="M12 6.4v14" />
        </g>
        <path d="M21.8 2 14.2 9.6" />
        <path d="M14.2 9.6l-1 2.6 2.6-1" />
      </svg>
    ),
  },
  // Chat — center floating button
  {
    path: '/chat',
    label: '聊天',
    center: true,
    icon: () => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 14.5a2 2 0 0 1-2 2H8l-4 3.5V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z"/>
      </svg>
    ),
  },
  {
    path: '/games',
    label: '游戏',
    icon: (active) => (
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 1.9 : 1.5} strokeLinecap="round" strokeLinejoin="round">
        <rect x="2.4" y="7" width="19.2" height="10.8" rx="5.4" />
        <path d="M7.4 10.2v4.2M5.3 12.3h4.2" />
        <circle cx="16.4" cy="11.1" r=".85" />
        <circle cx="18.2" cy="13.2" r=".85" />
      </svg>
    ),
  },
  {
    path: '/profile',
    label: '我的',
    icon: (active) => (
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 1.9 : 1.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
        <circle cx="12" cy="7" r="4"/>
      </svg>
    ),
  },
]

export default function BottomNav() {
  const navigate = useNavigate()
  const location = useLocation()

  return (
    <nav className="bottom-nav relative z-20 flex-shrink-0 border-t border-white/55 bg-white/30 backdrop-blur-xl shadow-[0_-6px_20px_-14px_rgba(70,85,62,0.28)]">
      <div className="relative">
        <div className="h-[58px] flex items-center justify-around px-2">
          {tabs.map((tab) => {
            const active = location.pathname === tab.path ||
              (tab.path === '/profile' && location.pathname.startsWith('/profile'))

            if (tab.center) {
              return <div key={tab.path} className="w-[58px] flex-shrink-0" aria-hidden="true" />
            }

            return (
              <button
                key={tab.path}
                onClick={() => navigate(tab.path)}
                className={`flex-1 flex flex-col items-center gap-[3px] py-1.5 rounded-xl transition-all active:scale-90 ${
                  active ? 'text-sage-deep' : 'text-warm-gray/55'
                }`}
              >
                {tab.icon(active)}
                <span className="text-[10px] tracking-[0.06em] font-medium">{tab.label}</span>
                <span className={`w-1 h-1 rounded-full transition-colors ${active ? 'bg-sage-deep' : 'bg-transparent'}`} />
              </button>
            )
          })}
        </div>

        {/* Floating chat button */}
        <button
          onClick={() => navigate('/chat')}
          aria-label="聊天"
          className="absolute left-1/2 -translate-x-1/2 -top-[17px] z-10 active:scale-95 transition-transform"
        >
          <span className="w-[52px] h-[52px] rounded-full flex items-center justify-center text-white ring-[4px] ring-white/45 shadow-[0_6px_16px_-6px_rgba(56,76,50,0.55)]"
            style={{ background: 'linear-gradient(145deg, #93AD88 0%, #64825B 58%, #55724D 100%)' }}
          >
            {tabs.find((t) => t.center).icon(true)}
          </span>
        </button>
      </div>
    </nav>
  )
}
