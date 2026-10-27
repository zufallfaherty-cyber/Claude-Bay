# Claude&Bay 项目进度

## 最后更新：2026年10月27日

---

## 2026.10.27 新项目「weather-sense」环境感知 MCP（✅ 已部署上线）

用户给了一份「给你的 AI 装一层环境感知」教程，只保留**定位 + 天气**两条（去掉环境光/声音/电量）。定位用手机浏览器 geolocation（苹果 iPhone，PWA 打开时上报），天气用 wttr.in（香港服务器实测可用），逆地理用**高德**（用户选定，key `a188…`，Web服务类型）。

**已确定的关键配置**：
- 家坐标 = 桃苑2号楼 = GCJ-02 `119.206474, 26.035837`（高德正向地理返回，level=兴趣点，精确到楼）。判定「在家」半径 500m（用户最终确认 500 不用改）。
- 高德免费 key 有调用频率限制（第 4 次连打触发 `CGQPS_HAS_EXCEEDED_THE_LIMIT`/10022），服务端按需低频调用即可，不额外限流。
- 坐标换算：浏览器上报 WGS84，高德家用 GCJ-02，两者国内差几百米，必须做 `wgs84ToGcj02` 换算，否则「在家」会误判成 600m 外（已实现并验证：在家→1m，走远2km→外面）。

**需求（用户逐条定）**：
1. 平时聊天：定位 + 天气都开放（他一般不主动用）。
2. 主动推送（nudge）：**去掉天气，保留定位**（用于查岗）；prompt 加「你还能查她此刻的位置——用于消失太久或没有报备的查岗」。
3. 每天早 7 点：后端预查天气→体感句 + 「今天接下来」句→直接注入 prompt（AI 不调工具，走 weathersense 的 `/feeling` 专用接口，不走 MCP 工具）。
4. 体感句 = 季节/地点/天空/时段/风/湿度 + 温度 → 一句 35~50 字第一人称身体感受。用户「你写的永远优先」，种子句后续迭代。
5. 聊天时查天气（get_weather 工具）= 只给「现在具体数字 + 接下来天气（会不会降温/下雨/出太阳）」，**不给体感句**；天气数据去掉风向、保留风力（风速 + 等级）。

**已写完待部署的文件**：
- `weather-sense/`（新服务）：`index.js`（MCP + POST /location）、`geo.js`（高德+坐标换算）、`weather.js`（wttr.in 5min 缓存）、`feeling.js`（7轴+体感句）、`Dockerfile`、`package.json`。本地语法 + 逻辑冒烟通过。
- `bunny-chat/server/index.js`：nudge 早7点注入体感句 + 定位工具始终开放/天气不开放 + `/api/location` 转发路由（forward 到 weathersense）。已 node --check 通过。
- `bunny-chat/src/App.jsx`：PWA 打开时 geolocation → POST `https://124-156-142-6.sslip.io/api/location`。
- `bunny-chat/src/lib/toolLabels.js`：加中文名 `查天气`/`查位置`（工具箱 + 聊天气泡共用）。
- 前端 `npm run build` 通过。

**部署（2026.10.27 晚间，已全部上线）**：
1. scp 覆盖 `/home/ubuntu/docker-compose.yml`、`/home/ubuntu/bayapi-data/mcp-config.json`、`/home/ubuntu/bayapi/index.js`、`/home/ubuntu/weather-sense/*`（覆盖前均备份）。
2. `docker compose build weathersense bayapi && docker compose up -d`，两容器运行正常。
3. 前端 `git push`（commit `eaa995d`）→ Vercel 自动部署。
- 验证：`get_weather` 返回「现在数字 + 接下来」，无体感句、无风向（保留风力）；公网 `/api/location` 上报 `{"ok":true}`；`judgeHome` 坐标换算在家 1m / 走远 2km 在外面。

