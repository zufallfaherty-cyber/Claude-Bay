import { useState, useEffect, useRef } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useAuth } from './contexts/AuthContext'
import { migrateLocalToSupabase } from './lib/migrate'
import BottomNav from './components/BottomNav'
import LoginPage from './pages/LoginPage'
import Dashboard from './pages/Dashboard'
import ChatPage from './pages/ChatPage'
import ClaudeSpace from './pages/ClaudeSpace'
import GamesPage from './pages/GamesPage'
import LudoGame from './pages/LudoGame'
import ProfilePage from './pages/ProfilePage'
import MemoryPage from './pages/MemoryPage'
import AlbumPage from './pages/AlbumPage'
import FilesPage from './pages/FilesPage'
import ToolboxPage from './pages/ToolboxPage'
import Settings from './pages/Settings'

// ── Page transition wrapper ──
const pageVariants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
}

function PageWrapper({ children }) {
  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ duration: 0.28, ease: [0.32, 0, 0.23, 1] }}
      className="h-full"
    >
      {children}
    </motion.div>
  )
}


function App() {
  const { user, loading, supabase } = useAuth()
  const [sessions, setSessions] = useState([])
  const [currentSessionId, setCurrentSessionId] = useState(null)
  const [migrated, setMigrated] = useState(false)
  const migrationRun = useRef(false)
  const location = useLocation()
  const isHome = location.pathname === '/'
  const isChat = location.pathname === '/chat'
  // Local-only visual preview (never active in production builds)
  const isPreview = import.meta.env.DEV && new URLSearchParams(location.search).has('preview')

  // Run migration once after auth
  useEffect(() => {
    if (user && supabase && !migrationRun.current) {
      migrationRun.current = true
      migrateLocalToSupabase(supabase).then(r => {
        console.log('Migration result:', r)
        setMigrated(true)
      })
    }
  }, [user, supabase])

  // 上报位置：PWA 打开时浏览器定位 → 服务端 weather-sense（用于「查岗」）
  useEffect(() => {
    if (!user || !('geolocation' in navigator)) return
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords
        fetch('https://124-156-142-6.sslip.io/api/location', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lat: latitude, lng: longitude, accuracy }),
        }).catch(() => {})
      },
      () => {}, // 用户拒绝或定位失败 → 静默，不打扰
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 2 * 60 * 1000 }
    )
  }, [user])

  if (loading) {
    const claudeAvatar = localStorage.getItem('avatar_claude') || ''
    return (
      <div className="h-full flex items-center justify-center bg-cream">
        <div className="flex flex-col items-center gap-4">
          {claudeAvatar?.startsWith('data:') ? (
            <img src={claudeAvatar} alt="" className="w-16 h-16 rounded-full object-cover" />
          ) : (
            <div className="w-16 h-16 rounded-full bg-mint flex items-center justify-center text-2xl">{claudeAvatar || '🌿'}</div>
          )}
          <p className="text-sm text-warm-gray">waiting..</p>
        </div>
      </div>
    )
  }

  if (!user && !isPreview) {
    return <LoginPage />
  }

  return (
    <div className="h-full flex flex-col max-w-lg mx-auto bg-cream relative overflow-hidden">
      {(isHome || isChat) && (
        <div className={isHome ? 'home-water-bg' : 'chat-water-bg'} aria-hidden="true" />
      )}
      <main className={isChat
        ? 'flex-1 min-h-0 overflow-hidden relative z-10'
        : `flex-1 overflow-y-auto relative z-10 ${isHome ? 'pb-0' : 'pb-[26px]'}`}
      >
        <AnimatePresence mode="wait">
          <Routes location={location} key={location.pathname}>
            <Route path="/" element={<PageWrapper><Dashboard /></PageWrapper>} />
            <Route
              path="/chat"
              element={
                <PageWrapper>
                  <ChatPage
                    currentSessionId={currentSessionId}
                    setCurrentSessionId={setCurrentSessionId}
                    sessions={sessions}
                    setSessions={setSessions}
                  />
                </PageWrapper>
              }
            />
            <Route path="/moods" element={<PageWrapper><ClaudeSpace /></PageWrapper>} />
            <Route path="/games" element={<PageWrapper><GamesPage /></PageWrapper>} />
            <Route path="/games/ludo" element={<PageWrapper><LudoGame /></PageWrapper>} />
            <Route path="/profile" element={<PageWrapper><ProfilePage /></PageWrapper>} />
            <Route path="/album" element={<PageWrapper><AlbumPage /></PageWrapper>} />
            <Route path="/profile/memory" element={<PageWrapper><MemoryPage /></PageWrapper>} />
            <Route path="/profile/files" element={<PageWrapper><FilesPage /></PageWrapper>} />
            <Route path="/profile/tools" element={<PageWrapper><ToolboxPage /></PageWrapper>} />
            <Route path="/settings" element={<PageWrapper><Settings /></PageWrapper>} />
          </Routes>
        </AnimatePresence>
      </main>

      {!isChat && <BottomNav />}
    </div>
  )
}

export default App
