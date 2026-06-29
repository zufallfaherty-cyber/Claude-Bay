import { useState, useEffect, useRef } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useAuth } from './contexts/AuthContext'
import { migrateLocalToSupabase } from './lib/migrate'
import BottomNav from './components/BottomNav'
import LoginPage from './pages/LoginPage'
import Dashboard from './pages/Dashboard'
import ChatPage from './pages/ChatPage'
import MoodDiary from './pages/MoodDiary'
import GamesPage from './pages/GamesPage'
import LudoGame from './pages/LudoGame'
import ProfilePage from './pages/ProfilePage'
import MemoryPage from './pages/MemoryPage'
import FilesPage from './pages/FilesPage'
import Settings from './pages/Settings'

// ── Page transition wrapper ──
const pageVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
}

function PageWrapper({ children }) {
  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ duration: 0.18, ease: 'easeInOut' }}
      className="h-full"
    >
      {children}
    </motion.div>
  )
}

// Daily quote — same pool as Dashboard, used here for fixed position
const quotes = [
  { text: '生活就像一盒巧克力，你永远不知道下一颗是什么味道。', film: '《阿甘正传》' },
  { text: '希望是美好的，也许是世间最美好的事物，美好的事物永不消逝。', film: '《肖申克的救赎》' },
  { text: '你得在向前走之前先放下过去。', film: '《狮子王》' },
  { text: '爱你的人不会离开你，即使有一百个理由让他离开，他也会找一个理由留下来。', film: '《恋恋笔记本》' },
  { text: '昨天是历史，明天是谜团，今天是礼物，这就是为什么它叫"当下"。', film: '《功夫熊猫》' },
  { text: '不是所有的鱼都生活在同一片海里。', film: '《挪威的森林》' },
  { text: '我所认为最深沉的爱，莫过于分开以后，我将自己活成了你的样子。', film: '《这个杀手不太冷》' },
  { text: '如果你有梦想，就要去捍卫它。', film: '《当幸福来敲门》' },
  { text: '有些人浅薄，有些人金玉其外而败絮其中。有天你会遇到一个彩虹般绚丽的人。', film: '《怦然心动》' },
  { text: '不管前方的路有多苦，只要走的方向正确，都比站在原地更接近幸福。', film: '《千与千寻》' },
  { text: '只有在梦想中，人才能真正自由。', film: '《死亡诗社》' },
  { text: '星星发亮是为了让每一个人有一天都能找到属于自己的星星。', film: '《小王子》' },
  { text: '人生不能像做菜，等所有材料准备好了才下锅。', film: '《饮食男女》' },
  { text: '有时候你只需要20秒的疯狂勇气，就会有很棒的事情发生。', film: '《我家买了动物园》' },
  { text: '我喜欢早上起来时一切都是未知的，不知会遇见什么人。', film: '《泰坦尼克号》' },
  { text: '我猜人生到头来就是不断放下，但最痛心的，是没有好好地道别。', film: '《少年派的奇幻漂流》' },
  { text: '因为太喜欢你了，所以好辛苦。', film: '《溺水小刀》' },
  { text: '世界这么大，人生这么长，总会有这么一个人，让你想要温柔地对待。', film: '《哈尔的移动城堡》' },
  { text: '我在这里，是因为你在这里。', film: '《你的名字》' },
  { text: '你是我温暖的手套，冰冷的啤酒，带着阳光味道的衬衫，日复一日的梦想。', film: '《恋爱的犀牛》' },
  { text: '我爱你，不是因为你是谁，而是因为和你在一起时我的样子。', film: '《剪刀手爱德华》' },
  { text: '最好的爱能唤醒灵魂，在我们心中播下火种。', film: '《恋恋笔记本》' },
  { text: '我们读诗写诗，并不是因为它们好玩，而是因为我们是人类的一分子。', film: '《死亡诗社》' },
  { text: '你不需要改变整个世界，只需要改变一个人的世界。', film: '《弱点》' },
  { text: '等到你发现时间是贼了，它早已偷光了你的选择。', film: '《岁月神偷》' },
  { text: '人们说，当你遇到一生所爱，时间会停止。这是真的。', film: '《大鱼》' },
  { text: '为了记住你的笑容，我拼命按下心中的快门。', film: '《美丽人生》' },
  { text: '不管怎样，明天又是新的一天。', film: '《乱世佳人》' },
  { text: '每个人都会死去，但不是每个人都真正活过。', film: '《勇敢的心》' },
  { text: '你要么作为英雄而死，要么活得足够久看到自己变成反派。', film: '《蝙蝠侠：黑暗骑士》' },
  { text: '爱是我们死去时唯一能带走的东西。', film: '《小妇人》' },
  { text: '你这一生，一定是为了和某个人相遇而来的。', film: '《天气之子》' },
  { text: '重要的东西，眼睛是看不见的。', film: '《小王子》' },
  { text: '只要记住你的名字，不管你在世界的哪个地方，我一定会去见你。', film: '《你的名字》' },
  { text: '如果我没有刀，我就不能保护你。如果我有刀，我就不能拥抱你。', film: '《剪刀手爱德华》' },
  { text: '梦里出现的人，醒来时就该去见他。', film: '《新桥恋人》' },
  { text: '你要相信，这个世界上一定有你的爱人。', film: '《大话西游》' },
  { text: '别担心，一切都会好起来的。', film: '《龙猫》' },
  { text: '人生就是一列开往坟墓的列车，路途上会有很多站。', film: '《千与千寻》' },
  { text: '没有你，良辰美景更与何人说。', film: '《天使爱美丽》' },
  { text: '如果我真的存在，那也是因为你需要我。', film: '《摆渡人》' },
  { text: '越是试着忘记，越是记得深刻。', film: '《天空之城》' },
  { text: '有时候，我会想起你，那是时间无法抹去的记忆。', film: '《情书》' },
  { text: '即使在没有月亮的时候，星星也一直在那里。', film: '《哈利波特》' },
  { text: '生命可以随心所欲，但不能随波逐流。', film: '《猫的报恩》' },
  { text: '无论你成为什么样的人，我都为你骄傲。', film: '《无敌破坏王》' },
  { text: '一个人有了爱，就有了软肋，但也同时有了铠甲。', film: '《这个杀手不太冷》' },
  { text: '世间所有的相遇，都是久别重逢。', film: '《一代宗师》' },
  { text: '时间很贪婪，有时候它会独自吞噬所有的细节。', film: '《追风筝的人》' },
  { text: '但愿我是，你的夏季。', film: '《死亡诗社》' },
  { text: '认识你，我才知道什么叫命中注定。', film: '《大鱼海棠》' },
  { text: '爱不是互相凝视，而是一起朝同一个方向看。', film: '《小王子》' },
  { text: '你是我的，半截的诗。', film: '《路边野餐》' },
  { text: '念念不忘，必有回响。', film: '《一代宗师》' },
  { text: '一期一会。', film: '《日日是好日》' },
  { text: '愿你在被打击时，记起你的珍贵，抵抗恶意。', film: '《无问西东》' },
  { text: '没有人的人生是完美的，但生命的每一刻都是美丽的。', film: '《美丽人生》' },
  { text: '爱情没有那么多借口，如果不能在一起，只是说明不够爱。', film: '《恋恋笔记本》' },
  { text: '你不必完美，我爱的就是这样的你。', film: '《BJ单身日记》' },
  { text: '不管你在哪里，我都会找到你。', film: '《魔兽》' },
  { text: '花开不是为了花落，而是为了灿烂。', film: '《萤火之森》' },
  { text: '从前慢，一生只够爱一个人。', film: '《从前慢》' },
  { text: '你出现的每一秒，都是我生命中的惊喜。', film: '《遇见你真好》' },
  { text: '和你在一起的每一天，都是我最珍贵的回忆。', film: '《暖暖内含光》' },
]
const getDailyQuote = () => quotes[Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 0)) / 86400000) % quotes.length]

