import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

const API = 'https://bayapi.zeabur.app'

export default function ClaudeSpace() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('diary') // 'diary' | 'memo'

  // ── Diary state ──
  const [diaries, setDiaries] = useState([])
  const [selectedDiary, setSelectedDiary] = useState(null)

  // ── Memo state ──
  const [portrait, setPortrait] = useState('')
  const [promises, setPromises] = useState([])
  const [editingPortrait, setEditingPortrait] = useState(false)
  const [portraitDraft, setPortraitDraft] = useState('')
  const [editingPromise, setEditingPromise] = useState(null) // null | { id, content, tags, entry_date, status }
  const [promiseDraft, setPromiseDraft] = useState({ content: '', tags: '', date: '' })

  // ── Load data ──
  const loadDiaries = async () => {
    try {
      const res = await fetch(`${API}/api/diaries`)
      const json = await res.json()
      setDiaries(json.data || [])
    } catch {}
  }

  const loadMemo = async () => {
    try {
      const res = await fetch(`${API}/api/memo`)
      const json = await res.json()
      setPortrait(json.portrait?.content || '')
      setPromises(json.promises || [])
    } catch {}
  }

  useEffect(() => {
    loadDiaries()
    loadMemo()
  }, [])

  // ── Portrait save ──
  const savePortrait = async () => {
    await fetch(`${API}/api/memo/portrait`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: portraitDraft }),
    })
    setPortrait(portraitDraft)
    setEditingPortrait(false)
  }

  // ── Promise CRUD ──
  const openNewPromise = () => {
    setPromiseDraft({ content: '', tags: '', date: new Date().toISOString().split('T')[0] })
    setEditingPromise({}) // empty = new
  }

  const openEditPromise = (p) => {
    setPromiseDraft({
      content: p.content,
      tags: (p.tags || []).join(', '),
      date: p.entry_date,
    })
    setEditingPromise(p)
  }

  const savePromise = async () => {
    if (!promiseDraft.content.trim()) return
    const body = {
      content: promiseDraft.content.trim(),
      tags: promiseDraft.tags.split(',').map(t => t.trim()).filter(Boolean),
      entry_date: promiseDraft.date,
    }

    if (editingPromise.id) {
      await fetch(`${API}/api/memo/promises/${editingPromise.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    } else {
      await fetch(`${API}/api/memo/promises`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    }
    setEditingPromise(null)
    loadMemo()
  }

  const togglePromise = async (p) => {
    const newStatus = p.status === 'active' ? 'completed' : 'active'
    await fetch(`${API}/api/memo/promises/${p.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    loadMemo()
  }

  const deletePromise = async (id) => {
    if (!confirm('删除这条承诺？')) return
    await fetch(`${API}/api/memo/promises/${id}`, { method: 'DELETE' })
    loadMemo()
  }

  // ── Format date ──
  const fmtDate = (d) => {
    if (!d) return ''
    const parts = String(d).split('-')
    return `${parseInt(parts[1])}月${parseInt(parts[2])}日`
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 glass-strong border-b border-white/30 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-warm-gray active:scale-90 p-1">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <h1 className="text-[16px] font-semibold text-warm-dark tracking-[0.04em]">Claude的书房</h1>
      </div>

      {/* Tab bar */}
      <div className="flex-shrink-0 flex px-4 pt-3 pb-1 gap-1">
        <button
          onClick={() => setTab('diary')}
          className={`flex-1 py-2 rounded-xl text-[14px] font-medium transition-all active:scale-[0.97] ${
            tab === 'diary' ? 'bg-sage-deep text-white shadow-sm' : 'text-warm-gray hover:bg-mint/50'
          }`}
        >📔 日记</button>
        <button
          onClick={() => setTab('memo')}
          className={`flex-1 py-2 rounded-xl text-[14px] font-medium transition-all active:scale-[0.97] ${
            tab === 'memo' ? 'bg-sage-deep text-white shadow-sm' : 'text-warm-gray hover:bg-mint/50'
          }`}
        >📋 备忘录</button>
      </div>

      {/* ── Diary Tab ── */}
      {tab === 'diary' && (
        <div className="flex-1 overflow-y-auto px-4 pt-3 pb-6">
          {diaries.length === 0 ? (
            <div className="text-center py-20 text-warm-gray/60">
              <p className="text-4xl mb-3">📔</p>
              <p className="text-[14px]">还没有日记</p>
              <p className="text-[12px] mt-1">Claude 每天早上 6 点写前一天的日记</p>
            </div>
          ) : (
            diaries.map((d) => (
              <button
                key={d.id}
                onClick={() => setSelectedDiary(d)}
                className="w-full text-left glass rounded-2xl p-4 border border-white/30 mb-3 hover:shadow-md transition-shadow active:scale-[0.98]"
              >
                <p className="text-[13px] font-semibold text-sage-deep mb-1">{fmtDate(d.entry_date)}</p>
                <p className="text-[14px] text-warm-dark leading-relaxed line-clamp-3">{d.content.slice(0, 120)}</p>
              </button>
            ))
          )}
        </div>
      )}

      {/* ── Memo Tab ── */}
      {tab === 'memo' && (
        <div className="flex-1 overflow-y-auto px-4 pt-3 pb-6">
          {/* Portrait */}
          <div className="glass rounded-2xl p-4 border border-white/30 mb-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[13px] font-semibold text-warm-dark">关于小湾</p>
              <button
                onClick={() => { setPortraitDraft(portrait); setEditingPortrait(true) }}
                className="text-[12px] text-sage-deep active:scale-90"
              >编辑</button>
            </div>
            {portrait ? (
              <p className="text-[14px] text-warm-dark leading-relaxed whitespace-pre-wrap">{portrait}</p>
            ) : (
              <p className="text-[13px] text-warm-gray/60 italic">还没有画像，点击编辑来写一段…</p>
            )}
          </div>

          {/* Promises */}
          <div className="flex items-center justify-between mb-2 px-1">
            <p className="text-[13px] font-semibold text-warm-dark">承诺 & 待办</p>
            <button onClick={openNewPromise} className="text-[12px] text-sage-deep active:scale-90 font-medium">+ 添加</button>
          </div>

          {promises.length === 0 && (
            <p className="text-center py-8 text-[13px] text-warm-gray/60">还没有承诺</p>
          )}

          {promises.map((p) => (
            <div
              key={p.id}
              className={`glass rounded-2xl p-3 border border-white/30 mb-2 transition-all ${
                p.status === 'completed' ? 'opacity-50' : ''
              }`}
            >
              <div className="flex items-start gap-2">
                {/* Checkbox */}
                <button
                  onClick={() => togglePromise(p)}
                  className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 active:scale-90 transition-all ${
                    p.status === 'completed'
                      ? 'bg-sage-deep border-sage-deep text-white'
                      : 'border-warm-gray/30 hover:border-sage-deep'
                  }`}
                >
                  {p.status === 'completed' && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                  )}
                </button>

                <div className="flex-1 min-w-0">
                  <p className={`text-[14px] leading-relaxed ${p.status === 'completed' ? 'line-through text-warm-gray' : 'text-warm-dark'}`}>
                    {p.content}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[11px] text-warm-gray/60">{fmtDate(p.entry_date)}</span>
                    {(p.tags || []).map((t, i) => (
                      <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-mint text-sage-deep">{t}</span>
                    ))}
                    {p.status === 'completed' && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-sage/20 text-sage-deep">已完成</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-0.5 flex-shrink-0">
                  <button onClick={() => openEditPromise(p)} className="p-1 text-warm-gray/40 hover:text-sage-deep active:scale-90">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </button>
                  <button onClick={() => deletePromise(p.id)} className="p-1 text-warm-gray/40 hover:text-red-400 active:scale-90">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Diary detail modal ── */}
      {selectedDiary && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={() => setSelectedDiary(null)}>
          <div className="absolute inset-0 bg-black/30" />
          <div
            className="relative bg-cream rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md max-h-[80vh] flex flex-col animate-[slideUp_0.3s_ease-out]"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-warm-line/50">
              <p className="text-[15px] font-semibold text-warm-dark">{fmtDate(selectedDiary.entry_date)}</p>
              <button onClick={() => setSelectedDiary(null)} className="text-warm-gray p-1 active:scale-90">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="overflow-y-auto px-5 py-4">
              <p className="text-[15px] text-warm-dark leading-relaxed whitespace-pre-wrap">{selectedDiary.content}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Portrait edit modal ── */}
      {editingPortrait && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={() => setEditingPortrait(false)}>
          <div className="absolute inset-0 bg-black/30" />
          <div
            className="relative bg-cream rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md animate-[slideUp_0.3s_ease-out]"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-warm-line/50">
              <p className="text-[15px] font-semibold text-warm-dark">编辑画像</p>
              <button onClick={() => setEditingPortrait(false)} className="text-warm-gray active:scale-90 text-[14px]">取消</button>
            </div>
            <div className="px-5 py-4">
              <textarea
                value={portraitDraft}
                onChange={e => setPortraitDraft(e.target.value)}
                className="w-full bg-cream border border-warm-line/50 rounded-2xl p-4 text-[14px] text-warm-dark leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-sage/30"
                rows={5}
                placeholder="写一段关于小湾的描述…"
              />
              <button
                onClick={savePortrait}
                className="w-full mt-3 py-3 bg-sage-deep text-white rounded-2xl text-[14px] font-medium active:scale-[0.98]"
              >保存</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Promise add/edit modal ── */}
      {editingPromise && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={() => setEditingPromise(null)}>
          <div className="absolute inset-0 bg-black/30" />
          <div
            className="relative bg-cream rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md animate-[slideUp_0.3s_ease-out]"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-warm-line/50">
              <p className="text-[15px] font-semibold text-warm-dark">{editingPromise.id ? '编辑承诺' : '新建承诺'}</p>
              <button onClick={() => setEditingPromise(null)} className="text-warm-gray active:scale-90 text-[14px]">取消</button>
            </div>
            <div className="px-5 py-4 flex flex-col gap-3">
              <textarea
                value={promiseDraft.content}
                onChange={e => setPromiseDraft({ ...promiseDraft, content: e.target.value })}
                className="w-full bg-cream border border-warm-line/50 rounded-2xl p-4 text-[14px] text-warm-dark leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-sage/30"
                rows={2}
                placeholder="承诺内容…"
              />
              <input
                type="date"
                value={promiseDraft.date}
                onChange={e => setPromiseDraft({ ...promiseDraft, date: e.target.value })}
                className="w-full bg-cream border border-warm-line/50 rounded-2xl px-4 py-3 text-[14px] text-warm-dark focus:outline-none focus:ring-2 focus:ring-sage/30"
              />
              <input
                value={promiseDraft.tags}
                onChange={e => setPromiseDraft({ ...promiseDraft, tags: e.target.value })}
                className="w-full bg-cream border border-warm-line/50 rounded-2xl px-4 py-3 text-[14px] text-warm-dark focus:outline-none focus:ring-2 focus:ring-sage/30"
                placeholder="标签（逗号分隔）如：健康, 学习"
              />
              <button
                onClick={savePromise}
                className="w-full py-3 bg-sage-deep text-white rounded-2xl text-[14px] font-medium active:scale-[0.98]"
              >保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
