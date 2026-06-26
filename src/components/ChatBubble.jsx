import { useState } from 'react'
import { saveFile } from '../pages/FilesPage'

function parseCodeBlocks(text) {
  const blocks = []
  const regex = /```(\w+)?\n([\s\S]*?)```/g
  let match
  while ((match = regex.exec(text)) !== null) {
    blocks.push({ lang: match[1] || 'txt', code: match[2].trim() })
  }
  return blocks
}

export default function ChatBubble({ role, content, attachments, timestamp, canRegenerate, onRegenerate }) {
  const isUser = role === 'user'
  const time = timestamp ? new Date(timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : ''
  const [saved, setSaved] = useState(false)

  const codeBlocks = !isUser && content ? parseCodeBlocks(content) : []
  const displayContent = codeBlocks.length > 0
    ? content.replace(/```[\s\S]*?```/g, '').trim()
    : content
  const hasDisplayContent = displayContent && displayContent.trim()
  const bayAvatar = localStorage.getItem('avatar_bay') || ''
  const claudeAvatar = localStorage.getItem('avatar_claude') || ''

  const getFileInfo = (block) => {
    const extMap = { javascript: 'js', js: 'js', html: 'html', css: 'css', json: 'json', py: 'py', ts: 'ts', tsx: 'tsx', jsx: 'jsx', md: 'md', txt: 'txt' }
    const ext = extMap[block.lang?.toLowerCase()] || block.lang || 'txt'
    const baseNames = { html: 'page', js: 'script', css: 'style', py: 'script', json: 'data', md: 'readme' }
    const name = `${baseNames[ext] || 'file'}.${ext}`
    return { ext, name }
  }

  const handleSave = (block) => {
    const { name } = getFileInfo(block)
    saveFile(name, block.code)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleDownload = (block) => {
    const { name, ext } = getFileInfo(block)
    const mimeMap = { html: 'text/html', css: 'text/css', js: 'text/javascript', json: 'application/json', md: 'text/markdown', txt: 'text/plain' }
    const blob = new Blob([block.code], { type: mimeMap[ext] || 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className={`flex gap-2.5 mt-3 msg-enter items-start ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-sm overflow-hidden ${
        isUser ? 'bg-sage-deep text-white' : 'bg-white text-lg border border-warm-line'
      }`}>
        {(isUser ? bayAvatar : claudeAvatar)?.startsWith('data:') ? (
          <img src={isUser ? bayAvatar : claudeAvatar} alt="" className="w-full h-full object-cover" />
        ) : (
          (isUser ? bayAvatar : claudeAvatar) || (isUser ? '💗' : '🌿')
        )}
      </div>

      <div className={`flex flex-col max-w-[75%] ${isUser ? 'items-end' : 'items-start'}`}>
        {/* Attachments (images) */}
        {attachments && attachments.length > 0 && (
          <div className={`flex flex-col gap-1.5 mb-1.5 ${isUser ? 'items-end' : 'items-start'}`}>
            {attachments.map((a, i) => (
              a.type === 'image' ? (
                <img
                  key={i}
                  src={a.data}
                  alt={a.name}
                  className="max-w-full max-h-64 rounded-2xl object-cover shadow-sm border border-warm-line/30"
                />
              ) : (
                <div key={i} className="flex items-center gap-2 px-3 py-2 bg-white rounded-xl border border-warm-line/50 text-sm">
                  <span>📄</span>
                  <span className="text-warm-dark text-[13px] truncate max-w-[160px]">{a.name}</span>
                </div>
              )
            ))}
          </div>
        )}

        {/* Text bubble */}
        {hasDisplayContent && (
          <div className={`min-w-[60px] px-[28px] py-[18px] text-[14px] leading-[1.8] whitespace-pre-wrap break-words transition-all duration-150 ${
            isUser
              ? 'bg-sage/70 text-white rounded-2xl rounded-tr-md backdrop-blur-sm'
              : 'bg-white/70 text-warm-dark rounded-2xl rounded-tl-md shadow-sm border border-white/40 backdrop-blur-sm'
          }`}>
            {displayContent}
          </div>
        )}

        {/* Streaming dots (no content yet) */}
        {!hasDisplayContent && !(attachments && attachments.length > 0) && (
          <div className="px-4 py-2.5 bg-white rounded-2xl rounded-tl-md shadow-sm border border-warm-line/50">
            <span className="inline-flex gap-1 items-center">
              <span className="w-1.5 h-1.5 bg-sage rounded-full dot-bounce animate-[dotBounce_1.4s_infinite]" />
              <span className="w-1.5 h-1.5 bg-sage rounded-full dot-bounce animate-[dotBounce_1.4s_infinite]" />
              <span className="w-1.5 h-1.5 bg-sage rounded-full dot-bounce animate-[dotBounce_1.4s_infinite]" />
            </span>
          </div>
        )}

        {/* Code block action buttons */}
        {codeBlocks.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2 ml-1">
            {codeBlocks.map((block, i) => {
              const { name } = getFileInfo(block)
              return (
                <div key={i} className="flex items-center gap-1.5 bg-white rounded-xl border border-warm-line/40 px-2 py-1.5">
                  <span className="text-[10px] text-warm-gray/60 flex items-center gap-1">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                    {name}
                  </span>
                  <button
                    onClick={() => handleSave(block)}
                    className="text-[10px] px-2 py-0.5 rounded-lg bg-mint/40 text-sage-deep hover:bg-mint/70 transition-colors active:scale-95"
                  >
                    {saved ? '已保存' : '存文件库'}
                  </button>
                  <button
                    onClick={() => handleDownload(block)}
                    className="text-[10px] px-2 py-0.5 rounded-lg bg-sage-deep/10 text-sage-deep hover:bg-sage-deep/20 transition-colors active:scale-95"
                  >
                    ⬇ 下载
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {/* Regenerate button */}
        {canRegenerate && onRegenerate && hasDisplayContent && (
          <button
            onClick={onRegenerate}
            className="flex items-center gap-1 mt-1.5 ml-1 text-[10px] text-warm-gray/50 hover:text-sage-deep transition-colors active:scale-95"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
            重新生成
          </button>
        )}

        {/* Timestamp */}
        {time && (
          <p className={`text-[10px] text-warm-gray mt-1 ${isUser ? 'text-right mr-1' : 'ml-1'}`}>
            {time}
          </p>
        )}
      </div>
    </div>
  )
}
