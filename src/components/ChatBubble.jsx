export default function ChatBubble({ role, content }) {
  const isUser = role === 'user'

  return (
    <div className={`flex gap-2.5 msg-enter ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      <div
        className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-sm ${
          isUser ? 'bg-rose-deep text-white' : 'bg-white text-xl border border-warm-line'
        }`}
      >
        {isUser ? '我' : '💕'}
      </div>

      {/* Bubble */}
      <div
        className={`max-w-[78%] px-4 py-2.5 text-[14px] leading-relaxed whitespace-pre-wrap break-words ${
          isUser
            ? 'bg-rose text-warm-dark rounded-2xl rounded-tr-md'
            : 'bg-white text-warm-dark rounded-2xl rounded-tl-md shadow-sm border border-warm-line/50'
        }`}
      >
        {content || (
          <span className="inline-flex gap-1 items-center">
            <span className="w-1.5 h-1.5 bg-rose-light rounded-full dot-bounce animate-[dotBounce_1.4s_infinite]" />
            <span className="w-1.5 h-1.5 bg-rose-light rounded-full dot-bounce animate-[dotBounce_1.4s_infinite]" />
            <span className="w-1.5 h-1.5 bg-rose-light rounded-full dot-bounce animate-[dotBounce_1.4s_infinite]" />
          </span>
        )}
      </div>
    </div>
  )
}
