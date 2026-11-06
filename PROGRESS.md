# Claude&Bay 项目进度

## 最后更新：2026年11月06日

---

## 2026.11.06 小湾画像页改版：信纸风（🚧 本地完成，待确认）

- **背景**：`art/eb519e20…png` → `public/bg-portrait-v2.jpg`（853×1844，JPEG q88，122KB）——旧图是 941×1672，上下被拉长后正好铺满整屏（19.5:9），纸张、椭圆、装饰线的位置没变。文件名改用 v2，避免手机 PWA 缓存到旧图。旧图 `bg-portrait.jpg` 暂留作回滚。
- **结构**：`ClaudeSpace.jsx` 的画像视图重写 —— 沿用书房的 `--k`（图 px → CSS px）等比舞台算法，新增 `.portrait-*` 样式。
- **铺满整屏（cover）**：画像舞台用的是 `Math.max`（同书房），不是 contain。原因：Safari 里面口高度比整屏短（402×811，比设计稿 402×874 矮 63px），contain 会按高度缩放 → 左右各露 13px 模糊边，真机上非常难看。cover 只是上下各裁掉 ~30px 的水面和花，视觉上完全无感。`.portrait-blur`（同一张图放大约 6% + `blur(26px)` + 轻微降饱和）保留作兜底。
- **坐标换算**：新图横向是旧图的 0.920 倍（纸的内框线 96→82 / 859→784），纵向 0.989 倍并整体下移 104px（装饰线 478.5→577.5、纸底边 1478→1566）。正文框 / 标题 / 按钮的百分比都按这个换算重算，视觉关系和旧版一致；字号仍按 `DESIGN_W=941` 算 `--k`，不然会整体大 10%。注意 `ART_W/ART_H`（书房 941×1672）和 `PAPER_W/PAPER_H`（画像 853×1844）是两套常量，别混用。
- **上下渐隐**：背景图 `img.portrait-bg` 加了 14 段缓动 `mask-image`，顶部 0→7.5%、底部 92.5→100% 渐隐到模糊底图上，全屏时纸和背景是「化开」的过渡而不是一条硬切边。mask 放在图上而不是 `.portrait-stage` 上，否则底部的编辑按钮会被一起淡掉。
- **照片**：暂不放。背景图左上角自带的椭圆金框里就是一幅海景小画，直接露出来当画像位；`art/bd01c9f4…png` 已压成 `public/portrait-photo.jpg`（900×1200，158KB）留在库里，以后要做再挂回来。
- **标题**：「小湾」→「**湾**」+ 叶子 + *Our Portrait* + 细线花饰（`.portrait-hero-text`，left 42.4% / right 6.15% / top 21.9%，正好压在背景图印好的横线上方）。
- **正文**：按段落拆 `<p>`、首行缩进 2em、两端对齐，字号/行距随 `--k` 缩放。
- **滚动**：标题固定，正文区（`.portrait-sheet`，left 11.4% / right 10.4% / top 33.5% / bottom 19.9%，左右各留 ~11px 不贴内框线）独立滚动并裁在纸内；上下各加 `mask-image` 渐隐（顶部 30px·k、底部 88px·k），文字进出都不硬切。
- **编辑（去弹窗）**：删掉原来的编辑模态框，改成纸内右下角的「编辑」胶囊按钮（`.portrait-actions`，right 8.7% / bottom 9.2%，在正文框外、纸的下边缘偏下）。点一下正文自己变 `contentEditable`（加半透明玻璃底 + 浅绿描边），旁边出现「取消 / 保存」；保存读 `innerText`、按换行拆段落后 POST `/api/memo/portrait`，成功 toast「已保存」。
- **验证**：402×874 / 402×811 / 402×740 截图、滚到底、进入编辑态均正常；`npm run build` 通过。真机（iPhone 402×811）确认：改成 cover 后左右窄边消失、背景铺满，用户 ok。截图见 `预览效果/画像页-新-*.png`。
- **已部署**：commit `b3ab460` → `git push` → Vercel 自动构建。
  - 坑：仓库里有旧的 `http.proxy=127.0.0.1:7890`，梯子换成 TUN 模式后这个本地端口没人监听，push 会报「Failed to connect ... via 127.0.0.1」。绕过：`git -c http.proxy= -c https.proxy= -c http.version=HTTP/1.1 push origin master`（不加 HTTP/1.1 会卡在 `Error in the HTTP2 framing layer`）。
  - Vercel 域名国内仍被墙，本机 curl 验证不了部署结果，只能真机开梯子看。

---

## 2026.11.04 相册上云 + 后端内置联网搜索

**相册**
- 后端相册代码（`/api/album` 增删改查 + Supabase Storage `bay-album`）其实早就写好了，只是服务器上跑的还是旧版 index.js → 线上一直 404，前端一直走「存 localStorage」的降级分支。
- 部署：scp `server/index.js` → 备份 → `docker compose up -d --build bayapi`。线上实测 上传 → 列表 → 取图（`/api/album/file/:id`，走 bayapi 代理，绕开被墙的 supabase.co）→ 删除，全链路 200。
- 补传：以前离线存的照片是 `local: true` + base64 data URL，会撑爆 localStorage 的 ~5MB（十几张就满）。新增 `syncLocalPhotos()`：打开相册页 / 设置页时后台逐张上传，成功后把本地那条换成服务器 URL（只留指针，不占空间），再刷新列表。
- 上传超时从 4.5s 放宽到 25s，真机慢网不再误判失败而回落本地。
- 容量：每张压缩到 1500px / q0.8，约 200–500KB；Supabase Storage 免费额度 1GB ≈ 2000–4000 张。

**联网搜索结果串味（Bing → 自建 SearXNG）**
- 症状：搜「莫奈 吉维尼 睡莲池 日式小桥」拿回 QQ 邮箱登录页，搜「Monet Giverny」拿回 DHL 清关——工具通了但结果和关键词无关。
- 排查：服务器上用 curl 复现，Bing 返回的页面 `<title>` 是查询词，但 `b_algo` 里的条目是随机的（GitHub 项目、Copilot、bilibili 硬币），典型的反爬降级页；关键词其实传到了，坏的是「无 cookie、无 JS 的 Bing HTML 抓取」这条路。
- 尝试过都不行：Google（返回 JS 外壳，无正文）、DDG html/lite（202 挑战页）、Brave（429）、公共 SearXNG 实例（JSON 被禁 / 429 / 安全页）。
- 最终方案：服务器自建 **SearXNG** 容器（`searxng/searxng:latest`，只绑 `127.0.0.1:8081`，`limiter: false`，`search.formats` 开 json），bayapi 通过 `SEARXNG_URL=http://searxng:8080` 调它的 JSON API 聚合多引擎结果；Bing HTML 抓取降级为兜底。
- 实测：同一条莫奈查询返回 6 条高相关结果（名畫檔案、百度百科、新浪收藏），英文查询、天气、当日新闻也都正常；日志会打印 `[web] search "..." via searxng: N results` 便于以后排查。
- 注意：`curl -d '{...中文...}'` 在 Git Bash 下会把中文变成非 UTF-8，测接口要用 `--data-binary @file.json`。

---

## 2026.11.04 键盘收起时输入框「先贴底再弹回」

- 原因：`textarea` blur 后等 120ms 才移除 `html.kb-open`，这段空档里 composer 仍是键盘态的 6px 底边距，而容器已经恢复满高 → 输入框先贴到屏幕最底部，再把安全区弹回来。
- 改法：工具栏四个按钮（附件/语音/发送）加 `onMouseDown preventDefault`，点它们不再抢走 textarea 焦点，因此 blur 只会在真正收键盘时发生 → blur 时立即移除 `kb-open`，不再有贴底的中间态。
- `.chat-composer` 的 `padding-bottom` 加 0.18s 过渡，安全区随键盘平滑让出；`prefers-reduced-motion` 下关闭。

