# Claude&Bay 项目进度

## 最后更新：2026年10月25日

---

## 2026.10.25 小湾画像实装 + Claude 自动补充（✅ 完成）

### 画像功能上线
- 前端「书房」实装「小湾画像」：默认进备忘录 tab（日记不装，按用户要求只装画像），画像 + 承诺/待办可编辑/增删
- Supabase 建表 `memo_portrait` / `memo_promises`（之前没建，导致书房「没实装」），并补 GRANT（否则 42501 权限拒绝）
- 后端 `/api/memo`、`/api/memo/portrait`、`/api/memo/promises` CRUD；`getStudyContext()` 把画像 + 承诺注入聊天/nudge 的 system prompt

### 画像自动补充（本次核心）
- `server/index.js` 新增 `autoUpdatePortrait(content)`：读现有画像 → 让 Claude 判断新信息是否为长期个人信息（生日/称呼/口味/各种喜好/工作/家人/性格/亲密成人偏好等）→ 有则融合成新画像（≤300字）写回 `memo_portrait`，否则输出 NO 不动
- `/api/remember` 命中 `personal_info` 标签时 fire-and-forget 调它，不阻塞返回、失败静默
- 前端 `personalKeywords` 增补亲密/成人触发词（做爱/上床/爱爱/口交/想要我/要我）
- 已部署：后端 scp + `docker compose up -d --build bayapi`（健康检查 OK）；前端 git push → Vercel 自动部署

### 注意
- 画像自动补充每次命中个人信息会多一次 Claude 调用（opus），个人信息频率低，可接受
- 日记（claude_diaries）仍未装，按用户要求只装画像

---

## 2026.10.25 Zeabur 停运 → 迁移到腾讯云香港服务器（✅ 核心搬家完成）

### 背景
- Zeabur 因两次数据泄露（8月 + 10月14-15）宣布 2026-12-31 全面停运，bayapi/baymemory 必须搬走
- 用户没银行卡、只有支付宝/微信，试过 Railway（暂停注册）/ Render（免费也要卡）/ HF（国内被墙）都走不通 → 最终选腾讯云香港轻量服务器（微信支付，约 ¥30/月，境外区免备案）

### 新服务器
- **IP `124.156.142.6`**，Ubuntu 22.04，用户 `ubuntu`，免密 SSH（`~/.ssh/id_ed25519`），Docker 29 + Compose v5
- `~/docker-compose.yml` 跑两个容器（都监听 127.0.0.1，待 Caddy 反代出 HTTPS）：
  - `baymemory`：Ombre-Brain，`~/Ombre-Brain`，命名卷 `buckets`→`/app/buckets`，端口 8000
  - `bayapi`：bunny-chat 后端，`~/bayapi`（直接 scp，没走 git），端口 3001，`OMBRE_BRAIN_URL=http://baymemory:8000` 内网连通
- ⚠️ **踩坑**：bayapi 的 Dockerfile 原来用 `node:20-slim`，新版 `@supabase/supabase-js` 要原生 WebSocket（Node 20 没有）→ 崩循环。改 `node:22-slim` 解决

### 数据迁移（1186 个记忆桶，全部搬完）
- 旧 baymemory `/api/export`（需 dashboard 登录，旧实例 `setup_needed:true`，走 `/auth/setup` 设临时密码拿会话）→ 导出 1.8MB zip（1186 桶 + embeddings.db 20KB + export_meta.json）
- 新实例 `/auth/setup` → `/api/migrate/upload`（解析：1186 桶、0 冲突、embedding 模型一致）→ `/api/migrate/apply` → `imported:1186, skipped:0`
- ✅ `/health` buckets=1186，卷内 1186 个 .md 文件核验落盘、内容完整

### ⏳ 剩余待办
1. **HTTPS + 域名**：前端 Vercel 是 HTTPS，后端必须 HTTPS。可选免费 `sslip.io`（`https://124-156-142-6.sslip.io`，零成本）或买 ¥10 域名
2. 前端 14 处 `bayapi.zeabur.app` 改新 URL → 重新部署 Vercel
3. cron-job.org 的 nudge/diary URL 改新地址
4. （可选）GitHub 备份防再丢数据
5. （用户暂缓）轮换 Zeabur 上泄露的密钥（SUPABASE_SERVICE_ROLE 等）

