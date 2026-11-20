import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
}

// 桶名常带「2026-11-13 09-33-54 」前缀，卡片下方已有日期，去掉避免重复
function cleanName(name) {
  return String(name || '').replace(/^\d{4}-\d{2}-\d{2}\s+\d{2}-\d{2}-\d{2}\s+/, '').trim()
}

// 内部管理用的标签，不展示（合并脚本靠它们避免重复压缩）
const INTERNAL_TAGS = new Set(['长期记忆', '整理', '具体瞬间', '日记', '瞬间'])

function visibleTags(tags) {
  return (tags || []).filter((t) => !INTERNAL_TAGS.has(t))
}

function moodEmoji(valence, arousal) {
  if (valence == null || arousal == null) return null
  // DS never gives negative valence; use low-V + high-A as negative signal
  if (valence >= 0.7 && arousal >= 0.5) return '😄'  // happy excited
  if (valence >= 0.7) return '😌'                     // warm quiet
  if (valence >= 0.5 && arousal >= 0.5) return '🥰'   // warm interaction
  if (valence >= 0.5) return '😊'                     // daily happy
  if (valence >= 0.3 && arousal >= 0.6) return '😣'   // upset / grievance
  if (valence >= 0.3) return '🥺'                     // fragile / pleading
  if (arousal >= 0.6) return '😤'                     // anxious / angry
  return '😔'                                         // low / tired
}

export default function MemoryPage() {
  const navigate = useNavigate()
  const [memories, setMemories] = useState(null)
  const [total, setTotal] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(null)
  const [expandedId, setExpandedId] = useState(null)

  // 分页加载：首屏 60 条完整正文（约 200~300KB），点「再看」再拉下一页。
  // 之前一次拉 2000 条完整正文（几 MB），手机解析 JSON 会卡死。
  const PAGE = 60
  const BASE = 'https://124-156-142-6.sslip.io'

  useEffect(() => {
    // 优先拉分页列表（直接读记忆桶文件）；老接口只有浮现的 20 条，作为兜底
    fetch(`${BASE}/api/memories/all?limit=${PAGE}&offset=0`)
      .then((r) => { if (!r.ok) throw new Error('加载失败'); return r.json() })
      .then((data) => {
        setMemories(data.buckets || [])
        if (typeof data.total === 'number') setTotal(data.total)
        else setTotal((data.buckets || []).length)
      })
      .catch(() => fetch(`${BASE}/api/memories`)
        .then((r) => { if (!r.ok) throw new Error('加载失败'); return r.json() })
        .then((data) => { setMemories(data.buckets || []); setTotal((data.buckets || []).length) })
        .catch((err) => setError(err.message)))
  }, [])

  const loadMore = () => {
    if (loadingMore || !memories) return
    setLoadingMore(true)
    fetch(`${BASE}/api/memories/all?limit=${PAGE}&offset=${memories.length}`)
      .then((r) => { if (!r.ok) throw new Error('加载失败'); return r.json() })
      .then((data) => {
        setMemories((prev) => [...prev, ...(data.buckets || [])])
        if (typeof data.total === 'number') setTotal(data.total)
      })
      .catch(() => {})
      .finally(() => setLoadingMore(false))
  }

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
              {total || memories.length} 条记忆
            </p>
            {memories.map((m, i) => {
              const expanded = expandedId === (m.id || i)
              return (
              <motion.div
                key={m.id || i}
                variants={fadeUp}
                initial="initial"
                animate="animate"
                transition={{ delay: Math.min(i, 12) * 0.03 }}
                onClick={() => setExpandedId(expanded ? null : (m.id || i))}
                className="glass rounded-2xl p-5 border border-white/30 hover:shadow-md transition-shadow cursor-pointer"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {moodEmoji(m.valence, m.arousal) && (
                      <span className="text-xl flex-shrink-0">{moodEmoji(m.valence, m.arousal)}</span>
                    )}
                    <div className="min-w-0">
                      <h3 className="text-[14px] font-semibold text-warm-dark truncate">
                        {m.pinned && <span className="text-sage-deep mr-1">📌</span>}
                        {cleanName(m.name) || '记忆片段'}
                      </h3>
                      {visibleTags(m.tags).length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {visibleTags(m.tags).map((t) => (
                            <span key={t} className="text-[9px] px-2 py-0.5 bg-mint/50 rounded-full text-warm-gray/70">{t}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {m.importance >= 8 && (
                      <span className="text-[8px] px-1.5 py-0.5 bg-amber-100/70 rounded text-amber-700/70">重要 {m.importance}</span>
                    )}
                    {m.resolved && (
                      <span className="text-[8px] px-1.5 py-0.5 bg-mint/30 rounded text-warm-gray/50">已释怀</span>
                    )}
                  </div>
                </div>

                {m.content ? (
                  <p className={`text-[13px] text-warm-gray leading-relaxed whitespace-pre-line ${expanded ? '' : 'line-clamp-3'}`}>{m.content}</p>
                ) : m.snippet && (
                  <p className={`text-[13px] text-warm-gray leading-relaxed ${expanded ? '' : 'line-clamp-3'}`}>{m.snippet}</p>
                )}

                {m.created && (
                  <p className="text-[10px] text-warm-gray/40 mt-3">
                    {String(m.created).slice(0, 10).replace(/-/g, '/')}
                    {!expanded && m.content && m.content.length > 120 && <span className="ml-2 text-warm-gray/30">点击展开</span>}
                  </p>
                )}
              </motion.div>
            )})}
            {total > memories.length && (
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="w-full py-3 rounded-2xl glass border border-white/30 text-[13px] text-warm-gray hover:bg-mint/30 transition-colors disabled:opacity-60"
              >
                {loadingMore ? '正在翻记忆…' : `再看 ${PAGE} 条（还有 ${total - memories.length} 条）`}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