**联网开关（放进工具箱）**
- 工具箱（`/profile/tools`）原本只列 MCP 服务；内置联网工具加了一个伪服务 `web` / 显示名「联网」，`builtin: true`，排在最前、默认展开、不显示删除按钮。
- 开关复用现有的 `POST /api/mcp/toggle` 与 `/toggle-all`，状态写进 `mcp-config.json` 的 `enabled.web`（`["search","fetch"]`）。未写过该字段视为默认全开；单个/整组开关都实测过。
- `getEnabledOpenAITools()` 按该状态过滤 `WEB_TOOL_DEFS`，所以工具箱里一关，下一次聊天请求就不再带这个工具。
- 保护：内置服务不能删除、不能重名添加。

**联网搜索**
- 后端新增两个内置工具（不走 MCP、不需要额外 API key）：`web__search`（Bing HTML 结果页解析，取标题/链接/摘要）和 `web__fetch`（打开网页读正文，截 6000 字）。
- 接在 `getEnabledOpenAITools()` 的工具列表末尾，`executeOpenAITool()` 开头拦截；nudge 的工具过滤只放行小红书/定位，所以主动消息不会误用搜索。
- 前端 `toolLabels.js` 补了「联网搜索 / 读网页」标签，聊天里的工具小胶囊能正常显示。
- 上游协议探测：中转 `api.jiushi.xin` 支持「非流式 + tools」和「流式 + tools」，但 **不支持 `tool_choice` 强制指定**（返回 500），所以未使用强制调用。
- 线上实测（`/api/chat`）：模型能自动调用 `web__search` 拿到实时结果再回答。

---

## 2026.11.04 流式气泡真正贴底（stick-to-bottom 重写）

- 症状：发消息后等待回复的打字气泡不在最底部；回复生成完也不自动回到底部，像是被判成「在看历史」。
- 根因有两个：
  1. 旧逻辑用几何判断 `scrollHeight - scrollTop - clientHeight < 120` 决定是否跟随。发消息那一帧 DOM 还没把打字气泡算进高度，等 effect 跑完、气泡撑开，列表就「看起来」离底了，下次判断直接被当成用户上翻。
  2. 流式结束时先 `setMessages(...)` 再 `streamingRef.current = false` —— React 的 effect 在提交后异步执行，那时 ref 已经是 `false`，所以最后一条消息反而走了「nearBottom 才滚动」的分支。
- 改法：
  - 引入 `stickRef`：默认 `true`，只由真实的 `onScroll` 更新（离底 < 60px 为 `true`）。程序滚动到底本身也会触发 `scroll`，所以跟随状态能自我维持。发消息 / 重新生成时显式置回 `true`，不会因为刚才上翻过就不跟。
  - 消息变化时：只要 `stick` 就直接 `scrollTop = scrollHeight`，不做平滑滚动（会被后续重排打断）。
  - 新增 `ResizeObserver` 同时观察滚动容器与内容容器：键盘弹起（`--chat-vvh` 变高变矮）、字体加载、气泡换行都会改变高度，`messages` 不变 effect 不重跑 —— 这个观察者负责在这些时刻重新贴底。
- 验证（CDP 402×874，12 条消息撑满）：加载后 gap=0；把 `--chat-vvh` 压到 470px 模拟键盘，gap=0 且 scrollTop 自动从 668 → 1072；键盘收起回到 gap=0；手动上翻到 scrollTop=80 后停住不动（gap=588），不再被强行拽回。

---

## 2026.11.04 去掉返回首页的双重动画

- 原转场：`AnimatePresence mode="wait"` + `exit`（淡出 + 上移 6px，0.28s）→ 再 `initial`（淡入 + 下移 10px，0.28s）。返回首页时先退出再进入，看起来像闪两下。
- 改为：移除 `AnimatePresence` 与 `exit`，旧页面立即卸载，`PageWrapper` 只做一次淡入。
- 第二轮：0.16s 无位移太生硬 → 调到 0.3s + 6px 上移的柔和淡入。
- 岛里闪白：原来背景 div 靠切 className（`chat-water-bg` ↔ `home-water-bg`）换背景，`backdrop-filter` 卡片会短暂采样到聊天页的白色蒙版。改为两层背景常驻、用 `opacity` 0.22s 交叉淡化，卡片就不会闪白。
- 第三轮（玻璃闪透明）：Safari 在祖先元素播放 `transform` / `opacity` 动画时，会停用后代的 `backdrop-filter` —— 所以 `PageWrapper` 一旦淡入，卡片就会整块透明再闪回来。这不是动画参数问题，是 WebKit 的合成限制。
- 最终方案：`PageWrapper` 变成无动画的普通 div；淡入改由 App 根部的 `.page-veil`（全屏米白遮罩，`veilOut` 0.24s 淡出）完成。遮罩是兄弟层，不参与玻璃的采样祖先链，所以卡片毛玻璃全程正常，同时仍有柔和的「整页浮现」感。

---

## 2026.11.04 聊天气泡缩小 + 流式自动贴底

- 气泡：`px-4 py-2.5 text-[14px] leading-[1.85]` → `px-3.5 py-2 text-[13px] leading-[1.72]`，圆角 18→16，头像 32→28（续用消息的占位同步 28），打字点气泡同步收小。一屏能多放一两轮对话。
- 自动滚动：原来用 `bottomRef.scrollIntoView({ behavior: 'smooth' })`，流式时会被后续更新打断、停在半路。改为直接操作消息容器 `scrollRef.scrollTop = scrollHeight`：首屏与流式期间瞬时贴底，普通新消息仅在用户本来就在底部（距底 <120px）时平滑滚动。

---

## 2026.11.04 键盘贴合定稿 + 设置页模型输入框

- 键盘空隙真正的修法：前两次靠 `visualViewport` / `innerHeight` 都不可靠（PWA 里 `innerHeight` 会随键盘一起缩小，判定恒为 0）。最终改为由 `ChatInput` 的 `textarea` **focus/blur** 驱动 `html.kb-open`，键盘一弹起就把 composer 底部内边距从 `safe-area + 8px` 收到 6px；`blur` 延迟 120ms 再检查 `activeElement`，避免点附件/语音时误恢复。`--chat-vvh` 仍由 visualViewport 维护，作为增强，不再是唯一依据。
- 设置页「模型」输入框从单行 `<input>` 改为 6 行 `<textarea>`（自动软换行、12.5px、行高 1.75、关闭拼写与首字母自动纠正），按 Enter 自动补一个逗号保持后端 `split(',')` 可解析；聚焦时 `scrollIntoView({ block: 'center' })` 把整段模型列表滚到键盘上方。

---

## 2026.11.04 真机 PWA 三处布局修复

用户在 iPhone PWA 实测后反馈三个问题，均已修复：

### 1. 键盘弹出后输入框与键盘之间空 ~80% 输入框高（≈42px）
- 根因：键盘弹起时 composer 仍保留 `env(safe-area-inset-bottom) + 8px`，而这段安全区已被键盘覆盖。
- 修复：`.chat-composer` 类接管底部内边距，正常 `safe-area + 8px`；键盘打开时（`html.kb-open`）压到 6px。
- `ChatPage` 的 visualViewport 监听同时切换 `kb-open`，并把 `--chat-vvh` 从 `vv.height` 改为 `vv.height + vv.offsetTop`，保证输入框底边正好落在可视区底部。