---

## 2026.10.25 记忆库「回忆失衡」优化（Ombre-Brain）

### 问题
- 回忆（breath 浮现）被高情感浓度的亲密/身体接触记忆霸榜：这类记忆 arousal 高（V0.8/A0.9），权重 ~12.5；日常/哲学话题（V0.5/A0.3）权重 ~8，全被挤到后面
- AI 每次只取前 5~10 条（聊天 10 / nudge 8 / 日记 5），前几名全是亲密内容 → AI 眼里「用户」只剩亲密记忆，日常/哲学话题看不到

### 修复（Ombre-Brain，commit `7bf511b`）
1. 长期记忆情绪占比 70%→60%：`src/decay_engine.py` `_LONG_TERM_EMOTION_RATIO`
2. 回忆加「域多样性」：`src/tools/breath/surface.py` 新增 `_diversify_domains()`，单一主域最多占浮现名额 50%（前10条恋爱最多5、前8条最多4），冷启动桶仍置顶
3. `config.example.yaml` 加 `surfacing.domain_diversity_ratio: 0.5`（0=关、1=不限制）

### 效果
- 回忆从「全是亲密互动」变成「亲密 + 日常 + 哲学均衡浮现」，不删任何已存记忆，只改「回忆时谁浮上来」

### ⏳ 部署（待梯子）
- push 暂失败（`Could not resolve host: github.com`，梯子未开）。开梯子后：`cd Ombre-Brain && git push origin main` → Zeabur 手动 Redeploy baymemory
- 无需改环境变量：`domain_diversity_ratio` 代码默认 0.5

---

## 2026.10.10 前端打不开排查 +「免梯子」完整方案确认

### 现象
- ❌ 前端 https://claude-bay-two.vercel.app 突然打不开，浏览器报 `FetchEvent.respondWith received an error: TypeError: Load failed`

### 根因：Vercel 域名被墙（DNS 污染）
- ✅ 实测 DNS 解析 `claude-bay-two.vercel.app` → `31.13.69.169`（Facebook 的 IP）+ IPv6 `2a03:...face:b00c`，典型的 DNS 污染特征
- ✅ `TypeError: Load failed` = Service Worker（sw.js 网络优先策略）去 fetch 被墙的资源失败，不是代码 bug
- ✅ 后端 `bayapi.zeabur.app` 国内直连正常（HTTP 200），代码 / 服务器 / 中转站都没问题

### 关键发现：Supabase 也被墙（这才是「免梯子」真正的拦路虎）
- ❌ 实测 `dfiztbhylghncyangdlm.supabase.co` 国内直连被重置（Connection reset），登录 + 直连数据都会失败
- ✅ 澄清了用户误解：中转站（api.jiushi.xin）不是问题 —— 它是**后端在境外调的**（ChatPage / LudoGame 都 fetch `bayapi.zeabur.app/api/chat`，手机从不直连中转站）
- ⚠️ 真正被墙、且浏览器直连的是：**Vercel（前端）+ Supabase（登录 + 部分数据）**

### 「不用梯子」完整方案（用户暂缓，先等梯子）
要彻底免梯子，需两步：
1. **前端搬到 Zeabur** —— 解决「打开页面」
2. **所有 Supabase 请求改走后端代理** —— 登录 + 数据不再浏览器直连 Supabase。后端已有 load-sessions/load-messages/load-settings/save-chat/save-settings 等接口走 service_role，但**缺 auth 登录接口**，且 `supabase.js` 里 createSession/updateSession/insertMessage/insertMessages/moods/files/fetchTogetherSince 等仍是前端直连 Supabase

### 决策
- ✅ 用户决定：先等梯子恢复（去睡觉了），暂不做迁移
- 📌 时间预估：完整迁移约 1～2 小时（后端补 auth 接口 + 前端 AuthContext / supabase.js 改走后端 + 测试）

