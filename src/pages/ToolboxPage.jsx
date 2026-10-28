import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { toolMeta } from '../lib/toolLabels'

const API = 'https://124-156-142-6.sslip.io'

export default function ToolboxPage() {
  const navigate = useNavigate()
  const [servers, setServers] = useState(null)
  const [error, setError] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newUrl, setNewUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [expandedServers, setExpandedServers] = useState({})

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/mcp/tools`)
      const json = await res.json()
      setServers(json.servers || [])
      setError(null)
    } catch (e) {
      setError(e.message)
      setServers([])
    }
  }, [])

  useEffect(() => { load() }, [load])

  const toggleTool = async (serverName, toolName, enabled) => {
    setServers((prev) => prev.map((s) => s.name === serverName
      ? { ...s, tools: s.tools.map((t) => t.name === toolName ? { ...t, enabled } : t) }
      : s))
    try {
      await fetch(`${API}/api/mcp/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ server: serverName, tool: toolName, enabled }),
      })
    } catch { load() }
  }

  const toggleAll = async (serverName, enabled) => {
    setServers((prev) => prev.map((s) => s.name === serverName
      ? { ...s, tools: s.tools.map((t) => ({ ...t, enabled })) }
      : s))
    try {
      await fetch(`${API}/api/mcp/toggle-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ server: serverName, enabled }),
      })
    } catch { load() }
  }

  const addServer = async () => {
    if (!newName.trim() || !newUrl.trim()) return
    setSaving(true)
    try {
      await fetch(`${API}/api/mcp/servers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), url: newUrl.trim() }),
      })
      setNewName(''); setNewUrl(''); setShowAdd(false)
      await load()
    } catch (e) { setError(e.message) }
    setSaving(false)
  }

  const deleteServer = async (name) => {
    if (!confirm(`删除「${name}」这个工具服务？`)) return
    try {
      await fetch(`${API}/api/mcp/servers/${encodeURIComponent(name)}`, { method: 'DELETE' })
      await load()
    } catch (e) { setError(e.message) }
  }

  const isLoading = servers === null
  const totalOn = (servers || []).reduce((n, s) => n + s.tools.filter((t) => t.enabled).length, 0)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 glass-strong border-b border-white/30">
        <button onClick={() => navigate(-1)} className="w-11 h-11 -ml-2 flex items-center justify-center rounded-xl text-warm-gray hover:bg-mint/50 transition-colors active:scale-95">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <h2 className="text-lg font-semibold text-warm-dark">工具箱</h2>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className={`ml-auto px-4 py-2.5 rounded-xl text-[14px] font-medium transition-all active:scale-95 ${showAdd ? 'bg-mint text-sage-deep' : 'bg-sage-deep text-white shadow-sm'}`}
        >{showAdd ? '取消' : '+ 添加工具'}</button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        {/* Intro */}
        <div className="glass rounded-2xl p-5 border border-white/40 mb-5">
          <p className="text-[14px] text-warm-dark leading-relaxed">🧰 给 Claude 接上外部工具。开启后，聊天时 Claude 会<b>自己判断</b>要不要调用、调用后再回答你。</p>
          {!isLoading && (servers || []).length > 0 && (
            <p className="text-[12px] text-warm-gray/60 mt-1.5">已开启 {totalOn} 个工具</p>
          )}
        </div>

        {/* Add form */}
        {showAdd && (
          <div className="glass rounded-2xl p-5 border border-sage/40 mb-5 space-y-3">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="名字（如 小红书）"
              className="w-full px-4 py-3.5 bg-white/70 rounded-2xl text-[15px] text-warm-dark border border-white/40 outline-none focus:ring-2 focus:ring-sage/30"
            />
            <input
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder="MCP 地址（一般以 /mcp 结尾）"
              className="w-full px-4 py-3.5 bg-white/70 rounded-2xl text-[15px] text-warm-dark border border-white/40 outline-none focus:ring-2 focus:ring-sage/30"
            />
            <button
              onClick={addServer}
              disabled={saving || !newName.trim() || !newUrl.trim()}
              className="w-full py-3.5 bg-sage-deep text-white rounded-2xl text-[15px] font-medium active:scale-[0.98] disabled:opacity-40"
            >{saving ? '保存中…' : '保存'}</button>
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center h-40 text-center">
            <div className="text-4xl mb-3 opacity-50 animate-pulse">🧰</div>
            <p className="text-sm text-warm-gray">正在读取工具…</p>
          </div>
        )}

        {/* Error */}
        {!isLoading && error && (
          <div className="glass rounded-2xl p-5 border border-white/40 text-center">
            <p className="text-sm text-warm-gray mb-1">读取失败</p>
            <p className="text-xs text-warm-gray/60">{error}</p>
          </div>
        )}

        {/* Empty */}
        {!isLoading && !error && (servers || []).length === 0 && (
          <div className="flex flex-col items-center justify-center text-center py-10">
            <div className="text-6xl mb-4 opacity-80">🧰</div>
            <h3 className="text-xl font-semibold text-warm-dark mb-2">还没有工具</h3>
            <p className="text-[15px] text-warm-gray leading-relaxed max-w-xs mb-6">
              点右上角「+ 添加工具」，接一个 MCP 服务（比如小红书），Claude 就能在聊天时替你查笔记、看通知、回评论。
            </p>
            <button onClick={() => setShowAdd(true)} className="px-7 py-3.5 bg-sage-deep text-white rounded-2xl text-[15px] font-medium active:scale-95">+ 添加第一个工具服务</button>
          </div>
        )}

        {/* Server cards */}
        {!isLoading && (servers || []).map((s, i) => {
          const onCount = s.tools.filter((t) => t.enabled).length
          const allOn = s.tools.length > 0 && onCount === s.tools.length
          const isExpanded = !!expandedServers[s.name]
          const visibleTools = isExpanded ? s.tools : []
          return (
            <motion.div
              key={s.name}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="glass rounded-2xl p-5 border border-white/40 mb-5"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="min-w-0">
                  <h3 className="text-[16px] font-semibold text-warm-dark truncate">{s.name}</h3>
                  <p className="text-[12px] text-warm-gray/50 truncate mt-0.5">{s.url}</p>
                </div>
                <button
                  onClick={() => deleteServer(s.name)}
                  className="w-11 h-11 -mr-2 flex items-center justify-center text-warm-gray/40 hover:text-red-400 active:scale-90 flex-shrink-0"
                  title="删除"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
              </div>

              <div className="flex items-center justify-between mb-3">
                <span className="text-[13px] text-warm-gray">{s.tools.length} 个工具 · 已开 {onCount}</span>
                <button
                  onClick={() => toggleAll(s.name, !allOn)}
                  disabled={s.tools.length === 0}
                  className="px-4 py-2 rounded-full border border-sage-deep/40 text-sage-deep text-[13px] font-medium active:scale-95 disabled:opacity-40"
                >{allOn ? '全部关闭' : '全部开启'}</button>
              </div>

              {s.tools.length === 0 ? (
                <p className="text-[13px] text-warm-gray/50 italic py-3">没有发现工具（服务可能没连上）</p>
              ) : (
                <div className="space-y-3">
                  {visibleTools.map((t) => (
                    <button
                      key={t.name}
                      onClick={() => toggleTool(s.name, t.name, !t.enabled)}
                      className="w-full flex items-center gap-4 p-4 rounded-2xl bg-white/45 border border-white/50 hover:bg-mint/40 active:scale-[0.98] transition-all text-left min-h-[72px]"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-[15px] font-semibold text-warm-dark">{toolMeta(t.name).label}</p>
                        {(toolMeta(t.name).desc || t.description) && <p className="text-[12px] text-warm-gray/60 leading-relaxed mt-1 line-clamp-2">{toolMeta(t.name).desc || t.description}</p>}
                      </div>
                      {/* Big switch (visual) */}
                      <span className={`relative w-14 h-8 rounded-full transition-all flex-shrink-0 ${t.enabled ? 'bg-sage-deep' : 'bg-warm-line/50'}`}>
                        <span className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow-sm transition-all ${t.enabled ? 'left-7' : 'left-1'}`} />
                      </span>
                    </button>
                  ))}
                  <button
                    onClick={() => setExpandedServers((prev) => ({ ...prev, [s.name]: !prev[s.name] }))}
                    className="w-full py-2.5 text-[13px] font-medium text-sage-deep/80 hover:text-sage-deep active:scale-[0.98] transition-all"
                  >
                    {isExpanded ? '收起 ▲' : `展开 ${s.tools.length} 个工具 ▼`}
                  </button>
                </div>
              )}
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