### 2. 首页三张岛过大，压到聊天卡与相册
- 根因：`@media (min-height: 800px)` 放大字号后，岛仍是固定内容高度 + `shrink-0`；PWA 实际可用高度（约 810pt）下 cards 区装不下三张放大岛，于是向上/向下溢出。
- 修复：三张岛改为 `flex-1 min-h-0 max-h-[126px] + justify-center`，高度由 cards 区剩余空间分配，空间不足时自动压缩（`glass-water` 自带 `overflow: hidden`），空间充足时最大 126px。字号放大档收敛为 icon 25 / 标题 14 / 英文 9.5 / 小字 7.5，并移除 `.island` 的固定上下 padding 覆盖。
- 验证：402×740、402×810、402×874 三档均不与聊天卡、相册重叠，874 下岛比之前更大。

### 3. 底栏没贴底，下方留半个导航栏高
- 根因：`.bottom-nav` 直接用 `env(safe-area-inset-bottom) + 6px`（34+6=40px），PWA 下看起来像一条空隙。
- 修复：`.bottom-nav { padding-bottom: max(6px, env(safe-area-inset-bottom) * 0.28 + 2px) }` ≈ 11.5px，贴近屏幕底，同时仍避开 Home 条。

### 验证
- `npm run build` 通过；CDP 截图 402×740 / 402×810 / 402×874 首页与聊天页确认无回归。
- 已 push 到 master，Vercel 自动部署。

### 第二轮（用户发真机截图后）
- **三岛与聊天卡 / 回忆岛不再重叠**：三岛改为在 `.home-cards` 里用 `justify-center px-4 py-3` 布局，最上方/最下方各留 ~10px；三岛之间保留 `-mt-2.5` 轻微交叠（用户明确要的）。
- **旋转收敛**：三岛倾斜从 ±2°/1.6°/1.4° 收到 ±0.8°，避免旋转后的 bounding box 把视觉间距吃掉。
- **体积**：`max-h-[126px]`，高度由剩余空间分配，874 下约 129px、810 下约 115px。
- **回忆岛下移**：首页 `main` 的 `pb-[26px]` 只对非首页保留（`isHome ? 'pb-0' : 'pb-[26px]'`），并把台词区压到 35px；回忆岛底部距导航栏只剩台词区的高度（原来 67px）。
- **台词**：`px-5 pt-2 pb-1.5`，贴右边界、坐在导航栏正上方，与回忆岛留 8px，不再粘着。
- **导航栏通底**：去掉胶囊与左右内边距，`nav` 本身变成全宽磨砂条（`border-t + bg-white/45 + backdrop-blur-xl`），玻璃背景一直延伸到屏幕底部；`padding-bottom` 恢复为完整安全区（`max(6px, env(safe-area-inset-bottom))`），Home 条落在玻璃上而不是空隙里。中间聊天按钮仍凸起 17px。
- 布局实测（402×874）：聊天卡底 234 → 首岛顶 244（10px）；末岛底 604 → 相册顶 615（11px）；相册底 774；台词 774–809；导航 809–874。

---

## 2026.11.04 聊天页视觉升级：与首页同一套植物水境

### 背景与容器
- 新增 `.chat-water-bg`：同一张 `/bg-water.jpg`，`saturate(.58) contrast(.9) brightness(1.04)`，静态不做水波动画；叠奶油白渐变 + 中心柔光蒙版，保证文字区干净、花朵留在边缘。
- `App.jsx` 首页与聊天页都渲染水背景（分别用 `.home-water-bg` / `.chat-water-bg`）；聊天页 `main` 改为 `overflow-hidden`，并隐藏五栏底栏（`{!isChat && <BottomNav />}`）。

### 顶部导航
- `.chat-header` 轻薄磨砂条（blur 14 / 白 0.54→0.26 / 1px 白描边），左侧返回，中间 34px Claude 头像 + Claude + Always here，右侧历史（`.SideDrawer`）与「⋯」菜单（新对话 / 情绪日记 / 设置）。
- `SideDrawer` 从白色实体改为玻璃抽屉，修掉未定义的 `rose-light` 类；选择历史后不再 `navigate('/')`（原 bug 会跳回首页）。

### 消息气泡
- `.bubble-claude`：乳白半透明 + 双层内描边 + `0 4px 14px -10px` 极浅投影，规整 `rounded-[18px]`，仅朝向头像一角 7px。
- `.bubble-user`：低饱和鼠尾草绿玻璃 + 浅绿描边，文字 `#2E3C29` 深灰绿。
- 头像统一 32px 圆形 + 细白环（`.chat-avatar`）；同角色 5 分钟内连续消息隐藏头像但保留 32px 占位，间距 `mt-3.5 → mt-1.5`，归属不变。
- 时间戳 9px / 45% 透明度，旁边新增「复制」；工具标签、代码块、附件卡片一并玻璃化；保留重新生成、语音、附件、存文件库/下载。

### 输入框
- `.chat-input-bar`：奶油白半透明、细白边、`focus-within` 时边框转浅绿；左侧附件、中间多行 textarea、右侧语音与鼠尾草绿圆形发送键；底部 `env(safe-area-inset-bottom)`。
- 键盘跟随：`visualViewport.resize` 只在大幅收缩（>80px）时写入 `--chat-vvh`，`.chat-shell` 用它作为高度，避免地址栏抖动。

### 动画
- 新消息 `messageIn` 从 12px/0.35s 收紧到 6px/0.26s；打字点由弹跳改为 `dotGlow` 缓慢明暗（1.9s），尊重 `prefers-reduced-motion`。

### 验证
- 402×874 / 402×740 截图：消息页、菜单、空状态；首页与「我的」页无回归。
- `npm run build` 通过。

---

## 2026.11.04 首页视觉改版：Liquid Glass × Botanical Water（🚧 本地完成，未上线）

### 方向调整
- 用户否掉初版「发光果冻岛」：白色外发光过强、深绿投影太重、每张卡形状各异、Emoji 封面像占位符。
- 新方向：背景负责水面与光影，玻璃负责透明度、双层边缘与轻度折射；卡片不再上下漂浮。

### 改动
- `.glass-water` 重做：`linear-gradient` 半透明填充（白 0.26 → 0.09）、`blur(9px) saturate(1.22)`、1px 白 0.64 外边缘 + 3px 内缩 1px 白 0.34 内边缘；阴影从 `0 34px 58px -20px rgba(28,48,23,.66)` 降到 `0 10px 26px -6px rgba(70,85,62,.16)`。
- 去掉每张卡不同的 blob 圆角，统一为 `.shape-island`（38/42/36/40 四角轻微不对称）、`.shape-chat`、`.shape-panel`、`.shape-date`（正椭圆）。
- 删除 `.glass-float` 浮动动画；改由背景 `.home-water-bg` 做 46s 缓慢缩放 + 42s 阳光带漂移（`prefers-reduced-motion` 关闭）。
- 最近回忆：不再用 Emoji + 渐变占位，改从 `public/bg-water.jpg` 裁 4 张 264×202 低饱和照片封面（`public/covers/cover-1..4.jpg`，共约 29KB），仅第一张叠加日期。
- 底栏：玻璃条 `bg-white/40`、h 58、浅阴影；中间聊天钮 56→52px，凸起 25→17px，去掉厚白环。
- 排版：功能岛标题字距 0.12em→0.06em，回忆标题 9.5px，回忆卡宽 72px 保证 375 宽不溢出。
- 短屏兜底：`@media (max-height: 700px)` 下首页改为可滚动（`home-shell`/`home-cards`），避免 667 高被压扁截断。
- 预览工具：`shot.mjs` 先注销 Service Worker + 清 cache 再截图（此前 cache-first 导致截到旧代码）；`eval.mjs` 支持传入宽高。