**排障：定位一度显示 589m「在外面」**：
- 根因 = 我测试时把「家」的 GCJ-02 坐标 `119.206474, 26.035837` 当成 WGS84 POST 到了服务器，被二次换算正好偏 589m（高德逆地理落到「室外游泳池」）。用户查岗看到的就是这份残留数据，**不是手机真实定位**。
- 已清掉服务器残留（`location.json` 删除 + 重启 weathersense，`hasLocation:false`）。
- 坐标换算逻辑本身**正确**：已查证 iOS `navigator.geolocation` 返回 WGS-84 原始坐标（不是火星坐标），`wgs84ToGcj02` 换算方向对，无需改。参考 Apple 开发者论坛、腾讯云「App 定位和地图的坑」。

**遗留（下次验证）**：用户手机尚未真实上报过一次定位（之前查到的是残留数据）。下次让用户彻底关 App 重开 + 允许定位后，去 `/home/ubuntu/weathersense-data/location.json` 看原始坐标，确认 judgeHome 判「在家」（约 0~100m）即可闭环。



### 根因
- 后端每小时自查登录用的是 `get_unread_count`（读 `notification.notificationCount`），但**访客/风控冷却态下这个通知数也是 0**，永远误判成「已登录」，所以登录掉了也从没推提醒。
- 之前记的「check_login_status 选择器失效会误报未登录」是**误判**：实测 `guest=false` 时 `.main-container .user .link-wrapper .channel` 选择器 `exists=true`，check_login_status 其实**可靠**（它当时「报未登录」是正确报出了访客冷却态）。

### 改动（server/index.js，`checkXhsLogin` + `isXhsLoggedIn`）
- `checkXhsLogin()`：`get_unread_count` → `check_login_status`
- `isXhsLoggedIn()`：改为命中 `未登录|失败|error` → false，命中 `已登录` → true

### 部署
- scp → `/home/ubuntu/bayapi/index.js` → `docker compose up -d --build bayapi`（124.156.142.6）
- 顺带部署了之前本地未上线的 `/api/xhs/view`（只跳桌面不弹码）端点和 `[企业按量]claude-opus-5-5` 模型列表

### 验证（✅ 通过）
- 容器 Up、新代码已进容器
- 端到端直调 MCP `check_login_status` 返回 `✅ 已登录 用户名: Bay&C`，新逻辑正确识别为已登录

---

## 2026.10.27 小红书「登录成功但点赞收藏失效」排障（✅ 已定位并自愈）

### 现象
- 登录成功、能刷能搜，但点赞/收藏/评论全失败，账号浏览记录/收藏里没痕迹，手机 App 却正常

### 排查过程（走了弯路，结论见下）
- 先怀疑 StealthJS 反检测 → 重新编译 `WithStealthJS(true)` 版部署到 124.156.142.6（用户授权），替换 `/usr/local/bin/xhs-mcp` 并重启 → **无效**，收藏仍失败（排除指纹问题）
- 用诊断程序读 `__INITIAL_STATE__.user` 一度得到 `guest:true`，误判「登录态不能靠 cookies 冷加载恢复」
- 19:25 突然收藏成功，复测诊断 → `guest:false`、nickname"Bay&C"、userId `6488100d...`，用户手机 App 浏览记录/收藏里都看到帖子

### 根因（最终确认）
- **登录后有约 18 分钟风控冷却期**：小红书把新登录的自动化会话暂时判成访客（guest=true），冷却结束风控自动解除，同一份 `cookies.json`（19:07:27 存、一直没变）冷加载恢复真登录。cookies 本身从头到尾没坏。
- **帮倒忙的动作**：排障中反复触发 `get_login_qrcode` 会开新浏览器+新码、互相覆盖登录态，延长冷却期。登录完应放着别动、别重新登录。

### 教训/铁律
- 判断真登录：`check_login_status`（返回「✅已登录」/「❌未登录」）或直接读 `__INITIAL_STATE__.user.userInfo.value.guest !== true`。**别用 `get_unread_count`**（访客态通知数也是 0，永远误判已登录）
- 写操作「状态未变」多半是冷却期软拦截，别反复重试，等 15-20 分钟再试
- 已修正记忆文件 `xhs-login-state-not-persisted`（原「cookies 冷加载失效」结论是错的）

---

## 2026.10.27 小红书登录过期「手机自助重登」+ 推送恢复（✅ 完成）

