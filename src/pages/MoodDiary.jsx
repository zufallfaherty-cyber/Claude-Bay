import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'

function Avatar({ person, className }) {
  const src = localStorage.getItem(`avatar_${person}`) || ''
  if (src?.startsWith('data:')) {
    return <img src={src} alt="" className={className} />
  }
  return <span className={className}>{src || (person === 'bay' ? '💗' : '🌿')}</span>
}

const moodOptions = ['😊', '😄', '🥰', '😌', '😢', '😔', '😤', '😡', '😰', '😴', '🤗', '😋', '🤔', '😎', '😍', '😭', '😅', '🙂', '😕', '😖', '💕', '💗', '💖', '🌸', '☀️', '☁️', '🌧️', '🌈', '💪', '🫶']

const initialEntries = {
  '2026-6-24': { bay: { mood: '🥰', note: '今天收到礼物了' }, claude: { mood: '🌸', note: '看到你开心我也很开心~' } },
  '2026-6-23': { bay: { mood: '😢', note: '加班好累' }, claude: { mood: '🫶', note: '辛苦了 抱抱你' } },
  '2026-6-21': { bay: { mood: '😊', note: '周末好舒服' }, claude: { mood: '☀️', note: '享受属于你的时光~' } },
  '2026-6-18': { bay: { mood: '😍', note: '一起看电影了' }, claude: { mood: '💕', note: '我也觉得很好看！' } },
}

