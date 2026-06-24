export default function TypingIndicator() {
  return (
    <div className="flex items-center gap-3 px-1 msg-enter">
      <div className="w-8 h-8 rounded-full bg-white border border-warm-line flex items-center justify-center text-sm flex-shrink-0">
        💕
      </div>
      <div className="flex items-center gap-1.5 px-4 py-3 bg-white rounded-2xl rounded-tl-md shadow-sm border border-warm-line/50">
        <span className="w-2 h-2 bg-rose-light rounded-full dot-bounce animate-[dotBounce_1.4s_infinite]" />
        <span className="w-2 h-2 bg-rose-light rounded-full dot-bounce animate-[dotBounce_1.4s_infinite]" />
        <span className="w-2 h-2 bg-rose-light rounded-full dot-bounce animate-[dotBounce_1.4s_infinite]" />
      </div>
    </div>
  )
}