### 背景
- 小湾反馈：①消息推送坏了（根因：cron-job.org 的 nudge URL 没迁到新服务器）②小红书登录过期
- 想要「知道过期就在手机上点链接重登，全程不用电脑」，且「查登录状态不能让 AI 模型调工具去查（吃 token）」

### 改动（server/index.js）
1. **后端自查登录（0 token）**：nudge 每小时调 `get_unread_count`（不再用 `check_login_status`）判断小红书登录态，AI 完全看不见
2. **登录过期提醒**：过期就推 Pushover「小红书登录过期」+ 链接，12 小时限流一次（`lastXhsExpiryAlert`）
3. **`/api/xhs/relogin` 端点**：点链接 → 后台 fire-and-forget 弹二维码 → 2 秒后 302 跳 noVNC 远程桌面；VNC 密码走环境变量 `XHS_VNC_PASS`（不硬编码进源码）
4. **并发锁 `xhsReloginBusyUntil`**：4 分钟窗口内重复点链接只跳桌面、不重复弹码（避免多码互相覆盖把登录挤掉）
5. **模型列表更新**：`DEFAULT_MODELS` 和用户 Supabase 存的 `api_model` 都换成 `[CCMAX]claude-opus-5-5,[CCMAX]claude-opus-4-6,[企业按量]claude-opus-5-5,[k]claude-opus-4-6`（旧 4.6 前缀陆续下线，nudge 之前发不出消息）

### 宿主机改动
- x11vnc + websockify 从 nohup 改 systemd 常驻（`xhs-vnc.service` / `xhs-websockify.service`，开机自启）
- x11vnc 加 `-passwdfile /home/ubuntu/.xhs-vnc-pass`（密码不落在 `ps` 命令行）
- Caddy `/xhs-login/*` 路由永久保留，链接永远有效

### 踩坑
- ❌ **`check_login_status` 误报「未登录」**：v2.5.5 的 CSS 选择器 `.main-container .user .link-wrapper .channel` 已随小红书改版失效，登录了也判成未登录。改用 `get_unread_count`（读 `__INITIAL_STATE__.notification.notificationCount`，登录才有数据，未登录报错「可能未登录」）作为登录判断
- ❌ **并发弹码互相覆盖**：`get_login_qrcode` 每次开新浏览器+新二维码，多个码并存时后弹的（未登录的）会覆盖前一个已登录的窗口，导致「登录成功一秒跳回未登录」。加并发锁解决
- ❌ **VNC 密码硬编码被拦**：最初把密码写死在源码+URL，deploy 被安全分类器拦（凭据泄露）。改成环境变量 `XHS_VNC_PASS`（写进 docker-compose，和 PUSHOVER_TOKEN 等一致）

### 验证（✅ 通过）
- 登录态用 `get_unread_count` / `list_notifications` 验证：均返回真实数据（`{"mentions":0,"likes":0,"connections":0,"unread":0}` / `{"tab":"mentions","items":[]}`），登录确凿
- nudge 端到端：模型正常生成「宝宝去哪了…」并推送，不再返回「Opus 4.6 已下线」
- `/api/xhs/relogin` 302 → noVNC 正常；`vnc.html` 200

---

## 2026.10.26 Nudge 接入小红书工具（定时推送也能自主逛小红书）（✅ 完成）

### 背景
- nudge（每 1 小时主动推送）之前不跑工具循环，只有 `/api/chat` 非流式支持工具
- 本次让 nudge 也能用小红书 MCP：定时推送时 Claude 自主去小红书看笔记、点赞、评论，回来跟小湾分享

### 改动（server/index.js）
1. `/api/nudge` 接入 `runToolLoop`：有启用工具时走工具循环，没工具时走原来的单次调用
2. **每天最多去 3 次**：内存计数器 `xhsVisitCount` + 日期字符串重置（凌晨清零），满 3 次后当天不再传工具
3. **单次工具上限 10 次**：`runToolLoop` 加 `maxToolCalls` 参数，到上限强制收尾让它直接回复
4. **工具白名单**：nudge 只给 11 个安全工具（刷推荐/搜索/看详情/点赞/收藏/评论/回复评论/看主页/查未读），不给「退出登录/登录二维码/发布笔记」等危险工具
5. **工具结果限流**：单次工具返回超 4000 字截断（防小红书长页面撑爆上下文）
6. **prompt 文案**（终版）：system prompt 加「工具箱可用：想逛小红书就直接调用工具去逛——你是自由的，看笔记、点赞、评论都行；逛完根据真实看到的内容回来写消息。你和小湾约好一天可以去三次，现在还有 X 次」；user 那句改成「到时间了，是玩一玩再回来发消息还是直接发？」（不写死小红书，方便以后接更多 MCP）；消息上限 30→40 字

