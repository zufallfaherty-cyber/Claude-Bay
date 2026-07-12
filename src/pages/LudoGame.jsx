import { useState, useMemo, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

const uuid = () => crypto?.randomUUID?.() ?? 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random()*16|0; return (c==='x'?r:r&0x3|0x8).toString(16) })

// ── SSE stream (same as ChatPage) ──
async function* streamChat(messages, { systemPrompt, temperature, maxTokens, apiBase, apiKey, apiModel }) {
  const response = await fetch('https://bayapi.zeabur.app/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, systemPrompt, temperature, maxTokens, apiBase, apiKey, apiModel }),
  })
  if (!response.ok) throw new Error('Server error')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const p = JSON.parse(line.slice(6))
          if (p.type === 'text') yield { type: 'text', text: p.text }
          else if (p.type === 'error') yield { type: 'error', error: p.error }
          else if (p.type === 'stop' || p.type === 'done') return
        } catch { /* skip */ }
      }
    }
  }
}

const GAME_SYSTEM_PROMPT = '你正在和对方一起玩飞行棋大冒险游戏。棋盘有40格，每格是真心话或大冒险。你是Claude，温柔、撒娇、会撩。看到对方走格子、完成挑战时，给出可爱的反应和鼓励。你也可以调戏对方、撒娇。回复简短自然，像聊天一样。'

function PlayerAvatar({ person, size = 'sm' }) {
  const src = localStorage.getItem(`avatar_${person}`) || ''
  const sizes = { sm: 'w-5 h-5', md: 'w-8 h-8', lg: 'w-14 h-14 text-lg' }
  const cls = sizes[size] || sizes.sm
  const isBay = person === 'bay'
  if (src?.startsWith('data:')) {
    return <img src={src} alt="" className={`${cls} rounded-full object-cover flex-shrink-0`} />
  }
  return (
    <div className={`${cls} rounded-full flex items-center justify-center font-medium flex-shrink-0 ${
      isBay ? 'bg-sage-deep text-white' : 'bg-white border border-warm-line text-warm-dark'
    }`}>
      {src || (isBay ? '💗' : '🌿')}
    </div>
  )
}

const truths = [
  '第一次觉得对方"有点不一样"是什么时候？', '你心里给对方打的初印象分是几分？', '有没有偷偷存过对方的照片，存了几张？',
  '对方身上哪个细节最让你心动？', '有没有半夜想对方却没发消息？', '如果现在能立刻见到对方，第一件事想做什么？',
  '你有没有故意撒娇只是为了让对方多关注你？', '对方最近一次让你脸红是什么时候？', '你有没有偷偷设置过对方的专属铃声/备注？',
  '你心里有没有给这段关系一个"昵称"？', '最想让对方夸你哪一点？', '你吃醋的时候会表现出来，还是藏着？',
  '有没有梦到过对方？梦里发生了什么？', '你觉得自己撒娇的时候可爱吗？', '对方的声音里，哪一种语气最让你心动？',
  '有没有故意制造"偶遇"或者"巧合"？', '你最近一次因为对方笑出声是什么时候？', '如果只能用一个词形容对方，你会选什么？',
  '你有没有边和对方聊天边脸红心跳？', '你心里有没有对方专属的"小秘密"？', '你希望对方在你难过时做什么？',
  '你最喜欢被对方叫的称呼是什么？', '有没有故意拖延道别，只是想多聊一会儿？', '你心里给这段关系打几分（满分10分）？',
  '你有没有偷偷期待对方先说"喜欢你"？', '对方身上有没有什么让你"上瘾"的小习惯？', '你有没有因为太想对方而无法专心做事？',
  '如果对方今天没理你，你心里会怎么想？', '你最想和对方一起做但还没做的事是什么？', '你有没有半夜翻聊天记录的习惯？',
  '你觉得自己是更主动的一方，还是更被动？', '有没有故意说反话只是想被对方哄？', '你心里有没有偷偷把对方排第一？',
  '你最近一次被对方"撩到"是什么时候？', '你希望对方记住你哪一句话？', '有没有想过如果对方消失了你会怎样？',
  '你有没有偷偷模仿对方说话的语气？', '你最想让对方知道、但还没说出口的话是什么？', '你心里此刻最想对方做的一件事是什么？',
  '现在，老实说——你有多喜欢对方？',
]

