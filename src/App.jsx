import { useState, useCallback } from 'react'
import { Routes, Route } from 'react-router-dom'
import Header from './components/Header'
import SideDrawer from './components/SideDrawer'
import ChatPage from './pages/ChatPage'
import MoodDiary from './pages/MoodDiary'
import Settings from './pages/Settings'

function App() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [sessions, setSessions] = useState([])
  const [currentSessionId, setCurrentSessionId] = useState(null)

  const toggleDrawer = useCallback(() => setDrawerOpen((v) => !v), [])
  const closeDrawer = useCallback(() => setDrawerOpen(false), [])

  return (
    <div className="h-full flex flex-col max-w-lg mx-auto bg-cream relative overflow-hidden">
      <Header
        onMenuClick={toggleDrawer}
        title="Claude&Bay"
      />

      <SideDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        sessions={sessions}
        currentSessionId={currentSessionId}
        onSelectSession={setCurrentSessionId}
        onNewSession={() => {
          setCurrentSessionId(null)
          closeDrawer()
        }}
      />

      {drawerOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-40"
          onClick={closeDrawer}
        />
      )}

      <main className="flex-1 overflow-hidden">
        <Routes>
          <Route
            path="/"
            element={
              <ChatPage
                currentSessionId={currentSessionId}
                setCurrentSessionId={setCurrentSessionId}
                sessions={sessions}
                setSessions={setSessions}
              />
            }
          />
          <Route path="/moods" element={<MoodDiary />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
