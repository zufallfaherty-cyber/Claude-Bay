# Claude&Bay 项目进度

## 最后更新：2026年6月24日

---

## 项目概况

一个手机端 AI 聊天 PWA，鼠尾草绿配色，Claude API 驱动。前端 Vercel + 后端 Render + 数据 Supabase。

---

## 技术栈

| 层 | 技术 | 部署 |
|---|------|------|
| 前端 | React 18 + Vite + Tailwind CSS v4 | Vercel |
| 后端 | Node.js + Express | Render（待部署） |
| 数据库 | Supabase PostgreSQL | Supabase 云（待配置） |
| AI | Claude Opus 4.6（通过中转站） | api.jiushi.xin |

---

## 已完成

### 页面
- ✅ **Dashboard 首页** — 计时器（在一起X天）+ 每日电影台词 + 功能卡片网格
- ✅ **聊天页** — SSE 流式回复 + 文字/图片/文件消息 + 消息持久化（localStorage）+ 上下文截断
- ✅ **情绪日记** — 双人日历版，iOS emoji 情绪选择
- ✅ **小游戏** — 每日一问（随机电影台词题）+ 飞行棋占位
- ✅ **记忆库** — 占位页，留好接口
- ✅ **文件库** — 2列卡片网格 + 搜索 + 保存代码按钮
- ✅ **设置** — 自定义头像（两人）+ AI 性格 + Temperature + 上下文轮数
- ✅ **我的页面** — 统计 + 记忆库/文件库/设置入口

### 设计
- ✅ 鼠尾草绿配色（#7D9B76 / #5C7A54 / #E8F0E3）
- ✅ Playfair Display 字体（标题斜体）+ Noto Serif SC（正文）
- ✅ 磨砂玻璃效果（glass / glass-strong）
- ✅ 底部导航栏（5 tab，聊天居中凸起）
- ✅ 气泡：半透明 + max-w-75% + break-words + 时间戳

### 后端
- ✅ Express 服务器，OpenAI 兼容格式
- ✅ SSE 流式代理到中转站
- ✅ 环境变量：API_KEY, API_BASE, MODEL

### 聊天核心修复
- ✅ 闭包陷阱：handleSend 全部改用 ref，useCallback 依赖 []
- ✅ 双重打字指示器：删除 ChatPage 里的 TypingIndicator，只留 ChatBubble 内置
- ✅ 气泡对齐：外层 items-start + 气泡区 flex flex-col + 头像 shrink-0
- ✅ 换行：break-words（不用 break-all）
- ✅ 上下文截断：超过 max_context_rounds 轮的消息不发给 API

---

## 待完成

### 部署（明天第一步）
- [ ] Render 部署后端：设环境变量 API_KEY / API_BASE / MODEL
- [ ] 前端指向 Render 后端 URL（需要改 streamChat 的 fetch 地址）
- [ ] UptimeRobot 防 Render 休眠

### 数据库
- [ ] Supabase 建表（sessions / messages / moods / settings）
- [ ] 前端接入 Supabase（目前用 localStorage）

### 功能优化
- [ ] 文件库接入聊天（保存代码到文件库）
- [ ] 记忆库接入（外置记忆系统）
- [ ] PWA 图标确认 + manifest 完善

---

## 重要文件

| 文件 | 作用 |
|------|------|
| `src/pages/ChatPage.jsx` | 聊天核心逻辑（handleSend、闭包修复、上下文截断） |
| `src/components/ChatBubble.jsx` | 气泡渲染（打字指示器、保存代码、附件） |
| `src/components/ChatInput.jsx` | 输入框（附件按钮、语音输入） |
| `src/components/BottomNav.jsx` | 底部导航栏 |
| `src/pages/Dashboard.jsx` | 首页（计时器、功能卡片） |
| `src/pages/Settings.jsx` | 设置（头像、性格、上下文轮数） |
| `src/pages/MoodDiary.jsx` | 情绪日记（日历双人版） |
| `src/pages/FilesPage.jsx` | 文件库 |
| `src/index.css` | 全局样式（配色、动画、磨砂玻璃） |
| `server/index.js` | 后端 SSE 代理 |
| `index.html` | 字体加载（Playfair Display + Noto Serif SC） |

---

## 账号信息

- **GitHub**: zufallfaherty-cyber / ZufallFaherty@gmail.com
- **Vercel**: https://claude-bay-two.vercel.app
- **Render**: 待部署
- **API 中转站**: https://api.jiushi.xin/v1
- **模型**: [按量]claude-opus-4-6

---

## 明天要做

1. 部署 Render 后端
2. 前端连上 Render 后端
3. 在手机上测试
4. 继续优化细节