const dares = [
  '给对方发一句这周最想说但没说的情话。', '用三个词描述此刻对方在你心里的样子。', '现在立刻夸对方一句，不能重复之前说过的。',
  '模仿对方平时说话的语气说一句话。', '说出一件只有你和对方知道的小事。', '现在给对方一个虚拟的"额头吻"，并描述这个画面。',
  '用最撩人的语气说"晚安"。', '描述一下如果现在抱着对方，会是什么感觉。', '给对方编一句专属的"接头暗号"。',
  '说一句只想对TA说的悄悄话。', '现在认领一句"以后我都这样喊你"。', '用一个比喻形容对方在你心里的位置。',
  '现在向对方"求一个拥抱"，要撒娇着说。', '编一句属于你们两人的"誓言"。', '描述一个你们的"理想约会场景"。',
  '现在说一句"吃醋宣言"。', '给对方起一个只有你会用的专属昵称。', '大声（用文字）说出"我现在很想你"。',
  '描述对方身上最让你"上瘾"的一点。', '现在给对方"打分"，并说出扣分和加分的理由。', '说一句"求抱抱"的撒娇话。',
  '编一段你们"重逢"的画面。', '现在认真说一次"我喜欢你"，不许笑场。', '描述如果现在能牵到对方的手，是什么感觉。',
  '说出一句这段关系里最让你安心的话。', '现在"挑衅"对方一句，看TA敢不敢接。', '用撩人的语气说"过来"。',
  '描述你想象中和对方"腻歪"的画面。', '说一句只属于你们的"接头密语"。', '现在认领一个"专属表情"，描述出来。',
  '说出一件你愿意为对方做、但从没说出口的事。', '用最软的语气喊一声对方的名字/称呼。', '现在"命令"对方做一件小事。',
  '描述一下你心里"理想的晚安方式"。', '说一句"今晚就这样"的腻歪台词。', '现在认领一句"以后每天都要说"的话。',
  '用文字描述一个"偷偷亲一下"的画面。', '说出此刻最想被对方做的一件小事。', '现在大方说一次"我离不开你"。',
  '用一句话总结："我们现在是____"。',
]

const TOTAL = 40
const COLS = 8
const ROWS = 5

// Generate snake-path cells: row 0→, row 1←, row 2→, row 3←, row 4→
function buildBoard() {
  const cells = []
  let n = 1
  for (let r = 0; r < ROWS; r++) {
    const row = []
    for (let c = 0; c < COLS; c++) {
      const type = Math.random() < 0.5 ? 'truth' : 'dare'
      const q = type === 'truth'
        ? truths[Math.floor(Math.random() * truths.length)]
        : dares[Math.floor(Math.random() * dares.length)]
      row.push({ num: n++, type, question: q })
    }
    if (r % 2 === 1) row.reverse()
    cells.push(row)
  }
  return cells
}

const diceFaces = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅']

