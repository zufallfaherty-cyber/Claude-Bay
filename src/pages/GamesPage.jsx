import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

const dailyQuestions = [
  { q: '如果明天是世界末日，你今天会做什么？', emoji: '🌍' },
  { q: '你最近一次开怀大笑是因为什么？', emoji: '😂' },
  { q: '如果可以拥有一个超能力，你想要什么？', emoji: '⚡' },
  { q: '你觉得十年后的自己会在哪里？', emoji: '🔮' },
  { q: '最近学到的一件新事情是什么？', emoji: '💡' },
  { q: '如果变成小动物，你想变成什么？', emoji: '🐱' },
  { q: '你最想和谁一起吃顿晚饭？', emoji: '🍽️' },
  { q: '今天有没有什么让你感动的小事？', emoji: '💕' },
  { q: '如果能回到过去改一件事，你会改什么？', emoji: '⏰' },
  { q: '你觉得自己最宝贵的品质是什么？', emoji: '✨' },
]

export default function GamesPage() {
  const navigate = useNavigate()
  const [question, setQuestion] = useState(() =>
    dailyQuestions[Math.floor(Math.random() * dailyQuestions.length)]
  )

  const refresh = () => {
    let newQ
    do { newQ = dailyQuestions[Math.floor(Math.random() * dailyQuestions.length)] }
    while (newQ.q === question.q)
    setQuestion(newQ)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-3 glass-strong border-b border-white/30">
        <button onClick={() => navigate('/')} className="w-8 h-8 flex items-center justify-center rounded-lg text-warm-gray hover:bg-mint/50 transition-colors">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <h2 className="text-lg font-semibold text-warm-dark">小游戏</h2>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
        {/* Daily Question */}
        <div className="glass rounded-2xl p-6 border border-white/40 text-center">
          <p className="text-xs text-warm-gray mb-2 uppercase tracking-wider">每日一问</p>
          <span className="text-4xl block mb-3">{question.emoji}</span>
          <p className="text-base text-warm-dark font-medium leading-relaxed mb-4">{question.q}</p>
          <button onClick={refresh} className="text-sm text-sage-deep hover:text-sage transition-colors">
            换一题 🔄
          </button>
        </div>

        {/* Coming Soon */}
        <div className="glass rounded-2xl p-5 border border-white/40">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-2xl">🎲</span>
            <div>
              <p className="text-sm font-semibold text-warm-dark">飞行棋</p>
              <p className="text-xs text-warm-gray">两个人的小棋盘</p>
            </div>
          </div>
          <p className="text-xs text-warm-gray">🚧 即将上线 · 和 Claude 一起玩飞行棋</p>
        </div>

        <div className="glass rounded-2xl p-5 border border-white/40">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-2xl">🎴</span>
            <div>
              <p className="text-sm font-semibold text-warm-dark">更多游戏</p>
              <p className="text-xs text-warm-gray">你有什么好玩的点子？</p>
            </div>
          </div>
          <p className="text-xs text-warm-gray">🚧 有想玩的随时告诉我，我帮你做进来</p>
        </div>
      </div>
    </div>
  )
}