export default function MoodDiary() {
  const navigate = useNavigate()
  const [currentDate, setCurrentDate] = useState(new Date())
  const [entries, setEntries] = useState(initialEntries)
  const [selectedDay, setSelectedDay] = useState(null)
  const [editing, setEditing] = useState(false)
  const [editMood, setEditMood] = useState('😊')
  const [editNote, setEditNote] = useState('')

  // Auto-generate Claude's mood for today if missing
  useEffect(() => {
    const todayKey = `${new Date().getFullYear()}-${new Date().getMonth()+1}-${new Date().getDate()}`
    if (entries[todayKey]?.claude) return
    fetch('https://bayapi.zeabur.app/api/claude-mood', { method: 'POST' })
      .then(r => r.json())
      .then(data => {
        setEntries(prev => ({
          ...prev,
          [todayKey]: { ...(prev[todayKey] || {}), claude: { mood: data.mood, note: data.note } },
        }))
      })
      .catch(() => {})
  }, [])

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  const calendar = useMemo(() => {
    const firstDay = new Date(year, month, 1).getDay()
    const startOffset = firstDay === 0 ? 6 : firstDay - 1
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const cells = []
    for (let i = 0; i < startOffset; i++) cells.push(null)
    for (let d = 1; d <= daysInMonth; d++) cells.push(d)
    return cells
  }, [year, month])

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1))
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1))

  const getEntryKey = (day) => `${year}-${month + 1}-${day}`
  const getEntry = (day) => entries[getEntryKey(day)] || null

  const handleDayClick = (day) => {
    const key = getEntryKey(day)
    const entry = entries[key]
    setSelectedDay({ key, day, entry })
    setEditing(false)
  }

  const handleStartEdit = (currentMood, currentNote) => {
    setEditMood(currentMood || '😊')
    setEditNote(currentNote || '')
    setEditing(true)
  }

  const handleSaveEntry = () => {
    if (!editNote.trim()) return
    const key = selectedDay.key
    setEntries((prev) => ({
      ...prev,
      [key]: { ...(prev[key] || {}), bay: { mood: editMood, note: editNote.trim() } },
    }))
    setEditing(false)
    setSelectedDay((s) => ({
      ...s,
      entry: { ...(s.entry || {}), bay: { mood: editMood, note: editNote.trim() } },
    }))
  }

  const weekDays = ['一', '二', '三', '四', '五', '六', '日']

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 glass-strong border-b border-white/30">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/')} className="w-8 h-8 flex items-center justify-center rounded-lg text-warm-gray hover:bg-mint/50 transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <h2 className="text-lg font-semibold text-warm-dark">情绪日记</h2>
        </div>
      </div>

      {/* Month Navigator */}
      <div className="flex items-center justify-between px-4 py-3">
        <button onClick={prevMonth} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-mint/50 text-warm-gray transition-colors">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <span className="text-base font-semibold text-warm-dark">{year}年{month + 1}月</span>
        <button onClick={nextMonth} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-mint/50 text-warm-gray transition-colors">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>

      {/* Weekday Header */}
      <div className="grid grid-cols-7 px-2 mb-1">
        {weekDays.map((d) => <div key={d} className="text-center text-xs text-warm-gray py-1.5">{d}</div>)}
      </div>

      {/* Calendar Grid */}
      <div className="flex-1 overflow-y-auto px-2">
        <div className="grid grid-cols-7 gap-1">
          {calendar.map((day, i) => {
            if (day === null) return <div key={`empty-${i}`} />
            const entry = getEntry(day)
            const isToday = day === new Date().getDate() && month === new Date().getMonth() && year === new Date().getFullYear()
            return (
              <button
                key={day}
                onClick={() => handleDayClick(day)}
                className={`aspect-square rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all active:scale-95 ${
                  isToday ? 'bg-sage/10 ring-1 ring-sage/30' : 'hover:bg-mint/30'
                }`}
              >
                <span className={`text-[13px] ${isToday ? 'font-bold text-sage-deep' : 'text-warm-dark'}`}>{day}</span>
                {entry && (
                  <div className="flex gap-0.5 text-xs">
                    {entry.bay?.mood && <span className="leading-none">{entry.bay.mood}</span>}
                    {entry.claude?.mood && <span className="leading-none">{entry.claude.mood}</span>}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Day Detail Modal */}
      {selectedDay && !editing && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setSelectedDay(null)} />
          <div className="relative bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-sm px-6 py-6 shadow-2xl animate-[slideUp_0.3s_ease-out]">
            <h3 className="text-lg font-semibold text-warm-dark mb-5 text-center">{month + 1}月{selectedDay.day}日</h3>

            {/* Bay's mood — editable */}
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-full bg-sage-deep flex items-center justify-center text-[10px] text-white font-medium overflow-hidden">
                  <Avatar person="bay" className="w-full h-full object-cover text-[10px]" />
                </div>
                <p className="text-xs font-medium text-warm-gray">我</p>
              </div>
              {selectedDay.entry?.bay ? (
                <button onClick={() => handleStartEdit(selectedDay.entry.bay.mood, selectedDay.entry.bay.note)}
                  className="w-full text-left bg-cream rounded-2xl p-4 hover:bg-mint/30 transition-colors">
                  <span className="text-2xl mr-3">{selectedDay.entry.bay.mood}</span>
                  <span className="text-sm text-warm-dark">{selectedDay.entry.bay.note}</span>
                </button>
              ) : (
                <button onClick={() => handleStartEdit('😊', '')}
                  className="w-full text-left bg-cream rounded-2xl p-4 text-sm text-warm-gray/60 hover:bg-mint/30 transition-colors border border-dashed border-warm-line/50">
                  + 记录今天的心情
                </button>
              )}
            </div>

            {/* Claude's mood — read only */}
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-full bg-white border border-warm-line flex items-center justify-center text-[10px] overflow-hidden">
                  <Avatar person="claude" className="w-full h-full object-cover text-[10px]" />
                </div>
                <p className="text-xs font-medium text-warm-gray">Claude</p>
              </div>
              {selectedDay.entry?.claude ? (
                <div className="w-full text-left bg-cream rounded-2xl p-4 opacity-80">
                  <span className="text-2xl mr-3">{selectedDay.entry.claude.mood}</span>
                  <span className="text-sm text-warm-dark">{selectedDay.entry.claude.note}</span>
                </div>
              ) : (
                <div className="w-full text-left bg-cream/50 rounded-2xl p-4 text-sm text-warm-gray/40 italic">
                  Claude 还没记录今天的心情
                </div>
              )}
            </div>

            <button onClick={() => setSelectedDay(null)} className="w-full py-2.5 text-sm text-warm-gray hover:text-warm-dark transition-colors">关闭</button>
          </div>
        </div>
      )}

      {/* Edit Modal — Bay only */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setEditing(false)} />
          <div className="relative bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-sm px-6 py-6 shadow-2xl animate-[slideUp_0.3s_ease-out] max-h-[80vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-warm-dark mb-4 text-center">今天的心情</h3>
            <div className="flex flex-wrap justify-center gap-2 mb-5">
              {moodOptions.map((emoji) => (
                <button key={emoji} onClick={() => setEditMood(emoji)}
                  className={`text-2xl p-2 rounded-xl transition-all active:scale-90 ${editMood === emoji ? 'bg-mint scale-110' : 'hover:bg-mint/30'}`}>
                  {emoji}
                </button>
              ))}
            </div>
            <textarea value={editNote} onChange={(e) => setEditNote(e.target.value)} placeholder="写下你的心情..." rows={3}
              className="w-full px-4 py-3 bg-cream rounded-2xl text-sm text-warm-dark placeholder-warm-gray resize-none outline-none focus:ring-2 focus:ring-sage/30 transition-all" />
            <div className="flex gap-3 mt-4">
              <button onClick={() => setEditing(false)} className="flex-1 py-2.5 rounded-2xl text-sm text-warm-gray hover:bg-cream transition-colors">取消</button>
              <button onClick={handleSaveEntry} className="flex-1 py-2.5 bg-sage-deep text-white rounded-2xl text-sm font-medium hover:bg-sage-deep/90 active:scale-[0.98] transition-all">保存 💕</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
