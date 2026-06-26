import { useState, useRef, useCallback } from 'react'

export default function ChatInput({ onSend, disabled }) {
  const [text, setText] = useState('')
  const [listening, setListening] = useState(false)
  const [attachments, setAttachments] = useState([])
  const textareaRef = useRef(null)
  const fileRef = useRef(null)
  const recognitionRef = useRef(null)

  const handleSubmit = useCallback(() => {
    const hasText = text.trim()
    const hasFiles = attachments.length > 0
    if ((!hasText && !hasFiles) || disabled) return
    onSend(hasText ? text.trim() : '', attachments)
    setText('')
    setAttachments([])
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [text, attachments, disabled, onSend])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleInput = (e) => {
    setText(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files || [])
    files.forEach((file) => {
      const reader = new FileReader()
      reader.onload = () => {
        setAttachments((prev) => [...prev, {
          name: file.name,
          type: file.type.startsWith('image/') ? 'image' : 'file',
          mime: file.type,
          data: reader.result,
        }])
      }
      reader.readAsDataURL(file)
    })
    if (fileRef.current) fileRef.current.value = ''
  }

  const removeAttachment = (i) => {
    setAttachments((prev) => prev.filter((_, idx) => idx !== i))
  }

  const toggleVoice = useCallback(() => {
    if (listening) {
      recognitionRef.current?.stop()
      setListening(false)
      return
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      alert('你的浏览器不支持语音输入 😢')
      return
    }
    const r = new SpeechRecognition()
    r.lang = 'zh-CN'
    r.interimResults = false
    r.continuous = false
    r.onresult = (e) => { const transcript = e.results[0][0].transcript; setText((prev) => prev + transcript) }
    r.onerror = () => setListening(false)
    r.onend = () => setListening(false)
    recognitionRef.current = r
    r.start()
    setListening(true)
  }, [listening])

  return (
    <div className="px-3 py-3 border-t border-warm-line/50">
      {/* Attachment previews */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2 px-1">
          {attachments.map((a, i) => (
            <div key={i} className="relative group">
              {a.type === 'image' ? (
                <img src={a.data} alt={a.name} className="w-16 h-16 object-cover rounded-xl border border-warm-line/50" />
              ) : (
                <div className="w-16 h-16 bg-white rounded-xl border border-warm-line/50 flex items-center justify-center text-2xl">📄</div>
              )}
              <button
                onClick={() => removeAttachment(i)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-warm-dark/70 text-white rounded-full flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100 transition-opacity"
              >✕</button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2 glass rounded-2xl px-3 py-2 shadow-sm border border-white/40">
        {/* File attachment */}
        <input
          ref={fileRef}
          type="file"
          multiple
          accept="image/*,.pdf,.txt,.json,.csv,.md"
          onChange={handleFileChange}
          className="hidden"
        />
        <button
          onClick={() => fileRef.current?.click()}
          className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-xl text-warm-gray hover:bg-mint/50 transition-colors active:scale-90"
          aria-label="添加附件"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
          </svg>
        </button>

        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder=""
          rows={1}
          disabled={disabled}
          className="flex-1 resize-none outline-none text-[15px] text-warm-dark placeholder-warm-gray py-1.5 max-h-[120px] bg-transparent"
        />

        {/* Voice */}
        <button
          onClick={toggleVoice}
          className={`flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-xl transition-all active:scale-90 ${
            listening ? 'bg-sage-deep text-white animate-pulse' : 'text-warm-gray hover:bg-mint/50'
          }`}
          aria-label="语音输入"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
        </button>

        {/* Send */}
        <button
          onClick={handleSubmit}
          disabled={(!text.trim() && attachments.length === 0) || disabled}
          className={`flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-xl transition-all active:scale-90 ${
            (text.trim() || attachments.length > 0) && !disabled
              ? 'bg-sage-deep text-white'
              : 'bg-warm-line/50 text-warm-gray cursor-not-allowed'
          }`}
          aria-label="发送"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </div>
  )
}