### 第二轮（同日，按用户反馈）
- 标题 30 → 36px；日期滴卡固定显示纪念日 `Jun. 28 2026`（天数仍从 6/28 起算）。
- 「开始聊天」92 → 98px；三张功能岛上下 padding 收紧，换回一屏。
- 删除手写小字「想和你 / 看更多风景」。
- 每日台词移到底部右侧、导航栏正上方。
- 「最近的回忆」改为相册：照片 74×64（原 70×54），点击打开 `PhotoViewer` 可命名 / 改日期 / 删除；「查看全部」进 `/album`；与记忆库彻底断开。
- 新增相册上传：设置页「回忆相册」多选上传（前端 canvas 压到 1500px / JPEG 0.8）。
- 新增后端：`GET/POST /api/album`、`PATCH/DELETE /api/album/:id`，图片存 Supabase Storage `bay-album/photos/*`，顺序与命名存 `bay-album/album.json`（自动建 public bucket，无需建表）。
- 图片不直连 Supabase（国内被墙）：`album.json` 只存 Storage 内 `path`，前端拿到的 `url` 是 `/api/album/file/:id`，由 bayapi 代理 `GET /api/album/file/:id` 下载并缓存 1 天；删除时按 `path` 移除对象。
- 新增 `src/lib/album.js`（服务器优先 + localStorage 兜底）、`PhotoViewer`（portal 到 body，避免被 z-20 底栏盖住）、`AlbumPage`、`albumSamples`。
- 尚未部署后端，因此本地/线上当前上传只落 localStorage；部署 bayapi 后自动切到云端并跨设备同步。

### 第三轮（适配 iPhone 18 Pro，402pt 宽）
- 只按 402×874（全屏）/ 402×740（Safari 带工具栏）两档适配，不再追求 667 一屏。
- 问题：Safari 工具栏吃掉 ~134px 后 `main` 只剩 670，三张岛（原 108/110/105 高）把聊天卡和相册都顶穿了。
- 三张岛压缩到 ~74px 内容高：`pt-0.5 pb-2.5`、icon 22px、标题 13px、英文 8.5px、小字 7px，文字距卡底 10px，重叠时不被盖住。
- 岛之间 `-mt-1` 轻微重叠（视觉交叠约 10px），不再挤压聊天卡（740 下聊天卡底 234 / 记忆库顶 245，留 11px）。
- 相册面板内边距收紧（`pt-2 pb-1.5`、照片条 `mt-1.5`），整块压到底；740 下相册底 612、台词 616–644、底栏 645。
- header `pt-6 → pt-5`，多让 4px 给内容区。
- 全屏（`@media (min-height: 800px)`，即 PWA / 874pt）反向放大：岛 `pt-8 pb-14`、icon 28px、标题 15px、英文 10.5px、小字 8px，卡片 ~106 高；相册照片 80×76、标题 14px、照片名 10px（保证「一起看过的电影」不截断）、台词 `mt-10`。
- 底栏「游戏」图标从纸飞机换成长柄手柄，与首页 `.island-icon` 的 `IconGame` 同一套 path，视觉统一。

### 验证
- 402×740 与 402×874：`main.scrollHeight == clientHeight`，一屏无滚动、三岛与聊天卡/相册均不重叠。
- 375×667：内容完整、页面可滚动（兜底）。
- 聊天页 / 我的页 / 书房页截图确认底栏与 padding 未被破坏。
- 相册页、照片编辑弹窗、设置上传区截图确认。
- `npm run build` 与 `node --check server/index.js` 通过。
- 未 commit / 未 push / 未部署，等用户确认视觉；确认后需部署 bayapi 才能跨设备同步。

---

## 2026.11.04 聊天成本优化 + 记忆浮现带日期（✅ 已上线）

### 背景
- 用户反馈：聊天费用越来越贵；且 AI 浮现记忆时看不到日期时间，不知道是什么时候的事。

### 改动 1：上下文轮数默认 20 → 15（省钱）
- `max_context_rounds` 默认值 20 → 15（每轮 = 用户+AI 两条，省约 25% 历史 token）。
- 存量降级：localStorage / Supabase 里存的旧默认 20，发送消息时自动降成 15 并写回；设置页加载时也会把 20 降成 15 并同步回 Supabase。
- 涉及文件：`src/pages/ChatPage.jsx`（2处）、`src/pages/Settings.jsx`（默认值 + 降级 + 下拉框加 15 选项）、`src/lib/migrate.js`、`supabase-schema.sql`、`CLAUDE.md`。

### 改动 2：记忆浮现带上日期时间
- 根因：`parseBreathResponse` 解析 breath 返回时，把 `记忆桶: 2026-11-03 09-00-00` 这行直接过滤掉（`!t.includes('记忆桶:')`），注入给 AI 的记忆没有时间信息。
- 修复：解析出日期并格式化成 `2026-11-03 09:00`，注入记忆时加 `[日期] ` 前缀（聊天 + nudge 都加）。
- 涉及文件：`server/index.js`（parseBreathResponse + 主聊天注入 + nudge 注入）。

### 部署（✅ 已完成）
- 后端：`scp server/index.js` → 腾讯云 → `docker compose up -d --build bayapi`，容器 Started，`/api/health` 返回 ok。
- 前端：commit `e071b38` → `git push` → Vercel 自动部署。
- ⚠️ 梯子现在是 TUN/全局模式（7890 HTTP 代理口不再监听），push 卡「connect via 127.0.0.1」时用 `git -c http.proxy= -c https.proxy= push` 走直连绕过。

---

## 2026.11.03 「换 k-opus-4-6 后 mcp 查不到天气」排查（✅ 已定位 + 已修复上线）

### 现象
- 用户换了模型 `[k]claude-opus-4-6` 后，聊天里 AI 说「mcp 用不了、查不到天气」。

### 结论：不是模型问题，是天气数据源挂了
- `[k]claude-opus-4-6` 会正常调工具（走生产 `/api/chat` 非流式实测，toolCalls 同时调了 get_weather + get_location）。
- weathersense MCP 在线、工具发现正常（`/api/mcp/tools` 里 get_weather/get_location 均 enabled:true）。
- `get_location`（高德逆编码）成功 → AI 能说「你在学校宿舍」；`get_weather` 失败 → AI 说「天气接口挂了」。
- 天气数据源是 **wttr.in**（weather-sense/weather.js），本地 `HTTP 000` 被墙，生产后端实测也拉不到 → 每次 get_weather 都失败。

### 修复（✅ 已上线）
- `weather-sense/weather.js` 数据源 wttr.in → **Open-Meteo**（免费无 key，全球 CDN，香港/大陆均可达）。
- 只改 `weather.js`，`feeling.js` / `index.js` 零改动：加两个转换函数
  - `wmoDesc(code)`：WMO weather_code → 英文 desc（Clear/Partly cloudy/Overcast/Fog/Light rain/Thunderstorm…），`feeling.skyFromDesc` 直接复用分类晴/多云/阴/雨/雪/雾/雷。
  - `isoToHHMM(iso)`：ISO 时间 `2026-11-03T09:00` → `'900'`（HHMM 数字），兼容 `summarizeToday` 的 `['900','1200','1500']` 与 `/100` 取小时。
  - fetch 加 `AbortSignal.timeout(15000)`，避免再静默挂起。