### 踩坑修复（今天反复触发测出来的）
- ❌ **逛完忘写第二遍 YES**：模型第一轮决定逛、调完工具后，回来写消息时忘了补 YES 前缀，导致 `isYes=false` 消息没推。修复：逛了工具后，只要不是明确 NO 且有内容，默认当作要发
- ❌ **旧「5 轮」上限和新「10 次工具」打架**：`runToolLoop` 原来写死 `MAX_ROUNDS=5`，模型逛到第 5 轮就被掐断，返回「工具调用轮次过多」兜底。修复：轮次上限跟随工具上限（`maxToolCalls>0 ? maxToolCalls : 5`）
- ❌ **兜底文案被当消息推出去**：「（工具调用轮次过多，已停止）」被当成真实消息推送。修复：message 含「工具调用」就拦截不推

### 端到端验证（✅ 通过）
- 手动触发 nudge，AI 自主决定去逛：`list_feeds` 刷推荐 → `get_feed_detail` 看两篇详情 → `like_feed` 点赞一篇笔记
- 逛完基于真实内容写消息（看到「为什么手机一直不洗却不臭」的笔记、提到「顺手点了个赞」），正常推送
- 计数器正确 `xhsVisitsToday:1`，AI 自己在消息里说「还剩两次逛的机会」，理解了「一天三次」约定
- 记忆联动：搜索关键词「抹茶」来自画像里「爱吃抹茶」、搜「戏剧与影视考研」来自记忆

### 部署
- scp `server/index.js` → `docker compose up -d --build bayapi`，容器 Up、HTTP 200 正常

### 注意
- 计数器在内存里，服务重启会清零（当天可能多去几次，可接受）
- nudge 是 fire-and-forget 定时任务，工具调用失败不影响推送本身
- 逛不逛由 AI 自主决定（temperature 0.9），可能连续几次不逛、也可能连续逛——都正常

---

## 今日大变动总览（2026.10.25）

1. **搬家**：bayapi + baymemory 从 Zeabur 迁到腾讯云香港服务器 `124.156.142.6`，1186 个记忆桶全部搬完
2. **HTTPS 上线**：后端改用 `https://124-156-142-6.sslip.io`（Caddy 自动证书），前端已切过去
3. **书房「小湾画像」实装**：画像 + 承诺可编辑，且 Claude 能自动补充（含各种喜好/亲密偏好）
4. **工作流变更**：后端部署从「git push → Zeabur」改成「scp + docker compose 重建」，见下方「日常工作流」
5. **小红书 MCP 接入工具箱**：18 个工具上线，扫码+短信登录完成（走 noVNC 远程桌面），xhs-mcp 转 systemd 开机自启

---

## 2026.10.25 小红书 MCP 接入工具箱 + noVNC 远程桌面登录（✅ 完成）

### 背景
- 前端加「工具箱」：接入小红书 MCP（xiaohongshu-mcp，Go+rod 浏览器自动化，18 工具），用户可在设置页开关工具，Claude 聊天时自主调用，调用后在回复上方显示工具 chips

### 部署
- xiaohongshu-mcp v2.5.5 装到腾讯云香港 `/usr/local/bin/xhs-mcp`，监听 `:18060/mcp`；Xvfb :99 + `headless=false`（无头服务器取二维码必需）
- 转 systemd 服务 `xhs-xvfb` + `xhs-mcp`（开机自启），cookies 存 `/opt/xhs-mcp/cookies.json`
- 后端 mcp-config.json（`~/bayapi-data/mcp-config.json` → 容器 `/data`）加 `xiaohongshu` server，URL `http://172.17.0.1:18060/mcp`（容器经宿主机网关访问）；`/api/mcp/tools` 已返回 18 工具