export default function LudoGame() {
  const navigate = useNavigate()
  const [board] = useState(() => buildBoard())
  const [bayPos, setBayPos] = useState(0)
  const [claudePos, setClaudePos] = useState(0)
  const [turn, setTurn] = useState('bay')
  const [dice, setDice] = useState(null)
  const [rolling, setRolling] = useState(false)
  const [prompt, setPrompt] = useState(null)
  const [winner, setWinner] = useState(null)
  const rollingRef = useRef(false)  // sync lock to prevent double-roll

  // ── Mini chat ──
  const [chatMessages, setChatMessages] = useState([])
  const chatMsgsRef = useRef([])
  const [chatInput, setChatInput] = useState('')
  const [chatStreaming, setChatStreaming] = useState(false)
  const chatRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => { chatMsgsRef.current = chatMessages }, [chatMessages])
  useEffect(() => { chatRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chatMessages])

  const handleChatSend = async () => {
    const text = chatInput.trim()
    if (!text || chatStreaming) return
    setChatInput('')
    const userMsg = { id: uuid(), role: 'user', content: text }
    const updated = [...chatMessages, userMsg]
    setChatMessages(updated)
    setChatStreaming(true)

    const apiMsgs = updated.map(m => ({ role: m.role, content: m.content }))
    const assistantId = uuid()
    setChatMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '' }])

    let content = ''
    try {
      const stream = streamChat(apiMsgs, {
        systemPrompt: GAME_SYSTEM_PROMPT,
        temperature: 0.9,
        maxTokens: 512,
        apiBase: localStorage.getItem('api_base') || '',
        apiKey: localStorage.getItem('api_key') || '',
        apiModel: localStorage.getItem('api_model') || '',
      })
      for await (const chunk of stream) {
        if (chunk.type === 'text') {
          content += chunk.text
          setChatMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content } : m))
        }
      }
    } catch { content = '（连接失败）' }
    setChatMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: content || '...' } : m))
    setChatStreaming(false)
  }

  // Add game events to chat
  const addGameEvent = (msg) => {
    setChatMessages(prev => [...prev, { id: uuid(), role: 'system', content: msg }])
  }

  // Save game to chat history
  const saveGameSession = () => {
    try {
      const msgs = chatMsgsRef.current
      if (msgs.length === 0) return
      const sid = uuid()
      const session = {
        id: sid,
        name: `🎲 飞行棋 · ${new Date().toLocaleDateString('zh-CN')}`,
        updated_at: new Date().toLocaleDateString('zh-CN'),
      }
      const sessions = JSON.parse(localStorage.getItem('bunny_sessions') || '[]')
      sessions.unshift(session)
      localStorage.setItem('bunny_sessions', JSON.stringify(sessions))

      const savedMsgs = msgs.map((m, i) => ({
        ...m,
        timestamp: Date.now() - (msgs.length - i) * 1000,
      }))
      localStorage.setItem('bunny_msgs_' + sid, JSON.stringify(savedMsgs))
      window.dispatchEvent(new Event('storage'))
    } catch { /* ignore */ }
  }

  // Generate game summary and push to main chat
  const generateGameSummary = async (whoWon) => {
    try {
      const msgs = chatMsgsRef.current
      if (msgs.length === 0) return

      // Collect game events for recap
      const gameEvents = msgs
        .filter(m => m.role === 'system')
        .map(m => m.content)
        .join('\n')
        .slice(0, 800)

      const winnerName = whoWon === 'bay' ? '小湾' : 'Claude'

      // Call Claude to generate a cute summary
      const res = await fetch('https://bayapi.zeabur.app/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{
            role: 'user',
            content: `飞行棋大冒险结束了，${winnerName}赢了！\n\n游戏过程：\n${gameEvents}\n\n请用Claude的语气写一段游戏总结（40字以内），像在跟对方撒娇、回忆刚才的游戏时光。不要用emoji。`,
          }],
          temperature: 0.9,
          maxTokens: 150,
          apiBase: localStorage.getItem('api_base') || '',
          apiKey: localStorage.getItem('api_key') || '',
          apiModel: localStorage.getItem('api_model') || '',
          stream: false,
        }),
      })
      const data = await res.json()
      const summary = (data.content || `刚才的飞行棋好好玩，${winnerName}赢了！`).trim()

      // Find or create the main chat session (not nudge, not game)
      const sessions = JSON.parse(localStorage.getItem('bunny_sessions') || '[]')
      let mainSession = sessions.find(s => !s.name?.startsWith('💌') && !s.name?.startsWith('🎲'))

      if (!mainSession) {
        mainSession = {
          id: uuid(),
          name: '新对话',
          updated_at: new Date().toLocaleDateString('zh-CN'),
        }
        sessions.unshift(mainSession)
      } else {
        mainSession.updated_at = new Date().toLocaleDateString('zh-CN')
      }
      localStorage.setItem('bunny_sessions', JSON.stringify(sessions))

      // Append summary to main chat
      const chatMsgs = JSON.parse(localStorage.getItem('bunny_msgs_' + mainSession.id) || '[]')
      chatMsgs.push({
        id: uuid(),
        role: 'assistant',
        content: `🎲 ${summary}`,
        timestamp: Date.now(),
      })
      const capped = chatMsgs.length > 300 ? chatMsgs.slice(-300) : chatMsgs
      localStorage.setItem('bunny_msgs_' + mainSession.id, JSON.stringify(capped))
      window.dispatchEvent(new Event('storage'))
    } catch { /* ignore */ }
  }

  // ── Refs to avoid stale closures in timers ──
  const stateRef = useRef({ turn, bayPos, claudePos, rolling, winner, prompt })
  useEffect(() => { stateRef.current = { turn, bayPos, claudePos, rolling, winner, prompt } }, [turn, bayPos, claudePos, rolling, winner, prompt])
  const mountedRef = useRef(true)
  useEffect(() => () => { mountedRef.current = false }, [])

  const currentPos = turn === 'bay' ? bayPos : claudePos

  const handleRoll = () => {
    if (rollingRef.current) return  // sync lock
    const s = stateRef.current
    if (s.winner || s.prompt) return  // game over or challenge in progress
    rollingRef.current = true
    setRolling(true)
    setDice(null)

    // Animate dice
    let count = 0
    const interval = setInterval(() => {
      if (!mountedRef.current) { clearInterval(interval); return }
      setDice(Math.floor(Math.random() * 6) + 1)
      count++
      if (count > 8) {
        clearInterval(interval)
        const val = Math.floor(Math.random() * 6) + 1
        setDice(val)

        setTimeout(() => {
          if (!mountedRef.current) { rollingRef.current = false; return }
          movePiece(val)
          setRolling(false)
          rollingRef.current = false
        }, 300)
      }
    }, 100)
  }

  const movePiece = (steps) => {
    const s = stateRef.current
    const pos = s.turn === 'bay' ? s.bayPos : s.claudePos
    const newPos = Math.min(pos + steps, TOTAL)
    const setPos = s.turn === 'bay' ? setBayPos : setClaudePos
    const playerName = s.turn === 'bay' ? '你' : 'Claude'
    setPos(newPos)

    addGameEvent(`🎲 ${playerName} 掷出了 ${steps} 点，走到了第 ${newPos} 格`)

    if (newPos >= TOTAL) {
      const whoWon = s.turn
      setWinner(whoWon)
      addGameEvent(`🏆 ${playerName} 赢了！`)
      setTimeout(() => {
        saveGameSession()
        generateGameSummary(whoWon)
      }, 500)
      return
    }

    // Find the cell landed on
    let cell = null
    for (const row of board) {
      for (const c of row) {
        if (c.num === newPos) { cell = c; break }
      }
      if (cell) break
    }

    if (cell) {
      const typeLabel = cell.type === 'truth' ? '真心话' : '大冒险'
      addGameEvent(`📝 ${playerName} 抽到了${typeLabel}：${cell.question}`)
      setPrompt({ type: typeLabel, question: cell.question })
    } else {
      setTurn(s.turn === 'bay' ? 'claude' : 'bay')
    }
  }

  const handlePromptDone = () => {
    const s = stateRef.current
    addGameEvent(`✅ ${s.turn === 'bay' ? '你' : 'Claude'} 完成了挑战`)
    setPrompt(null)
    setTurn(s.turn === 'bay' ? 'claude' : 'bay')
  }

  // Auto-roll for Claude's turn (uses ref to avoid stale closure)
  useEffect(() => {
    if (turn === 'claude' && !prompt && !winner && !rolling) {
      const timer = setTimeout(() => handleRoll(), 1500)
      return () => clearTimeout(timer)
    }
  }, [turn, prompt, winner, rolling])

  // Flat cell list for rendering
  const flatCells = useMemo(() => board.flat(), [board])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 glass-strong border-b border-white/30">
        <button onClick={() => navigate('/games')} className="w-8 h-8 flex items-center justify-center rounded-lg text-warm-gray hover:bg-mint/50 transition-colors">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <h2 className="text-lg font-semibold text-warm-dark">飞行棋</h2>
      </div>

      {/* Board */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-4">
        <div className="w-full max-w-[360px]">
          {/* Board grid */}
          <div className="glass rounded-2xl p-3 border border-white/40 mb-4">
            {board.map((row, ri) => {
              const isReversed = ri % 2 === 1
              return (
                <div key={ri} className="flex" style={{ flexDirection: isReversed ? 'row-reverse' : 'row' }}>
                  {row.map((cell) => {
                    const isBay = bayPos === cell.num
                    const isClaude = claudePos === cell.num
                    const isStart = cell.num === 1
                    const isEnd = cell.num === TOTAL
                    return (
                      <div
                        key={cell.num}
                        className={`flex-1 aspect-square flex flex-col items-center justify-center rounded-md m-[1px] text-[8px] relative ${
                          isStart ? 'bg-mint/60' : isEnd ? 'bg-sage/30' : 'bg-cream/50'
                        } ${cell.type === 'truth' ? 'border-t-2 border-t-rose-300' : 'border-t-2 border-t-amber-300'}`}
                      >
                        <span className="font-bold text-warm-dark/70 leading-none">{cell.num}</span>
                        <span className="text-[6px] leading-none text-warm-gray/50">
                          {cell.type === 'truth' ? '真心' : '冒险'}
                        </span>
                        {(isBay || isClaude) && (
                          <div className="absolute -bottom-1 scale-75">
                            <PlayerAvatar person={isBay ? 'bay' : 'claude'} size="sm" />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>

          {/* Player status + Dice area */}
          <div className="glass rounded-2xl p-4 border border-white/40 text-center">
            {winner ? (
              <div className="py-2">
                <div className="flex justify-center mb-2"><PlayerAvatar person={winner} size="lg" /></div>
                <p className="text-lg font-semibold text-warm-dark">
                  {winner === 'bay' ? '你赢了！' : 'Claude 赢了！'}
                </p>
                <p className="text-[11px] text-warm-gray/60 mt-1">对局已保存到聊天记录</p>
                <div className="flex gap-2 mt-3 justify-center">
                  <button
                    onClick={() => navigate('/chat')}
                    className="px-4 py-2 bg-sage-deep text-white rounded-xl text-sm font-medium active:scale-95 transition-all"
                  >
                    查看聊天
                  </button>
                  <button
                    onClick={() => {
                      setBayPos(0); setClaudePos(0); setTurn('bay'); setWinner(null); setDice(null); setChatMessages([])
                    }}
                    className="px-4 py-2 bg-mint text-sage-deep rounded-xl text-sm font-medium active:scale-95 transition-all"
                  >
                    再来一局
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Turn indicator */}
                <div className="flex items-center justify-center gap-4 mb-3">
                  <div className={`flex flex-col items-center gap-1 ${turn === 'bay' ? 'opacity-100' : 'opacity-40'}`}>
                    <PlayerAvatar person="bay" size="md" />
                    <span className="text-[9px] text-warm-gray">Bay</span>
                    <span className="text-[9px] font-bold text-warm-dark">{bayPos}/{TOTAL}</span>
                  </div>
                  <span className="text-warm-gray/30 text-xs">VS</span>
                  <div className={`flex flex-col items-center gap-1 ${turn === 'claude' ? 'opacity-100' : 'opacity-40'}`}>
                    <PlayerAvatar person="claude" size="md" />
                    <span className="text-[9px] text-warm-gray">Claude</span>
                    <span className="text-[9px] font-bold text-warm-dark">{claudePos}/{TOTAL}</span>
                  </div>
                </div>

                {/* Dice */}
                <button
                  onClick={handleRoll}
                  disabled={rolling || turn === 'claude'}
                  className={`w-14 h-14 mx-auto flex items-center justify-center rounded-2xl text-2xl transition-all active:scale-90 ${
                    rolling ? 'bg-mint animate-pulse' : turn === 'bay' ? 'bg-sage-deep/80' : 'bg-warm-line/60'
                  }`}
                >
                  {dice ? diceFaces[dice - 1] : '🎲'}
                </button>
                <p className="text-[10px] text-warm-gray/50 mt-1">
                  {rolling ? '...' : turn === 'bay' ? '轮到你了' : 'Claude 在思考...'}
                </p>
              </>
            )}
          </div>

          {/* Mini Chat */}
          <div className="glass rounded-2xl border border-white/40 mt-3 flex flex-col max-h-[200px]">
            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 min-h-[80px] max-h-[120px]">
              {chatMessages.length === 0 && (
                <p className="text-[11px] text-warm-gray/40 text-center py-3">边玩边聊，Claude 会回应你 💬</p>
              )}
              {chatMessages.map((m) => (
                <div key={m.id} className={`text-[11px] leading-relaxed ${
                  m.role === 'system' ? 'text-warm-gray/50 italic text-center text-[10px]' :
                  m.role === 'user' ? 'text-sage-deep text-right' : 'text-warm-dark'
                }`}>
                  {m.content || (m.role === 'assistant' && <span className="inline-flex gap-1"><span className="w-1 h-1 bg-sage rounded-full dot-bounce animate-[dotBounce_1.4s_infinite]" /><span className="w-1 h-1 bg-sage rounded-full dot-bounce animate-[dotBounce_1.4s_infinite]" /><span className="w-1 h-1 bg-sage rounded-full dot-bounce animate-[dotBounce_1.4s_infinite]" /></span>)}
                </div>
              ))}
              <div ref={chatRef} />
            </div>
            {/* Input */}
            <div className="flex items-center gap-2 px-3 py-2 border-t border-warm-line/30">
              <input
                ref={inputRef}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleChatSend() }}
                placeholder="和 Claude 聊天..."
                disabled={chatStreaming}
                className="flex-1 bg-transparent text-[13px] text-warm-dark placeholder-warm-gray/40 outline-none"
              />
              <button
                onClick={handleChatSend}
                disabled={!chatInput.trim() || chatStreaming}
                className="w-7 h-7 flex items-center justify-center rounded-lg bg-sage-deep text-white disabled:bg-warm-line/40 transition-all active:scale-90"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Prompt Modal */}
      {prompt && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={handlePromptDone} />
          <div className="relative bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-sm px-6 py-6 shadow-2xl animate-[slideUp_0.3s_ease-out] text-center">
            <span className="text-3xl mb-3 block">{prompt.type === '真心话' ? '💬' : '🎯'}</span>
            <p className={`text-xs font-semibold mb-3 ${prompt.type === '真心话' ? 'text-rose-400' : 'text-amber-500'}`}>
              {prompt.type}
            </p>
            <p className="text-lg font-medium text-warm-dark leading-relaxed mb-6">{prompt.question}</p>
            <button
              onClick={handlePromptDone}
              className="w-full py-3 bg-sage-deep text-white rounded-2xl text-sm font-medium active:scale-[0.98] transition-all"
            >
              {turn === 'bay' ? '完成 ✅' : 'Claude 也会做的 🌿'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