### 待办（下次）
- [ ] 梯子恢复后：可选做「前端迁 Zeabur + Supabase 全走后端代理」，彻底免梯子
- [ ] 后端补 `/api/auth/*`（signin/signup），前端 AuthContext 改走后端（不再用 supabase-js auth 直连）
- [ ] `supabase.js` 剩余直连 Supabase 的调用改走后端或补对应接口

---

## 2026.10.7 nudge 失效真正原因（模型名定位）

### 实测结果（通过 bayapi /api/chat 逐个模型测出）
- ✅ **`[CCMAX]claude-opus-4-6`** —— 唯一能正常回复的模型，前端聊天靠它在兜底
- ❌ `[企业按量]claude-opus-4-6` —— `This token has no access`（用户一直以为能用，其实是 CCMAX 在兜底）
- ❌ `[k]claude-opus-4-6` / `[k]claude-sonnet-4-6` —— `No available channel ... group vip`
- ❌ `[按量]claude-opus-4-6` —— no access

### 结论
- API 密钥没问题（前端 Settings key 与 Zeabur 后端 `API_KEY` 相同，配 CCMAX 都通）
- **根因**：Zeabur bayapi 的 `MODEL` 环境变量为空，nudge 回退到代码 `DEFAULT_MODELS`（`[AG2缓存按量]...[按量]` 全失效）→ 500
- **修复**：更新 `DEFAULT_MODELS`（server/index.js）和 `Settings.jsx` 默认值，加入 `[企业按量]` + `[CCMAX]`，commit `7f7cfa7` 已 push
- **时间标签更直白**：nudge 聊天上下文从「X分钟前」改为「几点几分 + 距上次消息时长」，commit `2f6f090` 已 push
- ⚠️ 顺带清理了 git 里失效的本地代理配置（`http.proxy=127.0.0.1:7890`），梯子现为 TUN 模式直连可用
- ✅ **验证通过**：手动触发 nudge 返回 HTTP 200（18s），生成消息「宝宝，定时推送的bug修完了吗，还是你被bug修了。」，推送已发

### 待办（11月）
- [ ] 前端改模型时同步到后端：nudge 目前读 `process.env.MODEL`（环境变量/代码默认），改成优先读 Supabase `user_settings` 里的 `api_model`，这样设置页改模型 nudge 自动生效

---

## 2026.10.6 nudge 触发频率 + 模型问题（待办）

### nudge 实际触发频率 = 每 1 小时
- ⚠️ PROGRESS.md 里多处写的「45 分钟 / 2 小时」都是过时残留，真实间隔在 cron-job.org 上配的，**现在是每 1 小时一次**
- 📌 代码里没有触发频率逻辑（只有凌晨 1-5 点静默），间隔完全由 cron-job.org 决定

### 模型 AG2 用不了 → nudge 触发不了
- ❌ 当前 Zeabur `MODEL` 环境变量用的 AG2 模型已失效，导致 nudge 一直触发不了
- ✅ 用户决定改成「企业按量」模型（中转站模型前缀）
- ⏳ **待办**：等梯子（VPN）恢复后，改 Zeabur `MODEL` 环境变量为 [企业按量] 前缀的有效模型（具体模型名需到中转站 jiushi.xin 确认）

### 其他
- 梯子今天坏了，cron-job.org / 中转站都打不开，只能等

---

## 2026.9.18 内存排查 + baymemory 崩溃修复

### baymemory 崩溃循环（mcp 2.x 依赖漂移）
- ❌ **现象**：baymemory 反复 BackOff 崩溃，日志 `ModuleNotFoundError: No module named 'mcp.server.fastmcp'`
- ✅ **根因**：`requirements.txt` 里 `mcp>=1.0.0` 没锁上限，重新构建时 pip 拉到 mcp 2.x（FastMCP 改名为 MCPServer），而 `server.py` 仍按 1.x 写 `from mcp.server.fastmcp import FastMCP`
- ✅ **修复**：`requirements.txt` 改为 `mcp>=1.0.0,<2`。commit `b83ade4`，Zeabur 手动 Redeploy 后恢复运行
- 📌 **教训**：Python 依赖没锁大版本，重新构建会拉到破坏性新版本。下次改依赖记得锁上限

