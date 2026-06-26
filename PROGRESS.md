# Claude&Bay 项目进度

## 最后更新：2026年6月25日

---

## 项目概况

手机端 AI 聊天 PWA，鼠尾草绿配色，Claude API 驱动。前端 Vercel + 后端 Zeabur + 记忆引擎 Ombre-Brain + Zeabur。

---

## 线上地址

| 服务 | 地址 | 部署 |
|------|------|------|
| 前端 | https://claude-bay-two.vercel.app | Vercel |
| 后端 | https://bayapi.zeabur.app | Zeabur（$3/月）|
| 记忆引擎 | https://baymemory.zeabur.app | Zeabur（$3/月）|
| API 中转 | https://api.jiushi.xin/v1 | |
| 定时触发 | https://cron-job.org | 每 2 小时调 /api/nudge |

---

## 已完成

### 界面
- ✅ 首页：动画入场 + 2 列卡片（情绪日记/小游戏/记忆库/文件库）+ 每日电影台词 + 计时器
- ✅ 「我的」页面：卡片式布局（记忆库/文件库/设置）
- ✅ 设置：自定义头像（本地上传图片）+ AI 性格 + Temperature + 上下文轮数 + API 配置（地址/密钥/模型）+ 消息通知开关
- ✅ 聊天页：批量生成模式（先生成再显示，不再流式跳动）+ 消息重新生成 + 代码隐藏（只显示文件下载按钮）+ 消息上限 300 条
- ✅ 情绪日记：双人日历版，只编辑自己，Claude 那侧只读，打开页面自动生成 Claude 当天心情
- ✅ 小游戏：飞行棋（40 格真心话/大冒险 + 迷你聊天 + Claude 1.5s 自动掷骰子）+ 占位卡
- ✅ 记忆库：Ombre-Brain 数据展示（加载/空/卡片三种状态）
- ✅ 文件库：2 列卡片网格 + 搜索 + 保存代码 + 下载文件到手机
- ✅ 底部导航栏：5 tab，聊天居中凸起
- ✅ 导航返回：统一 `navigate(-1)`，从哪里进去就退回哪里
- ✅ session 持久化：切走聊天页再回来对话不丢失

### 设计
- ✅ 鼠尾草绿配色（#7D9B76 → themeColor #7D9B76）
- ✅ Playfair Display 字体（标题斜体）+ Noto Serif SC（正文）
- ✅ 磨砂玻璃效果（glass / glass-strong）
- ✅ 页面过渡动画（framer-motion AnimatePresence）
- ✅ 首页卡片入场动画（fadeUp，全部同时）
- ✅ 自定义 App 图标（192+512 JPG）
- ✅ PWA manifest + Service Worker

### 后端
- ✅ Express 服务器，OpenAI 兼容格式
- ✅ SSE 流式 + 非流式模式
- ✅ 前端传 API 配置，后端优先用请求里的（支持设置页热切换）
- ✅ Ombre-Brain MCP 客户端：breath / hold / pulse

### AI 记忆系统
- ✅ hold：每 5 轮自动存 → 含个人信息关键词立刻存
- ✅ breath：每次发消息前注入最近记忆到 system prompt
- ✅ 记忆库页面展示所有记忆卡片
- ✅ 情绪标签 + 内容预览 + 时间戳

### AI 主动消息
- ✅ /api/nudge 端点：AI 判断 + 生成消息
- ✅ cron-job.org 每 2 小时触发
- ✅ 凌晨 1-5 点静默
- ✅ 消息自动存为聊天记录（💌 前缀）
- ✅ Web Push 推送通知（iOS 16.4+ PWA）

### 聊天核心修复
- ✅ 闭包陷阱：handleSend 全部改用 ref
- ✅ crypto.randomUUID 兼容（polyfill）
- ✅ 时间感知：每次发消息注入当前时间
- ✅ Vercel SPA 路由：vercel.json rewrites

---

## 待完成

### 数据库（下一步）
- [ ] Supabase 建表（sessions / messages / moods / settings）
- [ ] 前端接入 Supabase（目前用 localStorage）
- [ ] 数据迁移：localStorage → Supabase

### 功能增强
- [ ] 推送通知加角标
- [ ] 多设备数据同步（接 Supabase 后自然解决）
- [ ] Profile 统计动态化
- [ ] 更多小游戏

---

## 重要文件

| 文件 | 作用 |
|------|------|
| `src/pages/ChatPage.jsx` | 聊天核心逻辑（批量生成、session 持久化、记忆注入、时间感知） |
| `src/components/ChatBubble.jsx` | 气泡渲染（代码隐藏、文件下载、头像图片、重新生成） |
| `src/components/ChatInput.jsx` | 输入框（附件、语音、发送按钮） |
| `src/pages/Dashboard.jsx` | 首页（入场动画、功能卡片） |
| `src/pages/Settings.jsx` | 设置（头像上传、API 配置、消息通知开关） |
| `src/pages/MoodDiary.jsx` | 情绪日记（权限分离、AI 自动填 Claude 心情） |
| `src/pages/MemoryPage.jsx` | 记忆库（Ombre-Brain 数据展示） |
| `src/pages/LudoGame.jsx` | 飞行棋（棋盘、迷你聊天、Claude 自动掷骰子） |
| `src/pages/ProfilePage.jsx` | 我的页面（卡片式布局） |
| `src/App.jsx` | 路由 + 页面过渡动画 + PWA 推送订阅 |
| `src/index.css` | 全局样式（配色、动画、磨砂玻璃） |
| `server/index.js` | 后端核心（聊天、Ombre-Brain MCP、Nudge、推送、Claude 心情） |
| `public/sw.js` | Service Worker（缓存 + 推送通知处理） |
| `public/manifest.json` | PWA 配置 |
| `index.html` | 字体 + 主题色 + viewport |
| `vercel.json` | Vercel SPA 路由重写 |

---

## 账号信息

- **GitHub**: zufallfaherty-cyber / ZufallFaherty@gmail.com
- **Vercel**: https://claude-bay-two.vercel.app（GitHub 自动部署）
- **Zeabur 后端**: bayapi（GitHub 自动部署）
- **Zeabur 记忆**: baymemory（手动部署，Ombre-Brain）
- **API 中转站**: https://api.jiushi.xin/v1
- **API 密钥**: 在设置页配置（已硬编码兜底，2026.6.25 移除）
- **模型**: [按量]claude-opus-4-6
- **Google AI Studio Key**: （见 Zeabur baymemory 环境变量 OMBRE_EMBED_API_KEY）
- **VAPID 公钥**: BIJHn8BDhMVnhaisl29-OhL7mmx37cPNijwY8FF2i1mF7XT3aroVDcsHMeWBYeb8jFzzrQBHqREgLQRZH263EQY
- **VAPID 私钥**: bEkBaHXD0GJ53pSKjqd9qjXYRleHOPf3kd44pNO9gRw

---

## 日常工作流

1. **改前端代码** → `git push` → Vercel 自动部署
2. **改后端代码** → `git push` → Zeabur 自动部署（baiapi）
3. **改记忆引擎** → cd Ombre-Brain → git push → Zeabur 手动 Redeploy
4. **手机上测试** → 打开 https://claude-bay-two.vercel.app
5. **本地预览** → `cd bunny-chat && npx vite --host` → http://172.20.10.6:5174

## 明天要做

1. Supabase 数据库接入
2. 继续优化细节
3. 测试推送通知是否真的到达
