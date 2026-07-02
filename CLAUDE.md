# Claude&Bay 项目速览

## 是什么
手机端 AI 聊天 PWA，鼠尾草绿配色，Claude API 驱动。"小湾"和"Claude"的恋人对话 App。

## 架构
```
前端 (React PWA)          后端 (Express)           记忆引擎 (Ombre-Brain)
Vercel                    Zeabur bayapi            Zeabur baymemory
claude-bay-two.vercel.app  bayapi.zeabur.app        baymemory.zeabur.app
```

## 数据流
```
ChatPage → /api/chat → Claude API → 返回
         → /api/save-chat → Supabase (service_role, 绕过 RLS)
         → /api/remember → Ombre-Brain hold (存记忆)
         
每次发消息前: /api/chat 内部调 Ombre-Brain breath → 注入 system prompt

Nudge: cron-job.org → /api/nudge → 判断是否发消息 → Pushover/Supabase
```

## 关键文件
| 文件 | 职责 |
|------|------|
| `src/pages/ChatPage.jsx` | 聊天核心：消息加载/发送/流式/持久化 |
| `src/contexts/AuthContext.jsx` | Supabase Auth 登录状态 |
| `src/lib/supabase.js` | 数据访问层（优先调服务端 API，降级直连 Supabase） |
| `src/App.jsx` | 路由、session 状态管理、迁移触发 |
| `server/index.js` | 后端：聊天 API、save-chat、nudge、记忆、Push、清理 |
| `src/pages/Dashboard.jsx` | 首页卡片 |
| `src/pages/Settings.jsx` | 设置页（头像、性格、API 配置） |
| `src/pages/MoodDiary.jsx` | 情绪日记 |
| `src/pages/LudoGame.jsx` | 飞行棋 |

## 数据存储
- **Supabase** (主): chat_sessions, chat_messages, user_settings, mood_entries, user_files
- **localStorage** (缓存): `bunny_msgs_<sid>` (300条), `bunny_sessions`, 各项设置
- **加载策略**: localStorage 优先 → Supabase 补拉（最多 500 条）

## Session 恢复逻辑 (ChatPage.jsx)
1. `currentSessionId` 为 null 时触发恢复
2. 过滤掉 `💌` 开头的 nudge session
3. 从 localStorage 找第一个有消息的非 nudge session
4. 后台从 Supabase 补充（以服务端/nudge 写入的消息）

## 关键常量
- `MAX_STORED_MSGS = 300` (localStorage)
- `MAX_LOADED_MSGS = 500` (Supabase 加载上限)
- `max_context_rounds` 默认 20 (AI 实际看到的上下文轮数)

## 历史坑
- ❌ ~~UUID 强转~~: save-chat 曾把短 ID 强转成新 UUID，导致 session 分裂。已移除
- ❌ ~~Nudge 独立建 session~~: 旧 nudge 每个消息建新 session（💌前缀），碎片化。已改为写入已有 session
- ❌ ~~RLS 缺 SELECT~~: 前端直连 Supabase 被拦。已通过服务端 API 绕过
- ❌ ~~Safari Redirect URLs 空~~: 导致登录失败
- ❌ ~~localStorage 空数组保存~~: 加了 backup 机制
- ❌ ~~JSON.parse 静默吞错~~: breath/nudge 返回非 JSON 格式

## 线上地址
| 服务 | URL |
|------|-----|
| 前端 | https://claude-bay-two.vercel.app |
| 后端 | https://bayapi.zeabur.app |
| 记忆 | https://baymemory.zeabur.app |
| API 中转 | https://api.jiushi.xin/v1 |
| 模型 | [按量]claude-opus-4-6 |

## 部署
- 前端: `git push` → Vercel 自动部署
- 后端: `git push` → Zeabur 自动部署 (bayapi)
- 记忆: cd Ombre-Brain → git push → Zeabur 手动 Redeploy

## Supabase
- 项目: `dfiztbhylghncyangdlm`
- 操作全部走 service_role (server/index.js)
- User ID: `9c3c44cd-d6fb-43f1-8577-c0ede9788dbc`