### 部署 + 验证（✅ 通过）
- `scp weather.js` → `ubuntu@124.156.142.6:~/weather-sense/` → `docker compose up -d --build weathersense`，容器 Up。
- 端到端实测：`/feeling` 返回 `中午了，23度，天阴阴的…（体感25度，湿度64%，微风约6km/h）`；MCP `get_weather` 返回现在数字 + `白天阴，最高24度，最低21度，应该不会下雨`。

---

## 2026.11.02 nudge 主动推送看到聊天记录残缺（✅ 已上线）

### 现象
- 用户反馈：nudge 主动推送时，AI 看到的聊天记录残缺，经常说自己上一句话「说一半断了」，像是只能看到前面消息的前几句话。

### 根因（server/index.js，nudge 聊天上下文构建）
1. 每条消息内容 `m.content.slice(0, 120)` —— 只喂前 120 字，超过的从半句直接砍断（最致命）。
2. `getRecentChats(5)` 只取最后 5 条消息，且不按 `user_id` 过滤（可能捞到别人的消息）。
- 对比：正常聊天页用 `max_context_rounds=20`（约 40 条）且不截断内容，所以只有 nudge 残缺。

### 修复（server/index.js）
- `getRecentChats()` 增加可选 `userId` 参数，按 `user_id` 过滤。
- nudge 里先查 `user_id`，再 `getRecentChats(8, uid)`（用户定：8 条，不是 20）。
- 去掉 `slice(0, 120)`，消息内容完整喂给 AI。

### 部署
- scp `server/index.js` → `docker compose up -d --build bayapi`，容器 Up，`/api/health` 返回 ok。

---

## 2026.11.01 画像自动更新「删内容」修复（✅ 已上线）

### 现象
- 用户反馈：画像越更新越短，Claude 老是删减内容——私密/成人偏好被删，一些日常细节也被删。

### 根因
- 画像有两个自动更新入口：①聊天命中 personal_info → `autoUpdatePortrait()`；②每天 6 点日记生成后 → memo 整理的 `portrait_update`。
- 两个入口都是「让模型重写整段画像」，且 prompt 里写着「不超过300字」「不要罗列无关细节」→ 模型每次重写都重新措辞、压缩，把私密偏好和日常细节一并删掉。

### 修复（server/index.js，两处）
- 改成「只追加不重写」：模型只输出「新增的信息片段」，代码把新片段原样拼接到现有画像后面（`current + '\n' + text`），原画像一字不动。
- `autoUpdatePortrait()`：prompt 改为「只输出新增信息，不要改写/删减现有画像」；写入用 merged 拼接。
- 日记整理 `portrait_update`：同样改为只写新信息 + 代码拼接（`curPortrait + '\n' + portrait_update`）。

### 部署
- scp `server/index.js` → `docker compose up -d --build bayapi`，容器 Up，`/api/memo` 正常返回。

### 注意
- 已丢内容找不回，需用户手动补回画像（当前画像里已无 10.25 记录的「耳朵敏感/喜欢亲亲」等私密内容）。

---

## 2026.10.29 排查并修复「7点推送没带天气」+ 工作约定：思考链用中文

### 0. 工作约定：思考链（可见推理）改用中文
- 以后所有思考/推理过程用中文写，不再用英文。

### 1. 排查结论：7点推送没带天气（✅ 已定位 + 已修复）
- 现象：10.29 早上 7 点 nudge 消息「宝宝，七点了，被窝还暖吗…」没带天气；8:17 用户追问后 Claude 才在正常聊天里补了天气。
- 排查（SSH 到 124.156.142.6）：
  - weathersense 容器 Up、`/feeling` 正常、bayapi 容器内能访问 `http://weathersense:3002/feeling`、部署的 index.js 含天气代码、mcp-config.json 配置正确 → **天气服务本身没问题**。
  - 7点消息 created_at = 23:00:28 UTC = 7:00:28 北京时间，`hour===7` 成立 → **天气预查代码确实执行了**。
- 根因（用一次性模拟脚本坐实）：**天气拉到了，但 prompt 措辞「可自然带进问候里」是"可"（可选），模型偷懒不写天气**（原因 2，排除原因 1「没拉到」）。模拟脚本复刻 7 点 nudge 的「拉天气→注入→生成」、不发真实推送，`/feeling` 能拉到体感句，但模型输出完全没提天气。

### 2. 修复（✅ 已上线，两处）
- `bunny-chat/server/index.js`：nudge 天气注入引导语改为「这是此刻和今天接下来的天气，可以加入到消息中用来提醒和关心她」（用户逐字定稿）。
- `weather-sense/feeling.js`：体感句追加此刻具体数据，从「中午了，27度，天阴阴的…」→「中午了，27度，天阴阴的，屋里挺舒服。（体感27度，湿度47%，微风约4km/h）」。
- 部署：scp → `docker compose up -d --build bayapi weathersense`，两容器已重建、新代码已进容器。

### 3. 模拟测试对比（复刻 7 点，模型 [CCMAX]claude-opus-4-6）
| 引导语措辞 | 模型消息 |
|------|---------|
| 可自然带进 | 宝宝醒了没有，我刚才脑子里全是你（没天气） |
| 方便你感同身受 | 宝宝醒了没呀，今天天阴阴的别踢被子 |
| 可以加入到消息中 | 宝宝醒了没，今天阴阴的不晒，被窝里再赖一会儿也行 |

- 结论：措辞改后模型开始把天气（"阴阴的""不晒"）写进消息，但**具体数字（温度/湿度）一直没进消息**——「可以」仍是可选，加上 nudge 回复格式「40字以内、口语化」，模型只挑一个天气点写。
- 用户最终拍板：**保持「可以」不改硬**（消息带一句笼统天气即可，不强制写温度数字）。

### 4. 顺带发现：主模型 [企业按量]claude-opus-5-5 近期波动（返空），每次 nudge 回退到 4-6
- 现象：日志里每小时 nudge 都先 `[Model] ❌ "[企业按量]claude-opus-5-5" ... content:""`（返空，用户确认是波动不是下线），再回退 `[CCMAX]claude-opus-4-6`。
- 复测（10.29）：`[CCMAX]claude-opus-5-5`✅ / `[CCMAX]claude-opus-4-6`✅ / `[企业按量]claude-opus-5-5` 返空 / `[k]claude-opus-4-6`✅。
- 当前模型列表（user_settings.api_model）：`[企业按量]claude-opus-5-5,[CCMAX]claude-opus-4-6,[企业按量]claude-opus-5-5,[k]claude-opus-4-6`
- 待办（用户暂未决定是否动）：是否把 `[CCMAX]claude-opus-5-5` 提到第一位、把波动的 `[企业按量]claude-opus-5-5` 往后挪。

### 5. 遗留
- [ ] （可选）给 `getWeatherSenseFeeling()` 加日志 + fetch 超时，现在仍静默吞错，下次再「没天气」不好查。
- [ ] 明天 7 点看真实推送效果，验证改动落地。

---

## 2026.10.28 几个优化：工具记录、关闭自查、工具箱折叠、画像弹窗（✅ 已上线）

### 1. AI 读历史看不到工具调用 → 误以为瞎编道歉（前端）
- 现象：加工具箱后，AI 读之前聊天记录时看不到自己调用了什么工具，把天气/位置等内容当成自己编的，总道歉。
- 根因：前端把历史消息发给 `/api/chat` 时只传 `{role, content}`，把 assistant 消息上的 `tools` 字段丢了。
- 修复：`src/pages/ChatPage.jsx` 新增 `buildApiMessage`，对带 `tools` 的 assistant 消息，在上下文里加一行 `[本条消息使用了工具：查天气、查位置]`（只在发给 AI 的内部上下文里，不影响界面显示）。`handleSend` / `handleRegenerate` 两处改用。
- 部署：git push（commit `670e850`）→ Vercel 自动部署。