### 登录（难点）
- 小红书新设备登录需短信验证码，MCP 纯二维码流程没有短信处理 → 搭 noVNC 远程桌面让用户看到服务器浏览器、手动输码
- 链路：Xvfb :99 → x11vnc(5900, 真密码) → websockify(6080) → Caddy `handle_path /<token>/*` → 用户开 `.../vnc.html?autoconnect=1&password=...`
- ✅ 扫码 + 短信登录成功，用户名 Bay&C；cookies 已存（6269 字节），重启后仍已登录
- 登录完已关远程桌面（x11vnc/websockify 停、Caddy /vnc 路由删），只留 token 保护的 `/qr` 扫码页备用

### 前端
- 工具调用提示：后端 `runToolLoop` 返回工具名列表，`ChatBubble` 回复上方渲染工具 chips（已 commit + push → Vercel 部署）
- 工具名中文化：新增 `src/lib/toolLabels.js`（18 工具中文直白名 + 一句说明），工具箱列表和聊天 chips 共用

### 完成与注意
- ✅ 端到端验证通过：用户实测 Claude 在聊天中自主调用小红书工具成功，回复上方显示中文工具 chips
- ⚠️ `/api/chat` 流式模式（`stream:true`）目前不跑工具循环，只有非流式（前端默认 `useStream=false`）支持工具调用
- ⚠️ 小红书 cookies 会过期，过期后需重新扫码登录（`/qr` 页 + noVNC 方案，见记忆 `novnc-browser-login-for-mcp`）

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
- **后端 bayapi**: 腾讯云香港服务器 `124.156.142.6`（Docker 容器 `bayapi`，端口 3001，scp 部署）
- **记忆 baymemory**: 腾讯云香港服务器 `124.156.142.6`（Docker 容器 `baymemory`，端口 8000）
- **后端 HTTPS**: https://124-156-142-6.sslip.io（Caddy 自动 Let's Encrypt 证书）
- **API 中转站**: https://api.jiushi.xin/v1
- **API 密钥**: 在设置页配置（已硬编码兜底，2026.6.25 移除）
- **模型**: [按量]claude-opus-4-6
- **Google AI Studio Key**: （见 Zeabur baymemory 环境变量 OMBRE_EMBED_API_KEY）
- **VAPID 公钥**: BIJHn8BDhMVnhaisl29-OhL7mmx37cPNijwY8FF2i1mF7XT3aroVDcsHMeWBYeb8jFzzrQBHqREgLQRZH263EQY
- **VAPID 私钥**: bEkBaHXD0GJ53pSKjqd9qjXYRleHOPf3kd44pNO9gRw

---

## 日常工作流（⚠️ 2026.10.25 已改，后端不再走 Zeabur）

1. **改前端代码** → `git push` → Vercel 自动部署（无需动服务器）
2. **改后端代码** → 本地改 `server/index.js`，然后：
   - 上传：`scp server/index.js ubuntu@124.156.142.6:~/bayapi/index.js`
   - 重建：`ssh ubuntu@124.156.142.6 'cd ~ && docker compose up -d --build bayapi'`
   - 验证：`ssh ubuntu@124.156.142.6 'docker ps --filter name=bayapi --format "{{.Status}}"'`
3. **改记忆引擎** → 服务器 `~/Ombre-Brain` 里改 → `ssh ubuntu@124.156.142.6 'cd ~ && docker compose up -d --build baymemory'`
4. **手机上测试** → 打开 https://claude-bay-two.vercel.app
5. **本地预览** → `cd bunny-chat && npx vite --host` → http://172.20.10.6:5174
6. **注意**：git 需要梯子代理 `http://127.0.0.1:7890`（已配 `git config http/https.proxy`）；服务器 SSH 免密（`~/.ssh/id_ed25519`）

## 明天要做

1. cron-job.org 的 nudge/diary 定时任务 URL 从 `bayapi.zeabur.app` 改到 `124-156-142-6.sslip.io`
2. （用户暂缓）轮换 Zeabur 泄露的密钥（SUPABASE_SERVICE_ROLE 最急）
3. （可选）GitHub 备份 Ombre-Brain 防再丢数据
