// 小红书 MCP 工具的中文直白名称（工具箱 + 聊天工具提示共用）
const TOOL_META = {
  check_login_status:    { label: '检查登录状态', desc: '看小红书登录是否还有效' },
  delete_cookies:        { label: '退出登录',     desc: '清除当前登录状态' },
  favorite_feed:         { label: '收藏笔记',     desc: '收藏一篇笔记' },
  get_feed_detail:       { label: '查看笔记详情', desc: '看某篇笔记的完整内容' },
  get_login_qrcode:      { label: '获取登录二维码', desc: '生成扫码登录的二维码' },
  get_my_profile:        { label: '查看我的主页', desc: '看自己的小红书主页' },
  get_unread_count:      { label: '查未读消息',   desc: '看未读消息数量' },
  like_feed:             { label: '点赞笔记',     desc: '给一篇笔记点赞' },
  like_notification:     { label: '点赞通知',     desc: '给一条通知点赞' },
  list_feeds:            { label: '刷推荐笔记',   desc: '获取推荐流的笔记列表' },
  list_notifications:    { label: '看通知列表',   desc: '查看收到的通知' },
  post_comment_to_feed:  { label: '评论笔记',     desc: '在一篇笔记下评论' },
  publish_content:       { label: '发布图文笔记', desc: '发布一篇图文笔记' },
  publish_with_video:    { label: '发布视频笔记', desc: '发布一篇带视频的笔记' },
  reply_comment_in_feed: { label: '回复评论',     desc: '回复笔记下的某条评论' },
  reply_notification:    { label: '回复通知',     desc: '回复一条通知' },
  search_feeds:          { label: '搜索笔记',     desc: '按关键词搜小红书笔记' },
  user_profile:          { label: '看用户主页',   desc: '看某个用户的主页' },
  // ── 环境感知（weather-sense）──
  get_weather:           { label: '查天气',       desc: '查询此刻天气的具体数字，以及今天接下来的天气（会不会降温、下雨、出太阳）' },
  get_location:          { label: '查位置',       desc: '查她此刻的位置（在家还是外面）' },
}

// 后端返回的工具名可能是 "server__tool" 命名空间形式，先取最后一段
export function toolMeta(name) {
  const short = String(name || '').split('__').pop()
  return TOOL_META[short] || { label: short, desc: '' }
}
