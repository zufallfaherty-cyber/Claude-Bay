const CACHE_NAME = 'bunny-chat-v5'

const PRECACHE_URLS = [
  '/',
  '/index.html',
]

// Install — precache shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS)
    })
  )
  self.skipWaiting()
})

// Activate — clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    })
  )
  self.clients.claim()
})

// Fetch — network-first everywhere (离线时回退缓存)
// 改成 network-first 之前是 cache-first：每次部署后第一次打开仍是旧版，
// HTML 和带 hash 的 JS 容易新旧混用，出现样式/字体错乱。现在永远先拿新文件。
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // Skip API calls
  if (url.pathname.startsWith('/api/')) {
    return
  }
  if (event.request.method !== 'GET') return

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone)
          })
        }
        return response
      })
      // 网络失败时：先找缓存；缓存也没有时绝不能返回 undefined，
      // 否则 respondWith 会抛 TypeError，整页直接白屏。
      .catch(async () => {
        const cached = await caches.match(event.request)
        if (cached) return cached
        // 导航请求：退回缓存的首页外壳（离线也能看到界面）
        if (event.request.mode === 'navigate') {
          const shell = (await caches.match('/index.html')) || (await caches.match('/'))
          if (shell) return shell
          return new Response(
            '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
            '<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#F7F5F2;font:15px/1.7 -apple-system,PingFang SC,sans-serif;color:#3D3A38;text-align:center">' +
            '<div><p style="font-size:32px;margin:0 0 10px">🌿</p><p style="margin:0 0 16px">网络好像断了，暂时连不上</p>' +
            '<button onclick="location.reload()" style="border:0;border-radius:999px;background:#6E8C64;color:#fff;padding:10px 22px;font-size:14px">再试一次</button></div></body>',
            { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          )
        }
        // 其他资源（JS/CSS/图片）：返回 503，让浏览器明确失败而不是把错误藏起来
        return new Response('', { status: 503, statusText: 'offline' })
      })
  )
})

// ── Push Notifications ──
self.addEventListener('push', (event) => {
  if (!event.data) return
  try {
    const data = event.data.json()
    event.waitUntil(
      self.registration.showNotification(data.title || 'Claude', {
        body: data.body || '',
        icon: '/icons/icon-192.jpg',
        badge: '/icons/icon-192.jpg',
        vibrate: [200, 100, 200],
        tag: 'claude-nudge',
        renotify: true,
      })
    )
  } catch { /* ignore */ }
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes('/chat') && 'focus' in client) {
          return client.focus()
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/chat')
      }
    })
  )
})