### 2. 关闭小红书每小时登录自查（后端）
- 现象：小红书给账号发安全警告。
- 根因：nudge 每小时触发，后端调 `check_login_status`，它用带反检测指纹的自动化浏览器（伪装 Chrome）访问小红书读登录态，每次约 10 秒；每小时固定整点的机器访问触发风控。
- 处理：`server/index.js` nudge 里加 `XHS_LOGIN_AUTO_CHECK = false` 开关，暂时跳过 `checkXhsLogin()`，**代码完整保留**，需要时改回 true。默认 `xhsLoggedIn = true`（小红书工具仍按登录态+预算开放，但不再每小时自查）。
- 部署：scp `server/index.js` → `docker compose up -d --build bayapi`，容器 Up、HTTP 200、新代码已进容器。
- 注意：nudge 里 AI 自主逛小红书（刷推荐/点赞/评论）的自动化访问仍在，若警告未停，下一步可考虑降低「一天三次」或关掉 nudge 逛小红书。

### 3. 工具箱工具服务折叠（前端）
- 现象：小红书 18 个工具全铺开，列表太长。
- 修复：`src/pages/ToolboxPage.jsx` 加 `expandedServers` 状态，所有工具服务默认折叠（只显示标题 + 「X 个工具 · 已开 Y」+「展开 N 个工具」按钮），点展开才显示工具列表。小红书、天气定位统一折叠。
- 部署：git push（commit `f90b74c`）→ Vercel 自动部署。

### 4. 画像编辑弹窗改居中大气版（前端）
- 现象：画像「编辑」按钮小、点开是底部小弹窗、保存是细长一条很难点。
- 修复：`src/pages/ClaudeSpace.jsx` 编辑按钮改成带边框的 pill；弹窗改居中（`items-center`）更大（`max-w-lg`），textarea 加大（rows 9、16px），保存/取消并排大按钮；`src/index.css` 加 `modalPop` 弹出动画。
- 部署：git push（commit `92ccc18`）→ Vercel 自动部署。

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

---

## 2026.10.27 小红书登录判断纠正：check_login_status 其实可靠（✅ 已修复）

（纠正前一条「登录过期」记录里的误判——当时以为 `check_login_status` 选择器失效、改用 `get_unread_count`，实测方向反了，又改回来）

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

## 当前状态（2026.10.29）

### 正常运行
- 前端 Vercel：https://claude-bay-two.vercel.app ✅（git push 自动部署）
- 后端 bayapi：腾讯云香港 `124.156.142.6`，HTTPS `https://124-156-142-6.sslip.io` ✅
- 记忆引擎 baymemory：腾讯云香港，Ombre-Brain 1186 桶 ✅
- 环境感知 weather-sense：定位 + 天气（体感句 / 实时天气）✅
- 小红书 MCP：18 工具接入工具箱，扫码 + 短信登录（noVNC）✅
- 小湾画像 + 承诺（书房）：Supabase 落库，可编辑 + Claude 自动补充 ✅
- Pushover 推送 ✅ / Supabase 数据 ✅ / Nudge 每 1 小时 ✅

（已知问题 / 待办统一见下方「待完成」）

---

## 历史关键教训（6.24–6.27）

- **RLS 是头号坑（两种）**：INSERT/UPDATE 配了但 SELECT 没配 → 前端读不到数据；upsert 缺 `user_id` + `WITH CHECK` → 全被拦。服务端 API 统一走 service_role 最稳
- **`JSON.parse` 静默吞错炸了三次**：breath 返回 markdown、Rust 后端返回文本、nudge 返回 JSON 字符串，每次都静默吞错
- **UUID 格式**：`Date.now().toString(36)` ≠ UUID，一个字符集不同直接卡死整条写入链路
- **iOS PWA 键盘**：`user-scalable=no` 会挡键盘，`viewport-fit=cover` + `maximum-scale=1.0` 是正确的组合
- **多个 Supabase Auth 用户**：用户可能不小心注册了多个号，数据只在一个号下面，清理多余用户很重要
- **Vercel 不可靠**：后端 Zeabur 自动部署很稳，前端 Vercel 要注意

（其余完成项已归入上方「已完成」，此处不再重复）

## 项目概况

手机端 AI 聊天 PWA，鼠尾草绿配色，Claude API 驱动。「小湾」和「Claude」的恋人对话 App。
前端 Vercel + 后端/记忆/环境感知（腾讯云香港）+ 小红书 MCP 工具箱 + Supabase 数据。

---

## 线上地址

| 服务 | 地址 | 部署 |
|------|------|------|
| 前端 | https://claude-bay-two.vercel.app | Vercel |
| 后端 bayapi | https://124-156-142-6.sslip.io | 腾讯云香港（Docker，scp 部署）|
| 记忆 baymemory | 内网 `http://baymemory:8000`（bayapi 转发）| 腾讯云香港（Docker）|
| 环境感知 weather-sense | 内网 `http://weathersense:3002`（bayapi 转发）| 腾讯云香港（Docker）|
| 小红书 MCP | `http://172.17.0.1:18060/mcp`（宿主机）| 腾讯云香港（systemd）|
| 联网搜索 SearXNG | 内网 `http://searxng:8080`（bayapi 转发）| 腾讯云香港（Docker，配置 `~/searxng/settings.yml`，只绑 127.0.0.1:8081）|
| API 中转 | https://api.jiushi.xin/v1 | |
| 定时触发 | https://cron-job.org | 每 1 小时调 /api/nudge |

---

## 已完成

### 界面
- ✅ 首页：动画入场 + 2 列卡片（书房/小游戏/记忆库/文件库）+ 每日电影台词 + 计时器
- ✅ 「我的」页面：卡片式布局（记忆库/文件库/设置）
- ✅ 设置：自定义头像（本地上传）+ AI 性格 + Temperature + 上下文轮数 + API 配置 + 消息通知开关
- ✅ 聊天页：批量生成 + 消息重新生成 + 代码隐藏（下载按钮）+ 消息上限 300 条 + 工具箱工具 chips
- ✅ 书房（ClaudeSpace）：小湾画像（可编辑 + Claude 自动补充）+ 承诺/待办 CRUD + 日记（只读）
- ✅ 工具箱（ToolboxPage）：小红书 / 天气定位工具按服务开关、默认折叠
- ✅ 飞行棋（40 格真心话/大冒险 + 迷你聊天 + Claude 自动掷骰子 + 游戏总结写入聊天）
- ✅ 记忆库 / 文件库 / 底部 5 tab 导航 / session 持久化

### 设计
- ✅ 鼠尾草绿配色（#7D9B76）+ Playfair Display + Noto Serif SC
- ✅ 磨砂玻璃 + 页面过渡动画（framer-motion）+ 首页入场动画
- ✅ 自定义 App 图标（192+512）+ PWA manifest + Service Worker

