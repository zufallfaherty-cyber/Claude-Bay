// Local storage fallback — used when Supabase is not configured

const SESSIONS_KEY = 'bunny_sessions'
const MESSAGES_PREFIX = 'bunny_messages_'
const MOODS_KEY = 'bunny_moods'

// ── Sessions ──

export function getLocalSessions() {
  try {
    return JSON.parse(localStorage.getItem(SESSIONS_KEY) || '[]')
  } catch {
    return []
  }
}

export function saveLocalSessions(sessions) {
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions))
}

export function addLocalSession(session) {
  const sessions = getLocalSessions()
  const filtered = sessions.filter((s) => s.id !== session.id)
  localStorage.setItem(SESSIONS_KEY, JSON.stringify([session, ...filtered]))
}

// ── Messages ──

export function getLocalMessages(sessionId) {
  try {
    return JSON.parse(localStorage.getItem(MESSAGES_PREFIX + sessionId) || '[]')
  } catch {
    return []
  }
}

export function saveLocalMessages(sessionId, messages) {
  localStorage.setItem(MESSAGES_PREFIX + sessionId, JSON.stringify(messages))
}

// ── Moods ──

export function getLocalMoods() {
  try {
    return JSON.parse(localStorage.getItem(MOODS_KEY) || '[]')
  } catch {
    return []
  }
}

export function addLocalMood(mood) {
  const moods = getLocalMoods()
  moods.unshift(mood)
  localStorage.setItem(MOODS_KEY, JSON.stringify(moods))
}