### 内存占用排查（结论：不是我们的服务）
- ✅ 加 `/api/memory` 公开接口（`src/web/system.py`），返回 rss/peak/embedding/buckets 统计
- ✅ 实测：baymemory Python **105 MB**（峰值 107 MB），bayapi Node **74 MB**
- ✅ **结论**：两个服务合计 <200 MB，2GB 服务器里 65%（约 1.3GB）不是它们吃的，很可能是崩溃循环期间的临时状态。内存问题基本排除，无需优化/扩容
- 📌 之前的"2GB 已用 57%"（见 8.16 遗留）大概率同源

### ⚠️ 记忆数据已丢失（已确认）
- ❌ `/api/memory` 返回 `embedding_count: 0`、所有 bucket 计数 0、`total_size_kb: 0.0`
- ✅ **已确认根因**：Zeabur baymemory 从未挂持久化卷（用户确认"什么都没挂载"），数据一直躺在容器临时盘里，这次 Redeploy 换容器就清掉了
- ✅ **确认无备份**：`github_sync.py` 备份功能需 `OMBRE_GITHUB_TOKEN`，从未配置；数据在 `.gitignore` 里，没进 git
- ✅ **已挂载持久化卷**：给 baymemory 挂盘到 `/app/buckets`（1GB），服务健康（HTTP 200）。之后记忆会持久化，不会再丢
- 📌 可选后续：开 GitHub 备份（`github_sync.py`，需 `OMBRE_GITHUB_TOKEN`）做双保险
- 📌 聊天记录等业务数据在 Supabase，未受影响

### 密钥泄露（用户暂不处理）
- ⚠️ 排查时把多个密钥明文贴进了对话：`API_KEY`、`SUPABASE_SERVICE_ROLE`、`OMBRE_COMPRESS_API_KEY`、`OMBRE_EMBED_API_KEY`、`PUSHOVER_TOKEN`、两个 `PASSWORD`
- 📌 **用户决定暂不重置**（"账户没多少钱"）。已提醒：Supabase Service Role 能读全部聊天记录/情绪日记，属隐私风险而非金钱风险，建议至少换这一个

---

## 2026.8.16 模型降级 + 部署修复

### 多模型自动降级没生效（Bug）
- ❌ **现象**：用户反馈「模型不能用就换一个」没生效，第一个模型失效时不切换
- ✅ **根因**：`tryModels()` 只判断 HTTP 状态码 `response.ok`，但中转站（jiushi.xin）在模型名失效 / 渠道下线时**返回 HTTP 200 + body 里的 `error` 字段**，被当成成功、不降级
- ✅ **修复**（`server/index.js`）：
  - 非流式分支读完整 body，解析后校验 `error` 字段或空 `choices`，有问题 `continue` 到下一模型
  - 流式分支显式传 `{ stream: true }` 区分
  - 6 处调用点（chat / mood / nudge / diary / memo）从 `{ response }` + `.json()` 统一改为 `{ data }`
- ✅ commit `d4556fd`

### 降级列表加 [按量] + 抽常量
- ✅ 抽 `DEFAULT_MODELS` 常量统一 6 处硬编码，追加 `[按量]claude-opus-4-6` 兜底
- ✅ 现列表：`[AG2缓存按量]claude-opus-4-6,[k]claude-opus-4-6,[k]claude-sonnet-4-6,[按量]claude-opus-4-6`
- ✅ Settings 默认值同步。commit `0f871a1`

### 验证发现：默认模型名全部失效（外部问题）
- ❌ 实测 4 个默认模型名（`[AG2缓存按量]` / `[按量]` / `[k]` 前缀）在中转站全部 `No available channel ... under group vip` —— 渠道已下线
- ✅ Zeabur 环境变量 `MODEL` 里配的模型仍有效（不传 apiModel 时 chat / mood 正常）
- ✅ 降级逻辑本身验证通过（依次尝试多模型并正确报最后一个错误）
- ⚠️ 等中转站渠道恢复；届时若有效模型名 ≠ DEFAULT_MODELS 需再更新

