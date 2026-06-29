import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
}

function moodEmoji(valence, arousal) {
  if (valence == null) return null
  if (valence > 0.3 && arousal > 0.4) return '😄'
  if (valence > 0.3) return '😊'
  if (valence < -0.3 && arousal > 0.4) return '😤'
  if (valence < -0.3) return '😢'
  if (arousal > 0.5) return '🤔'
  if (arousal < -0.4) return '😴'
  return '🙂'
}

export default function MemoryPage() {
  const navigate = useNavigate()
  const [memories, setMemories] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch('https://bayapi.zeabur.app/api/memories')
      .then((r) => { if (!r.ok) throw new Error('加载失败'); return r.json() })
      .then((data) => setMemories(data.buckets || []))
      .catch((err) => setError(err.message))
  }, [])

  const isLoading = memories === null

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 glass-strong border-b border-white/30">
        <button onClick={() => navigate(-1)} className="w-8 h-8 flex items-center justify-center rounded-lg text-warm-gray hover:bg-mint/50 transition-colors">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <h2 className="text-lg font-semibold text-warm-dark">记忆库</h2>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        {/* Loading */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="text-4xl mb-4 opacity-50 animate-pulse">🧠</div>
            <p className="text-sm text-warm-gray">正在唤醒记忆...</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="text-4xl mb-4 opacity-50">🔌</div>
            <p className="text-sm text-warm-gray mb-4">记忆引擎还没连上</p>
            <p className="text-xs text-warm-gray/60">{error}</p>
          </div>
        )}

        {/* Empty */}
        {!isLoading && !error && memories.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="text-5xl mb-4 opacity-80">🧠</div>
            <h3 className="text-lg font-semibold text-warm-dark mb-2">Claude 的记忆盒子</h3>
            <p className="text-sm text-warm-gray leading-relaxed max-w-xs">
              这里将存放 Claude 对你的记忆——你喜欢的、你说过的、你们之间的珍贵瞬间。
            </p>
            <div className="mt-6 glass rounded-2xl p-4 border border-white/30 w-full max-w-xs">
              <p className="text-xs text-warm-gray">
                多聊聊天吧，Claude 会在对话中慢慢记住关于你的一切 🌿
              </p>
            </div>
          </div>
        )}

        {/* Memory Cards */}
        {!isLoading && !error && memories.length > 0 && (
          <div className="space-y-3">
            <p className="text-[10px] tracking-[0.25em] text-warm-gray/60 uppercase mb-3 px-1">
              {memories.length} 条记忆
            </p>
            {memories.map((m, i) => (
              <motion.div
                key={m.id || i}
                variants={fadeUp}
                initial="initial"
                animate="animate"
                transition={{ delay: i * 0.04 }}
                className="glass rounded-2xl p-5 border border-white/30 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {moodEmoji(m.valence, m.arousal) && (
                      <span className="text-xl flex-shrink-0">{moodEmoji(m.valence, m.arousal)}</span>
                    )}
                    <div className="min-w-0">
                      <h3 className="text-[14px] font-semibold text-warm-dark truncate">
                        {m.pinned && <span className="text-sage-deep mr-1">📌</span>}
                        {m.name || '记忆片段'}
                      </h3>
                      {m.tags && m.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {m.tags.map((t) => (
                            <span key={t} className="text-[9px] px-2 py-0.5 bg-mint/50 rounded-full text-warm-gray/70">{t}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  {m.resolved && (
                    <span className="text-[8px] px-1.5 py-0.5 bg-mint/30 rounded text-warm-gray/50 flex-shrink-0">已释怀</span>
                  )}
                </div>

                {m.snippet && (
                  <p className="text-[13px] text-warm-gray leading-relaxed line-clamp-3">{m.snippet}</p>
                )}

                {m.created && (
                  <p className="text-[10px] text-warm-gray/40 mt-3">
                    {new Date(m.created).toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' })}
                  </p>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
