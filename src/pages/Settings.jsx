import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function Settings() {
  const navigate = useNavigate()
  const [prompt, setPrompt] = useState(() =>
    localStorage.getItem('system_prompt') ||
    '你是一个温柔、细腻的AI伙伴。你善于倾听，会记住我说过的话，用温暖的方式回应。你的回复自然、真诚，像一个真正关心我的人。'
  )
  const [temperature, setTemperature] = useState(() =>
    parseFloat(localStorage.getItem('temperature') || '0.8')
  )
  const [maxRounds, setMaxRounds] = useState(() =>
    parseInt(localStorage.getItem('max_context_rounds') || '20')
  )
  const [saved, setSaved] = useState(false)

  const handleSave = () => {
    localStorage.setItem('system_prompt', prompt)
    localStorage.setItem('temperature', temperature.toString())
    localStorage.setItem('max_context_rounds', maxRounds.toString())
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
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
        <h2 className="text-lg font-semibold text-warm-dark">设置</h2>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-6">
        {/* System Prompt */}
        <div>
          <label className="text-sm font-medium text-warm-dark mb-2 block">
            AI 性格设定
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            className="w-full px-4 py-3 bg-white rounded-2xl text-sm text-warm-dark border border-warm-line outline-none focus:ring-2 focus:ring-rose-light resize-none transition-all"
          />
          <p className="text-xs text-warm-gray mt-1">
            这是 Claude 的"灵魂"——定义了它和你聊天时的风格和态度
          </p>
        </div>

        {/* Temperature */}
        <div>
          <label className="text-sm font-medium text-warm-dark mb-2 block">
            回复创意度：{temperature}
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={temperature}
            onChange={(e) => setTemperature(parseFloat(e.target.value))}
            className="w-full accent-rose-deep"
          />
          <div className="flex justify-between text-xs text-warm-gray">
            <span>更稳定</span>
            <span>更有创意</span>
          </div>
        </div>

        {/* Max Context Rounds */}
        <div>
          <label className="text-sm font-medium text-warm-dark mb-2 block">
            上下文记忆轮数
          </label>
          <select
            value={maxRounds}
            onChange={(e) => setMaxRounds(parseInt(e.target.value))}
            className="w-full px-4 py-3 bg-white rounded-2xl text-sm text-warm-dark border border-warm-line outline-none focus:ring-2 focus:ring-rose-light transition-all"
          >
            {[5, 10, 20, 30, 50].map((n) => (
              <option key={n} value={n}>{n} 轮对话</option>
            ))}
          </select>
          <p className="text-xs text-warm-gray mt-1">
            更大的数字意味着 Claude 能记住更久之前的对话
          </p>
        </div>
      </div>

      {/* Save Button */}
      <div className="px-4 py-3 border-t border-warm-line">
        <button
          onClick={handleSave}
          className={`w-full py-3 rounded-2xl font-medium text-[15px] active:scale-[0.98] transition-all ${
            saved
              ? 'bg-green-100 text-green-700'
              : 'bg-rose-deep text-white hover:bg-rose-deep/90'
          }`}
        >
          {saved ? '✅ 已保存' : '保存设置'}
        </button>
      </div>
    </div>
  )
}