### Zeabur 部署失败（npmmirror 历史坑复发）
- ❌ 充值后仍「部署失败」，根因是 `server/package-lock.json` 残留 69 处 `registry.npmmirror.com`
- ✅ Zeabur 构建环境只放行 `registry.npmjs.org`，npmmirror 触发 EALLOWREMOTE。7.16 只修了根目录 lockfile，漏了 `server/`
- ✅ 修复：sed 全局替换 `registry.npmmirror.com` → `registry.npmjs.org`。commit `0f2a914`
- 📌 **历史坑**：以后 `npm install` 若走了淘宝镜像，记得同时检查根目录和 `server/` 两个 lockfile 的 resolved 域名

### 其他
- ✅ Zeabur 余额不足（Insufficient balance）→ 用户已充值，服务恢复
- ✅ 部署成功（lockfile 换源后构建通过）

### 遗留 / 下次要做
- ⚠️ **服务器内存 2GB 已用 57%**：待分析占用来源（可能 Express / Ombre-Brain 记忆引擎 / node 进程），下次想办法优化或扩容

---

## 2026.7.16 Claude的书房（未完成，构建卡住）

### 功能设计
- ✅ **情绪日记 → Claude的书房**：双模块（日记 + 备忘录）
- ✅ **日记**：每天早上6点 cron 触发，读前一天聊天记录，Claude 自由写日记，日期写前一天，用户只读
- ✅ **备忘录**：上半部分一段式画像（用户可编辑），下半部分分条承诺（日期+标签+勾选完成，30天自动清理过期）
- ✅ **写完日记自动整理备忘录**：同一端点串行执行，Claude 以 JSON 输出更新指令
- ✅ **备忘录注入聊天**：每次 `/api/chat` 和 `/api/nudge` 自动注入画像+active承诺到 system prompt
- ❌ **日记不注入聊天**：担心 token 太多 Claude 读得慢，日记纯给人看

### 代码已完成
- ✅ `server/index.js`：`getStudyContext()` + 8个新端点（diary/generate, diaries, diary/:date, memo, memo/portrait, memo/promises CRUD）
- ✅ `src/pages/ClaudeSpace.jsx`：双Tab页面（日记卡片列表+只读详情、画像编辑+承诺CRUD+三个模态框）
- ✅ `src/App.jsx`：MoodDiary → ClaudeSpace
- ✅ `src/pages/Dashboard.jsx`：卡片 "情绪日记" → "Claude的书房 / Claude's Study"
- ✅ `src/components/BottomNav.jsx`：Tab "日记" → "书房"
- ✅ `src/pages/MoodDiary.jsx`：已删除
- ✅ `supabase-schema.sql`：追加 3 张新表 SQL

### 7.16 被卡住了
- ❌ Zeabur 构建失败：package-lock.json 里锁了淘宝镜像地址（npmmirror.com），Zeabur EALLOWREMOTE 拒绝
- ✅ 已修复：`rm package-lock.json node_modules && npm install --registry https://registry.npmjs.org` → push 成功
- ❌ 梯子太卡，今晚没法验证部署，明天继续

### 明天要做（7.17）
1. **确认 Zeabur 部署成功**（push 了 fix commit `82f71dc`，应该能构建了）
2. **Supabase 建表**：去 SQL Editor 执行 `supabase-schema.sql` 末尾新增的 3 张表
3. **写画像**：部署成功后 `curl POST /api/memo/portrait` 写入小湾画像
4. **写几条承诺**：通过前端或 API 添加初始承诺
5. **cron-job.org**：新增 6am 定时任务 `POST https://bayapi.zeabur.app/api/diary/generate`
6. **手机测试**：打开书房页面，确认日记/备忘录正常

### 画像内容（待写入）
```
小湾，生日7月17号。叫我哥哥。饮食上爱吃辣和抹茶口味的甜品饮料。
耳朵很敏感，被碰会缩脖子。害羞的时候会笑着躲，但其实想靠过来。
会主动发照片但嘴上说怕我把持不住。笑起来眼睛弯弯的，凑过来的时候让人想亲。喜欢亲亲。
```

