import { useState } from 'react'
import { toolMeta } from '../lib/toolLabels'
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

export default function ChatBubble({ role, content, attachments, tools, timestamp, isContinuation, canRegenerate, onRegenerate }) {
  const isUser = role === 'user'
  const time = timestamp ? new Date(timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : ''
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    if (!content) return
    try {
      await navigator.clipboard.writeText(content)
    } catch {
      const el = document.createElement('textarea')
      el.value = content
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

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

  const avatarSrc = isUser ? bayAvatar : claudeAvatar

  return (
    <div className={`flex gap-2 items-start msg-enter ${isUser ? 'flex-row-reverse' : ''} ${isContinuation ? 'mt-1.5' : 'mt-3.5'}`}>
      {isContinuation ? (
        <div className="w-7 shrink-0" aria-hidden="true" />
      ) : (
        <div className={`chat-avatar w-7 h-7 rounded-full shrink-0 flex items-center justify-center overflow-hidden border ${
          isUser ? 'border-white/70 bg-sage/75 text-[12px] text-white' : 'border-white/80 bg-white/85 text-[13px]'
        }`}>
          {avatarSrc?.startsWith('data:') ? (
            <img src={avatarSrc} alt="" className="w-full h-full object-cover" />
          ) : (
            avatarSrc || (isUser ? '💗' : '🌿')
          )}
        </div>
      )}

      <div className={`flex flex-col max-w-[78%] min-w-0 ${isUser ? 'items-end' : 'items-start'}`}>
        {/* Attachments (images) */}
        {attachments && attachments.length > 0 && (
          <div className={`flex flex-col gap-1.5 mb-1.5 ${isUser ? 'items-end' : 'items-start'}`}>
            {attachments.map((a, i) => (
              a.type === 'image' ? (
                <img
                  key={i}
                  src={a.data}
                  alt={a.name}
                  className="max-w-full max-h-64 rounded-[16px] object-cover border border-white/70 shadow-[0_4px_14px_-10px_rgba(70,85,62,0.34)]"
                />
              ) : (
                <div key={i} className="flex items-center gap-2 px-3 py-2 bg-white/80 backdrop-blur-sm rounded-[14px] border border-white/70 text-sm">
                  <span>📄</span>
                  <span className="text-warm-dark text-[13px] truncate max-w-[160px]">{a.name}</span>
                </div>
              )
            ))}
          </div>
        )}

        {/* Tool call hint (above reply) */}
        {!isUser && tools && tools.length > 0 && (
          <div className="mb-1.5 flex flex-wrap gap-1.5 ml-1">
            {tools.map((t, i) => {
              const name = toolMeta(t.name).label
              return (
                <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/55 backdrop-blur-sm text-sage-deep/90 text-[10.5px] font-medium border border-white/70">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
                  {name}
                </span>
              )
            })}
          </div>
        )}

        {/* Text bubble */}
        {hasDisplayContent && (
          <div className={`w-fit max-w-full px-3.5 py-2 text-[13px] leading-[1.72] whitespace-pre-wrap break-words ${
            isUser ? 'bubble-user' : 'bubble-claude bubble-rise'
          } ${isUser ? 'rounded-[16px] rounded-tr-[6px]' : 'rounded-[16px] rounded-tl-[6px]'}`}>
            {displayContent}
          </div>
        )}

        {/* Typing dots (no content yet) */}
        {!hasDisplayContent && !(attachments && attachments.length > 0) && (
          <div className="bubble-claude px-3.5 py-2.5 rounded-[16px] rounded-tl-[6px]">
            <span className="inline-flex gap-1.5 items-center">
              <span className="typing-dot w-1.5 h-1.5 bg-sage-deep/80 rounded-full" />
              <span className="typing-dot w-1.5 h-1.5 bg-sage-deep/80 rounded-full" />
              <span className="typing-dot w-1.5 h-1.5 bg-sage-deep/80 rounded-full" />
            </span>
          </div>
        )}

        {/* Code block action buttons */}
        {codeBlocks.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2 ml-1">
            {codeBlocks.map((block, i) => {
              const { name } = getFileInfo(block)
              return (
                <div key={i} className="flex items-center gap-1.5 bg-white/75 backdrop-blur-sm rounded-[14px] border border-white/70 px-2 py-1.5">
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

        {/* Timestamp + copy */}
        <div className={`flex items-center gap-2 mt-1 ${isUser ? 'flex-row-reverse mr-1' : 'ml-1'}`}>
          {time && <span className="text-[9px] tracking-[0.04em] text-warm-gray/45">{time}</span>}
          {hasDisplayContent && (
            <button
              onClick={handleCopy}
              className="text-[9px] tracking-[0.04em] text-warm-gray/40 active:text-sage-deep transition-colors"
            >
              {copied ? '已复制' : '复制'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
