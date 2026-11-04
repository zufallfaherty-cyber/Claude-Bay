// ── 回忆相册 ──
// Photos live in Supabase Storage (via the bayapi server); when the server is
// unreachable (local dev / offline) we fall back to localStorage so the UI still
// works and nothing is lost on this device.

const API_BASE = 'https://124-156-142-6.sslip.io'
const LS_KEY = 'bunny_album_photos'

// Photos are proxied through bayapi; make the relative URL absolute for the browser.
const normalize = (p) => (p && String(p.url).startsWith('/api/') ? { ...p, url: API_BASE + p.url } : p)

function readLocal() {
  try {
    const list = JSON.parse(localStorage.getItem(LS_KEY) || '[]')
    return Array.isArray(list) ? list : []
  } catch { return [] }
}

function writeLocal(list) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(list)) } catch {}
}

async function api(path, options = {}) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 4500)
  try {
    const res = await fetch(`${API_BASE}${path}`, { ...options, signal: ctrl.signal })
    const json = await res.json()
    return json
  } finally {
    clearTimeout(timer)
  }
}

// Compress + orient before uploading: keeps Storage and localStorage small.
export function compressImage(file, maxSide = 1400, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
      const cw = Math.round(img.width * scale)
      const ch = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = cw
      canvas.height = ch
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, cw, ch)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e) }
    img.src = url
  })
}

export async function loadAlbum() {
  try {
    const json = await api('/api/album')
    if (Array.isArray(json?.photos)) {
      const remote = json.photos.map(normalize)
      // Keep photos uploaded while offline; they'll show until the server gets them.
      const localOnly = readLocal().filter(
        (p) => p.local && !remote.some((s) => s.id === p.id)
      )
      const merged = [...localOnly, ...remote]
      writeLocal(merged)
      return merged
    }
  } catch {}
  return readLocal()
}

// Returns { photo, synced }. synced=false means it only lives on this device.
export async function uploadPhoto(dataUrl, meta = {}) {
  try {
    const json = await api('/api/album', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: dataUrl, ...meta }),
    })
    if (json?.ok && json.photo) {
      const photo = normalize(json.photo)
      const list = [photo, ...readLocal().filter((p) => p.id !== photo.id)]
      writeLocal(list)
      return { photo, synced: true }
    }
  } catch {}

  const photo = {
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    url: dataUrl,
    title: meta.title || '',
    date: meta.date || '',
    created: new Date().toISOString(),
    local: true,
  }
  writeLocal([photo, ...readLocal()])
  return { photo, synced: false }
}

export async function updatePhoto(id, patch) {
  if (!String(id).startsWith('local-')) {
    try {
      const json = await api(`/api/album/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (json?.ok && json.photo) {
        const photo = normalize(json.photo)
        writeLocal(readLocal().map((p) => (p.id === id ? photo : p)))
        return photo
      }
    } catch {}
  }
  let updated = null
  writeLocal(readLocal().map((p) => {
    if (p.id !== id) return p
    updated = { ...p, ...patch }
    return updated
  }))
  return updated
}

export async function deletePhoto(id) {
  if (!String(id).startsWith('local-')) {
    try { await api(`/api/album/${encodeURIComponent(id)}`, { method: 'DELETE' }) } catch {}
  }
  writeLocal(readLocal().filter((p) => p.id !== id))
}