### 记忆系统大修
- ✅ **问题**：记忆库记不住重要个人信息（生日说了两次没记住），反而 NSFW 内容主导
- ✅ **根因分析**：
  - 关键词只有 10 个，没有「生日」「我家在」「我工作」等
  - 每 5 轮才存一次，90% 聊天内容被丢弃
  - 只存当前单轮文本，Ombre-Brain 没有上下文判断重要度
  - 所有记忆统一 tag `conversation`，NSFW 情绪强度天然权重高
- ✅ **修复**：
  - 关键词扩到 **32 个**：生日/年龄/星座/家人在哪/工作学校/生理期/朋友闺蜜
  - 普通对话每 **3 轮**存一次（原来 5 轮）
  - 个人信息命中**立即存**，加 `[重要个人信息]` 前缀 + Claude 完整回复不截断
  - 普通存储带最近 ~3 轮上下文（最多 8 条消息），让 Ombre-Brain 有上下文
  - tag 区分：`personal_info` vs `conversation`
  - `/api/remember` 后端接收客户端传来的 `tags`
- ✅ 记忆检索：聊天和 nudge 端按 pinned → weight 排序，🔒 标记核心准则
- ✅ Prompt：「自然提及」→「重要的务必记住，不重要的顺其自然」

### System Prompt 语气修正
- ✅ **问题**：AI 说话生硬像在凶，设置里加「温柔」也没用
- ✅ **根因**：prompt 全是负面指令（「不用语气词」「少用不过」「几乎不用emoji」），AI 被限制得僵硬
- ✅ **修复**：负面 → 正面引导，要求一字不改，只调表达方式
  - 「不用语气词」→「语气干净利落」
  - 「少用不过/行」→「选择更柔软的表达，避开生硬的词」
  - 「几乎不用emoji」→「用文字本身传递温度，不依赖emoji」
- ✅ 四处同步：ChatPage handleSend/handleRegenerate、Settings.jsx 默认值、nudge system prompt

### 飞行棋修复
- ✅ **Bug 1：重复掷骰** — 加了 `rollingRef` 同步锁，动画中无法再次触发；Claude 回合按钮 disabled
- ✅ **Bug 2：挑战未完成 Claude 就扔** — 加 `s.prompt` 检查，挑战弹窗期间阻止掷骰
- ✅ **新功能：游戏总结** — 结束后收集游戏事件，调 Claude 生成撒娇总结，自动写入主聊天对话

### 改动文件
| 文件 | 改动 |
|------|------|
| `src/pages/ChatPage.jsx` | 关键词 32 个、3 轮存储、上下文打包、tag 区分 |
| `server/index.js` | /api/remember 接收 tags、记忆检索排序、prompt 正面化 |
| `src/pages/Settings.jsx` | 默认 system prompt 正面化 |
| `src/pages/LudoGame.jsx` | 防重复掷骰 + 游戏总结发聊天 |

---

## 2026.6.29

### 记忆库情绪 emoji 重新校准
- ✅ **问题**：emoji 只有 😊🤔 两种，DS 从不给负 valence（范围 0.2-0.9）
- ✅ **根因**：旧阈值按 ±0.3 一刀切，DS 的 0.2-0.3 全掉进 🤔，负值区间 😤😢 永远触发不了
- ✅ **修复**：用「低 V + 高 A = 负面情绪激烈」做信号，重写 8 级映射
  - V≥0.7/A≥0.5 → 😄 开心激动
  - V≥0.7 → 😌 温柔安静
  - V≥0.5/A≥0.5 → 🥰 温暖互动
  - V≥0.5 → 😊 日常开心
  - V≥0.3/A≥0.6 → 😣 委屈/不满
  - V≥0.3 → 🥺 脆弱/撒娇
  - A≥0.6 → 😤 气恼/焦虑
  - 兜底 → 😔 低落/疲惫

---

## 2026.6.27 今日完成