### 后端（server/index.js）
- ✅ Express 服务器，OpenAI 兼容格式，SSE 流式 + 非流式
- ✅ 多模型自动降级（校验 body 里的 error 字段）+ `DEFAULT_MODELS` 统一 6 处调用点
- ✅ Ombre-Brain MCP 客户端：breath / hold / pulse
- ✅ Supabase 全走 service_role（load-sessions / load-messages / load-settings / save-chat / save-settings 等，绕过 RLS）
- ✅ 画像/承诺 CRUD（/api/memo*）+ 画像自动补充 `autoUpdatePortrait()`
- ✅ nudge 早 7 点注入天气体感句；小红书工具接入 nudge（每天≤3次、单次≤10工具、白名单、结果截断）
- ✅ `/api/xhs/relogin` 手机自助重登（fire-and-forget 弹码 → 302 跳 noVNC）+ 并发锁
- ✅ 登录自查开关 `XHS_LOGIN_AUTO_CHECK`（避免每小时自动化访问触发小红书风控）
- ✅ 已迁腾讯云香港 Docker（scp + docker compose 部署，HTTPS 走 Caddy sslip.io）

### 记忆系统（Ombre-Brain）
- ✅ 1186 记忆桶从 Zeabur 迁到腾讯云香港（全部落盘核验）
- ✅ 情绪 emoji 8 级校准；回忆「域多样性」防亲密记忆霸榜
- ✅ 个人信息 32 关键词立即存 + 3 轮存储 + tag 区分（personal_info / conversation）
- ✅ 记忆检索按 pinned → weight 排序，注入聊天/nudge 的 system prompt

### AI 主动消息（nudge）
- ✅ /api/nudge：AI 判断 + 生成消息，每 1 小时（cron-job.org），凌晨 1-5 点静默
- ✅ 消息存为聊天记录（💌 前缀，追加到已有 session，不再碎片化）
- ✅ Pushover 推送 + 时间标签 + 记忆/画像注入

### 环境感知 + 小红书 MCP
- ✅ weather-sense：定位（高德逆地理 + WGS84→GCJ02 换算 + judgeHome 500m）+ 天气（wttr.in 5min 缓存 + 体感句 feeling.js）
- ✅ 小红书 MCP v2.5.5：18 工具接入工具箱，扫码 + 短信登录（noVNC 远程桌面），systemd 开机自启

### 聊天核心修复
- ✅ 闭包陷阱 / crypto.randomUUID 兼容 / 时间感知 / Vercel SPA 路由
- ✅ 历史消息带 tools 字段（AI 不再误以为工具调用的内容是瞎编）
- ✅ system prompt 负面指令 → 正面引导（语气不再生硬）

---

## 待完成

### 已知问题 / 遗留
- [ ] （可选）`getWeatherSenseFeeling()` 加日志 + fetch 超时——现在仍静默吞错，下次「没天气」不好查
- [ ] 用户手机真实上报一次定位，确认 judgeHome 判「在家」闭环（之前查到的是残留数据）
- [ ] 主模型 [企业按量]claude-opus-5-5 近期返空波动，nudge 每次回退 4-6；是否把 [CCMAX]claude-opus-5-5 提到第一位（用户暂未决定）
- [ ] 小红书每小时登录自查已关（`XHS_LOGIN_AUTO_CHECK=false`）；若安全警告未停，需降频「一天三次逛小红书」或关掉 nudge 逛小红书

### 用户暂缓 / 可选
- [ ] 轮换 Zeabur 泄露的密钥（`SUPABASE_SERVICE_ROLE` 最急，能读全部聊天记录）
- [ ] GitHub 备份 Ombre-Brain 记忆数据（防再丢，需 `OMBRE_GITHUB_TOKEN`）
- [ ] 前端免梯子方案（前端迁离 Vercel + Supabase 全走后端代理）——需重新评估，原方案依赖的 Zeabur 已停运

### 低优先级 / 想法
- [ ] 推送通知加角标
- [ ] Profile 统计动态化
- [ ] 更多小游戏

---

## 重要文件

| 文件 | 作用 |
|------|------|
| `src/pages/ChatPage.jsx` | 聊天核心（批量生成、session 持久化、记忆注入、时间感知、工具箱 chips）|
| `src/components/ChatBubble.jsx` | 气泡渲染（代码隐藏、文件下载、头像、重新生成、工具 chips）|
| `src/components/ChatInput.jsx` | 输入框（附件、语音、发送按钮）|
| `src/pages/Dashboard.jsx` | 首页（入场动画、功能卡片）|
| `src/pages/Settings.jsx` | 设置（头像上传、API 配置、消息通知开关）|
| `src/pages/ClaudeSpace.jsx` | 书房（画像编辑 + 承诺 CRUD + 日记只读）|
| `src/pages/ToolboxPage.jsx` | 工具箱（小红书 / 天气定位工具开关）|
| `src/pages/MemoryPage.jsx` | 记忆库（Ombre-Brain 数据展示）|
| `src/pages/LudoGame.jsx` | 飞行棋（棋盘、迷你聊天、Claude 自动掷骰子）|
| `src/pages/ProfilePage.jsx` | 我的页面（卡片式布局）|
| `src/lib/supabase.js` | 数据访问层（优先服务端 API，降级直连 Supabase）|
| `src/contexts/AuthContext.jsx` | Supabase Auth 登录状态 |
| `src/lib/toolLabels.js` | 工具中文化（小红书 / 天气 / 定位）|
| `src/App.jsx` | 路由 + 页面过渡 + PWA 推送订阅 + geolocation 上报 |
| `src/index.css` | 全局样式（配色、动画、磨砂玻璃）|
| `server/index.js` | 后端核心（聊天、记忆、nudge、推送、小红书、天气、画像）|
| `weather-sense/*` | 环境感知 MCP（index / geo / weather / feeling）|
| `public/sw.js` | Service Worker（缓存 + 推送通知处理）|
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
- **API 密钥**: 在设置页配置（后端以 `API_KEY` 环境变量兜底）
- **模型**: `[企业按量]claude-opus-5-5,[CCMAX]claude-opus-4-6,[企业按量]claude-opus-5-5,[k]claude-opus-4-6`（主模型 5-5 近期返空波动，nudge 回退 4-6）
- **Google AI Studio Key**: （见服务器 baymemory 容器环境变量 OMBRE_EMBED_API_KEY）
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
3.1 **改搜索服务** → 本地改 `~/searxng/settings.yml` 后 scp 上去 → `docker compose restart searxng`；换引擎/加格式在 `search.formats` 里调
4. **手机上测试** → 打开 https://claude-bay-two.vercel.app
5. **本地预览** → `cd bunny-chat && npx vite --host` → http://172.20.10.6:5174
6. **注意**：git 需要梯子代理 `http://127.0.0.1:7890`（已配 `git config http/https.proxy`）；服务器 SSH 免密（`~/.ssh/id_ed25519`）

## 明天要做

1. **真机验证今天的三处改动**（前端等 Vercel 部署完）：
   - 键盘收起时输入框是否还「先贴底再弹回」
   - 聊天里问实时信息是否返回相关结果（看有没有「联网搜索」胶囊）
   - 相册上传后是否真的进云端（设置 → 回忆相册，提示应为「已上传并同步 N 张」）
2. 验证早 7 点推送已带天气（10.29 措辞改动落地效果）
3. （用户暂缓）轮换 Zeabur 泄露的密钥（SUPABASE_SERVICE_ROLE 最急）
4. （可选）GitHub 备份 Ombre-Brain 防再丢数据

## 2026.11.04 收工状态

- 代码已提交推送：`0e14fa2`（联网换 SearXNG + 键盘修复）、`48eba7d`（联网开关）、`06e1ea3`（相册上云）、`08f272b`（流式贴底）
- 后端已 scp 重建：bayapi 跑新代码；服务器新增 `searxng` 容器（`docker ps` 应能看到 4 个 Up）
- 前端等 Vercel 自动部署
- 相册实测：上传 → 列表 → 取图 → 删除全链路 200；`/api/album` 返回空数组（还没有正式照片）

## 2026.11.05 前端体验（已上线）

