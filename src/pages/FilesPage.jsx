import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

function getStoredFiles() {
  try {
    const files = JSON.parse(localStorage.getItem('bunny_files') || '[]')
    // Add demo file on first visit
    if (files.length === 0 && !localStorage.getItem('bunny_demo_added')) {
      localStorage.setItem('bunny_demo_added', '1')
      const demo = [{
        id: 'demo-1',
        name: 'hello-world.html',
        type: 'html',
        content: '<!DOCTYPE html>\n<html>\n<head><meta charset="UTF-8"><title>Hello</title>\n<style>body{display:flex;align-items:center;justify-content:center;min-height:100vh;background:#F7F5F2;font-family:serif;color:#3D3A38}h1{font-size:48px}</style>\n</head>\n<body><h1>Hello, Bay 🌿</h1></body>\n</html>',
        createdAt: new Date().toISOString(),
      }]
      localStorage.setItem('bunny_files', JSON.stringify(demo))
      return demo
    }
    return files
  }
  catch { return [] }
}

export default function FilesPage() {
  const navigate = useNavigate()
  const [files, setFiles] = useState(getStoredFiles)
  const [search, setSearch] = useState('')
  const [preview, setPreview] = useState(null)

  const displayFiles = search.trim()
    ? files.filter((f) => f.name.toLowerCase().includes(search.toLowerCase()))
    : files

  useEffect(() => {
    const onStorage = () => setFiles(getStoredFiles())
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const handleDelete = (id) => {
    const updated = files.filter((f) => f.id !== id)
    localStorage.setItem('bunny_files', JSON.stringify(updated))
    setFiles(updated)
  }

  const handleOpen = (file) => {
    if (file.type === 'html') {
      const blob = new Blob([file.content], { type: 'text/html' })
      window.open(URL.createObjectURL(blob), '_blank')
    } else {
      setPreview(file)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 glass-strong border-b border-white/30">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="w-8 h-8 flex items-center justify-center rounded-lg text-warm-gray hover:bg-mint/50 transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <h2 className="text-lg font-semibold text-warm-dark">文件库</h2>
        </div>
        <span className="text-xs text-warm-gray/50">{files.length} 个文件</span>
      </div>

      {/* Search */}
      <div className="px-3 pt-4 pb-2">
        <div className="relative">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-warm-gray/40"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder=""
            className="w-full pl-10 pr-4 py-4 bg-white rounded-2xl text-sm text-warm-dark outline-none border border-warm-line/50 focus:border-sage/30 transition-all"
          />
        </div>
      </div>

      {/* File Grid */}
      <div className="flex-1 overflow-y-auto">
        {files.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <div className="text-4xl mb-3 opacity-50">📁</div>
            <h3 className="text-base font-semibold text-warm-dark mb-2">还没有文件</h3>
            <p className="text-sm text-warm-gray leading-relaxed max-w-xs mb-5">
              在聊天里让 Claude 写代码，自动弹出保存按钮
            </p>
            <button onClick={() => navigate('/chat')} className="px-5 py-2.5 bg-sage-deep text-white rounded-2xl text-sm font-medium active:scale-95 transition-all">
              去聊天 →
            </button>
          </div>
        ) : (
          <div className="p-3 grid grid-cols-2 gap-4">
            {displayFiles.map((file) => {
              const ext = (file.name || '').split('.').pop()
              const date = new Date(file.createdAt)
              const dateStr = date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
              return (
                <div
                  key={file.id}
                  className="glass rounded-2xl p-4 border border-white/30 flex flex-col hover:shadow-md transition-all group relative"
                >
                  {/* File type tag */}
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[9px] tracking-[0.15em] uppercase text-warm-gray/50">{ext || 'file'}</span>
                    <button
                      onClick={() => handleDelete(file.id)}
                      className="w-6 h-6 flex items-center justify-center rounded-lg text-warm-gray/30 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                  </div>

                  {/* File name */}
                  <button onClick={() => handleOpen(file)} className="text-left flex-1">
                    <p className="text-[13px] font-medium text-warm-dark leading-snug line-clamp-3 break-all">
                      {file.name}
                    </p>
                  </button>

                  {/* Footer */}
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-warm-line/30">
                    <span className="text-[10px] text-warm-gray/50">{dateStr}</span>
                    <button
                      onClick={() => handleOpen(file)}
                      className="text-[10px] text-sage-deep font-medium hover:underline"
                    >
                      打开
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Preview Modal */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setPreview(null)} />
          <div className="relative bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-sm px-6 py-6 shadow-2xl animate-[slideUp_0.3s_ease-out] max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-warm-dark truncate">{preview.name}</h3>
              <button onClick={() => setPreview(null)} className="text-warm-gray hover:text-warm-dark text-lg leading-none">✕</button>
            </div>
            <pre className="flex-1 overflow-auto text-xs text-warm-dark bg-cream rounded-xl p-4 whitespace-pre-wrap font-mono leading-relaxed">
              {preview.content}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Helper for ChatBubble ──
function _getFiles() {
  try { return JSON.parse(localStorage.getItem('bunny_files') || '[]') }
  catch { return [] }
}

const uuid = () => crypto?.randomUUID?.() ?? 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random()*16|0; return (c==='x'?r:r&0x3|0x8).toString(16) })

export function saveFile(name, content) {
  const files = _getFiles()
  const ext = (name || 'file.txt').split('.').pop().toLowerCase()
  const file = {
    id: uuid(),
    name: name || 'untitled.txt',
    type: ['html', 'css', 'js', 'json', 'txt'].includes(ext) ? ext : 'txt',
    content,
    createdAt: new Date().toISOString(),
  }
  files.unshift(file)
  localStorage.setItem('bunny_files', JSON.stringify(files))
  window.dispatchEvent(new Event('storage'))
  return file
}
