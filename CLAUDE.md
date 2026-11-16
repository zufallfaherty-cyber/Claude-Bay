# Claude&Bay 项目速览

## 是什么
手机端 AI 聊天 PWA，鼠尾草绿配色，Claude API 驱动。"小湾"和"Claude"的恋人对话 App。

## 架构
```
前端 (React PWA)        后端 (Express, Docker)      记忆引擎 (Ombre-Brain, Docker)
Vercel                  腾讯云香港 124.156.142.6    同机容器 baymemory:8000
claude-bay-two.vercel.app   Caddy 反代 → 124-156-142-6.sslip.io
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
- `max_context_rounds` 默认 15 (AI 实际看到的上下文轮数；旧默认 20 已降级)

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
| 前端 | https://claude-bay-two.vercel.app （用户决定继续留 Vercel） |
| 后端 | https://124-156-142-6.sslip.io （腾讯云香港，Docker） |
| 记忆 | 同机容器 `baymemory:8000`（内网），Caddy 反代 |
| 服务器 | `ssh ubuntu@124.156.142.6`，`~/docker-compose.yml` |

## 部署
- 前端: `git push` → Vercel 自动部署
- 后端: scp / ssh 到服务器 `~/bayapi`，`docker compose up -d --build bayapi`（不走 Zeabur，Zeabur 已停运）
- 记忆: `~/Ombre-Brain`，同机 compose 重建

## 工作约定（用户明确要求）
1. **前端 AI 伴侣是男性，用「他」**；用户是小湾（女性，用「她」）。
2. **思考链（可见推理）用中文写**。
3. **先讨论方案，再动手**：改代码/架构/花钱先讲清方案和取舍，等用户拍板。工作日志整理除外，自己维护。

## 文档读取规则（省 token）
- `PROGRESS.md` = 速读版（工作约定 + 当前状态 + 待办 + 最近改动 + 日期索引），~8KB，**开工先读这个**。
- `PROGRESS-DETAIL.md` = 完整历史（~160KB）。**永远不要整读**，用 `grep -n 关键词 PROGRESS-DETAIL.md` 定位后只读那几十行。

## Supabase
- 项目: `dfiztbhylghncyangdlm`
- 操作全部走 service_role (server/index.js)
- User ID: `9c3c44cd-d6fb-43f1-8577-c0ede9788dbc`
