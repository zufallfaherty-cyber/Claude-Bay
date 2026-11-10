const CACHE_NAME = 'bunny-chat-v3'

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
      .catch(() => caches.match(event.request))
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
