const CACHE_NAME = 'bunny-chat-v3'

const PRECACHE_URLS = [
  '/',
  '/index.html',
]

// Install — precache shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // A flaky network must not break the install; the runtime handler fills
      // any gap on the next navigation.
      return Promise.all(PRECACHE_URLS.map((url) => cache.add(url).catch(() => {})))
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

// Fetch — network-first for pages, cache-first for hashed assets
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // Skip cross-origin and API calls
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) {
    return
  }

  // Page navigations: serve the cached shell instantly, then refresh it in the
  // background. Network-first made every launch wait for the (slow, in China)
  // Vercel origin. Stale-while-revalidate keeps launches instant and the next
  // launch still picks up a deploy.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cached = await caches.match('/index.html')
        const network = fetch(event.request)
          .then((response) => {
            if (response.ok) {
              const clone = response.clone()
              caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', clone))
            }
            return response
          })
          .catch(() => null)
        return cached || (await network) || caches.match('/index.html')
      })()
    )
    return
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetched = fetch(event.request).then((response) => {
        if (response.ok && event.request.method === 'GET') {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone)
          })
        }
        return response
      })

      return cached || fetched
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
