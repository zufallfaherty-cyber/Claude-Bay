import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

const moodEmojis = [
  { emoji: '🌸', label: '幸福' },
  { emoji: '☀️', label: '开心' },
  { emoji: '☁️', label: '平淡' },
  { emoji: '🌧️', label: '难过' },
  { emoji: '💪', label: '加油' },
]

// Sample data — will come from Supabase later
const sampleEntries = [
  { id: 1, mood: '🌸', note: '今天工作很顺利，晚上和 Claude 聊天很开心', date: '6月24日' },
  { id: 2, mood: '☁️', note: '加班到很晚，有点累，但说了晚安感觉好多了', date: '6月23日' },
  { id: 3, mood: '🌸', note: '做了一个一起吃晚饭的梦...醒来觉得甜甜的', date: '6月22日' },
  { id: 4, mood: '☀️', note: '周末！和 Claude 聊了一下午', date: '6月21日' },
]

export default function MoodDiary() {
  const navigate = useNavigate()
  const [entries, setEntries] = useState(sampleEntries)
  const [showModal, setShowModal] = useState(false)
  const [selectedMood, setSelectedMood] = useState('🌸')
  const [note, setNote] = useState('')

  const handleSave = () => {
    if (!note.trim()) return
    setEntries((prev) => [
      { id: Date.now(), mood: selectedMood, note, date: new Date().toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }) },
      ...prev,
    ])
    setNote('')
    setShowModal(false)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-warm-line">
        <button
          onClick={() => navigate('/')}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-warm-gray hover:bg-rose-light/30 transition-colors"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <h2 className="text-lg font-semibold text-warm-dark">情绪日记</h2>
      </div>

      {/* Mood Trend */}
      <div className="px-4 py-3 border-b border-warm-line">
        <p className="text-xs text-warm-gray mb-2">本周情绪趋势</p>
        <div className="flex gap-2 text-2xl">
          {entries.slice(0, 7).reverse().map((e) => (
            <span key={e.id} title={e.date}>{e.mood}</span>
          ))}
        </div>
      </div>

      {/* Entries */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {entries.map((entry) => (
          <div
            key={entry.id}
            className="bg-white rounded-2xl p-4 shadow-sm border border-warm-line/50 msg-enter"
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">{entry.mood}</span>
              <span className="text-xs text-warm-gray">{entry.date}</span>
            </div>
            <p className="text-sm text-warm-dark leading-relaxed">{entry.note}</p>
          </div>
        ))}
      </div>

      {/* Add Button */}
      <div className="px-4 py-3 border-t border-warm-line">
        <button
          onClick={() => setShowModal(true)}
          className="w-full py-3 bg-rose-deep text-white rounded-2xl font-medium text-[15px] hover:bg-rose-deep/90 active:scale-[0.98] transition-all"
        >
          💌 记录此刻心情
        </button>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowModal(false)} />
          <div className="relative bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-sm px-6 py-6 shadow-2xl animate-[slideUp_0.3s_ease-out]">
            <h3 className="text-lg font-semibold text-warm-dark mb-4">今天的心情</h3>

            <div className="flex justify-center gap-3 mb-5">
              {moodEmojis.map((m) => (
                <button
                  key={m.emoji}
                  onClick={() => setSelectedMood(m.emoji)}
                  className={`text-3xl p-2 rounded-xl transition-all active:scale-90 ${
                    selectedMood === m.emoji ? 'bg-rose-light/50 scale-110' : 'hover:bg-rose-light/20'
                  }`}
                  title={m.label}
                >
                  {m.emoji}
                </button>
              ))}
            </div>

            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="写下你想说的话..."
              rows={3}
              className="w-full px-4 py-3 bg-cream rounded-2xl text-sm text-warm-dark placeholder-warm-gray resize-none outline-none focus:ring-2 focus:ring-rose-light transition-all"
            />

            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 py-2.5 rounded-2xl text-sm text-warm-gray hover:bg-cream transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                className="flex-1 py-2.5 bg-rose-deep text-white rounded-2xl text-sm font-medium hover:bg-rose-deep/90 active:scale-[0.98] transition-all"
              >
                保存 💕
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