function App() {
  const { user, loading, supabase } = useAuth()
  const [sessions, setSessions] = useState([])
  const [currentSessionId, setCurrentSessionId] = useState(null)
  const [migrated, setMigrated] = useState(false)
  const migrationRun = useRef(false)
  const location = useLocation()
  const isHome = location.pathname === '/'
  const quote = getDailyQuote()

  // Run migration once after auth
  useEffect(() => {
    if (user && supabase && !migrationRun.current) {
      migrationRun.current = true
      migrateLocalToSupabase(supabase).then(r => {
        console.log('Migration result:', r)
        setMigrated(true)
      })
    }
  }, [user, supabase])

  if (loading) {
    const claudeAvatar = localStorage.getItem('avatar_claude') || ''
    return (
      <div className="h-full flex items-center justify-center bg-cream">
        <div className="flex flex-col items-center gap-4">
          {claudeAvatar?.startsWith('data:') ? (
            <img src={claudeAvatar} alt="" className="w-16 h-16 rounded-full object-cover" />
          ) : (
            <div className="w-16 h-16 rounded-full bg-mint flex items-center justify-center text-2xl">{claudeAvatar || '🌿'}</div>
          )}
          <p className="text-sm text-warm-gray">waiting..</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <LoginPage />
  }

  return (
    <div className="h-full flex flex-col max-w-lg mx-auto bg-cream relative">
      <main className="flex-1 overflow-y-auto">
        <AnimatePresence>
          <Routes location={location} key={location.pathname}>
            <Route path="/" element={<PageWrapper><Dashboard /></PageWrapper>} />
            <Route
              path="/chat"
              element={
                <PageWrapper>
                  <ChatPage
                    currentSessionId={currentSessionId}
                    setCurrentSessionId={setCurrentSessionId}
                    sessions={sessions}
                    setSessions={setSessions}
                  />
                </PageWrapper>
              }
            />
            <Route path="/moods" element={<PageWrapper><MoodDiary /></PageWrapper>} />
            <Route path="/games" element={<PageWrapper><GamesPage /></PageWrapper>} />
            <Route path="/games/ludo" element={<PageWrapper><LudoGame /></PageWrapper>} />
            <Route path="/profile" element={<PageWrapper><ProfilePage /></PageWrapper>} />
            <Route path="/profile/memory" element={<PageWrapper><MemoryPage /></PageWrapper>} />
            <Route path="/profile/files" element={<PageWrapper><FilesPage /></PageWrapper>} />
            <Route path="/settings" element={<PageWrapper><Settings /></PageWrapper>} />
          </Routes>
        </AnimatePresence>
      </main>

      {/* Daily Quote — only on home, fixed above nav */}
      {isHome && (
        <div className="flex-shrink-0 px-8 pb-1 text-right pointer-events-none select-none">
          <p className="text-[13px] text-warm-gray/55 leading-relaxed tracking-[0.04em] italic">「{quote.text}」</p>
          <p className="text-[10px] text-warm-gray/35 mt-0.5 tracking-[0.08em]">{quote.film}</p>
        </div>
      )}

      <BottomNav />
    </div>
  )
}

export default App