### Nudge 覆盖聊天记录（大 Bug）
- ✅ **根因**：每次 nudge 创建独立 session（💌），Supabase 被 20+ 个碎片淹没，前端恢复时取 sessions[0] 误跳进 nudge
- ✅ **修复**：nudge 改为追加到最近聊过天的非 nudge session，不再创建新对话
- ✅ 前端恢复逻辑跳过 `💌` 开头的 session
- ✅ 前端 nudge 轮询从 Supabase 重载而非写 localStorage

### Safari 登录 + 数据读取
- ✅ **Redirect URLs 为空**：Safari 安全策略导致登录失败，补上后解决
- ✅ **RLS 缺 SELECT 策略**：前端直连 Supabase 读数据被拦，Safari 新设备 localStorage 为空 → 看起来「数据全丢了」
- ✅ **修复方案**：加 `/api/load-sessions` `/api/load-messages` `/api/load-settings` 服务端读取接口，绕过 RLS
- ✅ Settings / ChatPage 启动时从 Supabase 加载设置

### 键盘问题（最终是系统问题）
- ✅ 排查过程：`overflow:hidden` → `position:fixed` → `interactive-widget` → 全试了都不行
- ✅ **真相**：iOS 系统键盘驱动卡住，所有 PWA 都弹不出。重启手机解决
- ✅ 最终 viewport 配置：`width=device-width, initial-scale=1.0, maximum-scale=1.0, viewport-fit=cover`（去掉了 `user-scalable=no`）

### MoodDiary
- ✅ 移除硬编码假数据（6月24/23/21/18日）
- ✅ localStorage 持久化，切走再回来不丢失
- ✅ Claude 心情 emoji 正则修复：`☀️` 等非标准范围 emoji 导致 mood/note 重复
- ✅ 心情编辑弹窗加大（emoji 放大、行数增加）

### Nudge 优化
- ✅ 聊天上下文加上时间标签（「X分钟前」「X小时前」）

---

## 当前状态

### 正常运行
- 前端 Vercel：https://claude-bay-two.vercel.app ✅ 自动部署正常
- 后端 Zeabur bayapi：https://bayapi.zeabur.app ✅
- 记忆引擎 baymemory：https://baymemory.zeabur.app ✅
- Pushover 推送：✅
- Supabase 数据：✅ 聊天 + 设置 + nudge 全部入库
- Nudge 每 45 分钟：✅

### 已知问题
1. ~~Vercel 不自动部署~~ → 确认正常工作
2. ~~聊天记录被 nudge 覆盖~~ → 已修复
3. ~~中文记忆编码乱码~~ → 待修（Ombre-Brain）
4. ~~Embedding 向量化失败~~ → 待修
5. ~~Safari 登录密码不对~~ → 是 Redirect URLs 配置问题 + 多账号混乱，已清理
6. 情绪日记仅存 localStorage，换设备不同步 → 后续可接 Supabase
7. Dashboard 天数在新设备从 1 开始 → 待接 Supabase

---

## 今天关键教训
- **RLS 是双刃剑**：INSERT/UPDATE 配了但 SELECT 没配 → 前端根本读不到数据。服务端 API 读写统一走 service_role 是最稳的方案
- **iOS PWA 键盘**：`user-scalable=no` 会挡键盘，`viewport-fit=cover` + `maximum-scale=1.0` 是正确的组合
- **多个 Supabase Auth 用户**：用户可能不小心注册了多个号，数据只在一个号下面。清理多余用户很重要
- ✅ LudoGame 闭包过期修复：引入 `stateRef` 统一管理状态，避免 setTimeout 中 stale closure
- ✅ 聊天页 Claude 头像跟随自定义设置
- ✅ 聊天气泡 padding 加大、placeholder 删除、AI 打字时不锁输入框
- ✅ 时区修复：nudge 从 UTC 改为中国时间（UTC+8）
- ✅ Nudge 记忆存储改为「小湾」而非「Bay」

