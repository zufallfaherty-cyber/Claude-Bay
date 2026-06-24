import { useState, useRef, useCallback } from 'react'

export default function ChatInput({ onSend, disabled }) {
  const [text, setText] = useState('')
  const [listening, setListening] = useState(false)
  const textareaRef = useRef(null)
  const recognitionRef = useRef(null)

  const handleSubmit = useCallback(() => {
    if (!text.trim() || disabled) return
    onSend(text.trim())
    setText('')
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [text, disabled, onSend])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleInput = (e) => {
    setText(e.target.value)
    // Auto-resize
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
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

    r.onresult = (e) => {
      const transcript = e.results[0][0].transcript
      setText((prev) => prev + transcript)
    }

    r.onerror = () => setListening(false)
    r.onend = () => setListening(false)

    recognitionRef.current = r
    r.start()
    setListening(true)
  }, [listening])

  return (
    <div className="px-3 py-3 border-t border-warm-line bg-cream/80 backdrop-blur-sm">
      <div className="flex items-end gap-2 bg-white rounded-2xl px-3 py-2 shadow-sm border border-warm-line/50">
        {/* Voice Button */}
        <button
          onClick={toggleVoice}
          className={`flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-xl transition-all active:scale-90 ${
            listening
              ? 'bg-rose-deep text-white animate-pulse'
              : 'text-warm-gray hover:bg-rose-light/30'
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

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="说点什么吧..."
          rows={1}
          disabled={disabled}
          className="flex-1 resize-none outline-none text-[15px] text-warm-dark placeholder-warm-gray py-1.5 max-h-[120px] bg-transparent"
        />

        {/* Send Button */}
        <button
          onClick={handleSubmit}
          disabled={!text.trim() || disabled}
          className={`flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-xl transition-all active:scale-90 ${
            text.trim() && !disabled
              ? 'bg-rose-deep text-white heart-beat'
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
