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

export default function ChatBubble({ role, content, attachments, timestamp }) {
  const isUser = role === 'user'
  const time = timestamp ? new Date(timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : ''
  const [saved, setSaved] = useState(false)

  const codeBlocks = !isUser && content ? parseCodeBlocks(content) : []
  const hasContent = content && content.trim()
  const bayAvatar = localStorage.getItem('avatar_bay') || 'Bay'
  const claudeAvatar = localStorage.getItem('avatar_claude') || '🌿'

  const handleSave = (block) => {
    const ext = block.lang === 'javascript' ? 'js' : (block.lang || 'txt')
    const name = `${ext === 'html' ? 'page' : ext === 'js' ? 'script' : ext === 'css' ? 'style' : 'file'}.${ext}`
    saveFile(name, block.code)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className={`flex gap-2.5 mt-3 msg-enter items-start ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-sm ${
        isUser ? 'bg-sage-deep text-white' : 'bg-white text-lg border border-warm-line'
      }`}>
        {isUser ? bayAvatar : claudeAvatar}
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
        {hasContent && (
          <div className={`min-w-[60px] px-6 py-3.5 text-[14px] leading-[1.8] whitespace-pre-wrap break-words ${
            isUser
              ? 'bg-sage/70 text-white rounded-2xl rounded-tr-md backdrop-blur-sm'
              : 'bg-white/70 text-warm-dark rounded-2xl rounded-tl-md shadow-sm border border-white/40 backdrop-blur-sm'
          }`}>
            {content}
          </div>
        )}

        {/* Streaming dots (no content yet) */}
        {!hasContent && !(attachments && attachments.length > 0) && (
          <div className="px-4 py-2.5 bg-white rounded-2xl rounded-tl-md shadow-sm border border-warm-line/50">
            <span className="inline-flex gap-1 items-center">
              <span className="w-1.5 h-1.5 bg-sage rounded-full dot-bounce animate-[dotBounce_1.4s_infinite]" />
              <span className="w-1.5 h-1.5 bg-sage rounded-full dot-bounce animate-[dotBounce_1.4s_infinite]" />
              <span className="w-1.5 h-1.5 bg-sage rounded-full dot-bounce animate-[dotBounce_1.4s_infinite]" />
            </span>
          </div>
        )}

        {/* Code block save buttons */}
        {codeBlocks.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1.5 ml-1">
            {codeBlocks.map((block, i) => (
              <button
                key={i}
                onClick={() => handleSave(block)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-warm-line/50 text-[11px] text-sage-deep hover:bg-mint/40 transition-colors active:scale-95"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
                {saved ? '已保存' : `保存 ${block.lang || 'file'}`}
              </button>
            ))}
          </div>
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