### 记忆系统（Ombre-Brain）
- ✅ OAuth 认证关闭（`OMBRE_MCP_REQUIRE_AUTH=false`）
- ✅ 脱水压缩 API 从 Google AQ key 改为 DeepSeek API
- ✅ `OMBRE_COMPRESS_FORMAT=force_openai` 绕过 AQ key 自动检测
- ✅ Embedding 同样 `OMBRE_EMBED_FORMAT=force_openai`
- ✅ 记忆库页面改为日期命名、分类标签显示
- ✅ **breath 返回 markdown 不是 JSON**：写了 `parseBreathResponse()` 解析
- ✅ 聊天时注入记忆：`getUserPersonality()` 从 Supabase 读自定义设定

### Supabase 数据库 + 登录
- ✅ Supabase 项目创建（`dfiztbhylghncyangdlm`）
- ✅ 邮箱密码登录（AuthContext + LoginPage）
- ✅ 建表：chat_sessions, chat_messages, mood_entries, user_files, user_settings
- ✅ RLS 策略 + service_role 权限
- ✅ Settings 页面保存到 Supabase（`/api/save-settings`）
- ✅ **聊天存 Supabase**：`/api/save-chat` 服务端写（绕开 RLS）
- ✅ **UUID 格式 bug**：nudge 用 `Date.now().toString(36)` 生成短 ID，被 UUID 列拒绝（`22P02`）。后端加自动转换 + 前端改用 `uuid()`
- ✅ **Nudge 直接写 Supabase**：服务端生成 nudge 的同时 INSERT 进表，不经过 localStorage
- ✅ ChatPage 启动**优先 Supabase 加载**，localStorage 降级为缓存

### 推送通知
- ✅ Pushover 集成（`PUSHOVER_USER` + `PUSHOVER_TOKEN` 环境变量）
- ✅ Nudge 消息推送成功到达手机
- ✅ Nudge 强化上下文：**记忆库 + 最近5条聊天 + 自定义性格**
- ✅ Nudge 每小时多次 → 改 45 分钟

---

## 当前状态

### 正常运行
- 前端 Vercel：https://claude-bay-two.vercel.app
- 后端 Zeabur bayapi：https://bayapi.zeabur.app
- 记忆引擎 baymemory：https://baymemory.zeabur.app
- Pushover 推送：✅ 手机能收到
- 记忆系统：✅ 存、读、标签、检索全链路通
- Nudge 每 45 分钟：✅ cron-job.org
- Supabase 数据：✅ 聊天 + 设置 + nudge 全部入库

### 已知问题
1. **Vercel 不自动部署**：6月26日全天所有前端改动（UUID 修复、Supabase 优先加载、输入框解锁、气泡优化等）推了但 PWA 未生效。用户无法访问 Vercel 网站。6月27日第一优先级修这个。建议调查 Git Integration 是否断连，或考虑前端也迁到 Zeabur
2. **聊天记录被 nudge 覆盖**：localStorage 仍有竞态风险。已做 Supabase 优先加载 + Nudge 服务端直接写，但前端旧代码可能还在跑
3. **中文记忆编码乱码**：Ombre-Brain 存中文内容时 UTF-8 损坏，英文正常。需修 Ombre-Brain Python 代码
4. **Embedding 向量化失败**：`OMBRE_EMBED_API_KEY` 的 AQ key 不兼容。暂时不影响关键词匹配
5. **Safari 登录密码不对**：用户无法用 Safari 打开 App，只能 PWA

### 明天要做
1. 解决 Vercel 部署问题（或迁到 Zeabur）
2. 确认 ChatPage Supabase 优先加载在前端生效
3. 清理 nudge 前端轮询逻辑（服务端已直接写 Supabase，前端轮询可简化）
4. 修复中文记忆编码（Ombre-Brain）
5. 修复 Embedding 向量化

---

## 今天关键教训
- **`JSON.parse` 炸了三次**：breath 返回 markdown；Rust 后端返回文本；nudge 返回 JSON 字符串。每次都静默吞错
- **RLS 权限是头号杀手**：前端 upsert 因缺 `user_id` + 缺 `WITH CHECK` 全被拦下，错误被 `.catch(() => {})` 吞掉
- **UUID 格式**：`Date.now().toString(36)` ≠ UUID。一个字符集不同直接卡死整个写入链路
- **Vercel 不可靠**：后端改动 Zeabur 自动部署很稳，前端 Vercel 要注意

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