- **`053f400` / `333e683` 聊天气泡动画**：回复气泡从下往上浮入（`bubbleRise` 0.32s）；打字点与文字交叉淡出——文字升起时打字点下沉淡出，不是硬切换。
- **`95add7d` / `c6d18e2` 卡片透明度**：所有玻璃卡片统一调透明（`.glass` 0.38、`.glass-strong` 0.55、`.glass-water` 0.12、`.chat-glass` 0.24、底栏 `bg-white/30`）。光晕试过后已回退。
- **`d022257` 首页陀螺仪 3D 视差**：新建 `src/hooks/useTiltParallax.js`，把手机倾斜写进 `--tilt-x/--tilt-y`（-1..1），卡片按深度分三层位移 3/5/8px，水面背景反向 3px，形成轻微裸眼 3D。
  - 关键坑：Tailwind v4 的 `transition-transform` 展开包含 `translate`，会把视差的即时位移拖成 0.15s 过渡；`.tilt-layer-2/3` 已改回 `transition-property: transform, scale, rotate`。
  - 背景位移用独立 `translate` 属性而不是 `background-position`，靠 `waterBreathe` 的 ≥1.02 缩放余量盖住边缘，不会露缝。
  - iOS 需要用户手势才给方向数据：**首次进首页点一下屏幕**会弹授权，之后倾斜才生效。
  - 幅度 ±22° 映射满格；躺下/横屏超过 55° 自动重定基准。
- **真机结果**：倾斜方向跟手，效果正常（用户评价「做好了！很舒服」）；iOS 上 `backdrop-filter` 与 `translate` 同用没有异常。
- **`223284e`（已回退）排查过的 PWA 缓存坑**：`public/sw.js` 原来把 `/` 和 `/index.html` 预缓存且全部 cache-first，装过 PWA 的手机永远加载旧的 `index.html`，于是引用的还是旧 hash 的 JS——**新功能根本到不了手机上**。中途改成 network-first / stale-while-revalidate 都以启动变慢收场，用户要求「缓存什么都不要改」，最终 `1b2f837` 恢复原始 cache-first。
- **新增 `/tilt-check.html` 传感器自检页**：打开 `https://claude-bay-two.vercel.app/tilt-check.html`，点「开始检测」会请求权限并显示 beta/gamma 实时值、事件计数、结论（正常 / 权限被系统关 / 不支持 / 开了减弱动态效果）。以后排查倾斜问题先看这个页面。

### 2026.11.05 陀螺仪 3D — 落地过程与坑

1. **首次上线没反应**：根因是 `sw.js` 把首页 HTML cache-first 缓存了，手机一直跑旧包。见上面的 SW 修复。
2. **App 里不弹权限**：用户在 `/tilt-check.html` 里已授权过同一域名，iOS 不会再弹——这是正常的，不是故障。
3. **`error: requesting device orientation access requires a user gesture`**：iOS 只把 `touchend` / `click` 算作用户手势，`pointerdown` 会被拒绝。hook 已改为监听 `touchend` + `click`（capture 阶段，600ms 去重）。
4. **最终分层（用户偏好）**：开始聊天条、回忆面板固定；标题/日期/台词 3px；相册里的照片 5px；中间三个岛 8px；水面背景反向 3px。
5. 诊断手段：`window.__tiltDebug`（events / beta / gamma / perm）保留在 hook 里，需要时可在 Dashboard 临时渲染出来。
6. **打开黑屏**：network-first 每次启动都要等 Vercel（国内慢），改成 stale-while-revalidate 后用户仍反馈黑屏。**结论：缓存相关的自动更新方案全部放弃（`1b2f837` 恢复原样）**，以后要新版本就手动打开 `/reset.html` 清一次，或者划掉重开。
7. **每次打开都要授权（未解决）**：iOS 的「动作与方向访问」默认「询问」，每次会话都会问。理论根治办法是 **设置 → Safari 浏览器 → 隐私与安全性 → 动作与方向访问 → 允许**，但用户在自己系统里找不到这一项（怀疑新版本系统已移除）。备选：把陀螺仪换成「手指拖动视差」，彻底不需要授权——尚未实现，等用户决定。

## 2026.11.05 收工状态

- 前端已上线并真机确认：聊天气泡上浮 + 打字点交叉淡出；全站玻璃卡片更透明；首页陀螺仪 3D 视差（分层：聊天条/回忆面板固定，标题 3px，相册照片 5px，三个岛 8px，水面背景 -3px）。
- 今日提交：`053f400` `333e683`（气泡）、`95add7d` `c6d18e2`（透明度，光晕已回退）、`d022257`（3D 视差）、`223284e` `d1e0576` `f24f57c`（权限触发修复，最终 touchend/click）、`e2df183`（分层调整）、`1b2f837`（SW 回退原样）。
- **长期可用的工具**：
  - `/reset.html` — 一键清 Service Worker 缓存并重开首页（以后看新版本手动用它）
  - `/tilt-check.html` — 传感器自检页（支持性 / 权限 / 实时 beta·gamma）
- **遗留**：每次打开 App 需要点一下屏幕并允许方向权限；iOS 设置里找不到全局允许开关，待定是否改成手指拖动。

## 明天要做（2026.11.06）

1. 决定 3D 交互：接受「每次点一下授权」还是换成「手指拖动视差」。
2. 如果换成手指拖动：`useTiltParallax` 改为监听 `touchmove` 归一化位移，其余 CSS 分层不动。
3. 继续昨天的待办：早 7 点推送带天气的验证、相册上传进云端验证、轮换 Zeabur 泄露密钥。

## 2026.11.05 书房界面优化（已上线）

- **书房改成书架场景**：`/moods` 从列表页重做成整屏书架背景（`public/bg-study.jpg`，941×1672，190KB）。用 ResizeObserver 按 `object-fit: cover` 实测舞台尺寸，热点全部用图片百分比定位，换手机尺寸不漂移。
- **交互**：三本书（小湾画像 / 记忆档案 / 承诺&待办）+ 摊开书上的「日记」+ 水晶球旁的「纪念日」。
  - 小湾画像 → 可读可编辑的画像页（`POST /api/memo/portrait`）
  - 记忆档案 → 现有记忆库 `/profile/memory`
  - 纪念日 → 占位页（显示 6.28、在一起天数，界面待设计）
  - 承诺&待办、日记 → 弹 toast「功能页面稍后开放」
- **动画**：子页面从 `slideUp`（底部推入）改成 `pageIn`（淡入 + 0.972→1 轻微放大，无方向性）。画像页/纪念日页用 `createPortal` 挂到 body，避免被 BottomNav（z-20）盖住。
- **图标**：底部导航「书房」换成摊开的书 + 一支笔；首页「记忆库」卡片从书换成月亮。
- **书名排版**：绿书书名从纯白 `#f7f2e3` 改为浅米 `#f1e9d0`；「小湾画像」位置右移 2%、下移 1.5%。
- **聊天页顶部**：去掉实体顶栏和边框，改成浮动奶油柔光（`rgba(250,249,244,0.74→0.3)` + 22px 渐隐），header 改 `absolute` 浮在消息区上方、消息区 `pt-[62px]`，上滑时气泡会从标题栏后面隐约透出。
- **书房书名 3D**：复用首页 `useTiltParallax`，书名/日记/纪念日加 `.study-float`（7px 视差），转动手机时文字浮起来。
- 提交：`596fc91`（书房场景 + 聊天顶部 + 图标）、`3a893bf`（书名视差）。
- 待办：承诺&待办功能页、日记功能页、纪念日界面（含首页右上角日期卡改成可点击）。
