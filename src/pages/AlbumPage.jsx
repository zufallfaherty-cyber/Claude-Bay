import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { loadAlbum } from '../lib/album'
import PhotoViewer from '../components/PhotoViewer'
import { SAMPLE_PHOTOS } from '../lib/albumSamples'

export default function AlbumPage() {
  const navigate = useNavigate()
  const [photos, setPhotos] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [active, setActive] = useState(null)

  useEffect(() => {
    let alive = true
    loadAlbum().then((list) => {
      if (!alive) return
      setPhotos(list)
      setLoaded(true)
    })
    return () => { alive = false }
  }, [])

  const shown = photos.length ? photos : SAMPLE_PHOTOS

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-3 shrink-0">
        <button
          onClick={() => navigate(-1)}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-warm-gray active:bg-white/40 transition-colors"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <div className="flex-1">
          <h2 className="text-[17px] tracking-[0.06em] text-warm-dark">回忆相册</h2>
          <p className="italic text-[10px] text-warm-gray/60" style={{ fontFamily: '"Playfair Display", serif' }}>
            Our Album
          </p>
        </div>
        <button
          onClick={() => navigate('/settings')}
          className="text-[11px] text-sage-deep flex items-center gap-1 px-2.5 py-1.5 rounded-full border border-sage/25 bg-white/40 active:scale-95 transition-transform"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          上传
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-6">
        {!loaded ? (
          <div className="h-40 flex items-center justify-center text-[12px] text-warm-gray/50">正在打开相册…</div>
        ) : (
          <>
            {!photos.length && (
              <p className="text-[11px] text-warm-gray/60 leading-relaxed mb-4 px-1">
                还没有上传照片，下面是示例封面。去「设置 → 回忆相册」上传后，就能在这里给每张照片命名和写日期。
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              {shown.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setActive(p)}
                  className="text-left active:scale-[0.97] transition-transform"
                >
                  <div className="aspect-[4/3] rounded-[14px] overflow-hidden border border-white/60 shadow-[0_4px_14px_-8px_rgba(60,80,50,0.35)] bg-mint/30">
                    <img src={p.url} alt={p.title || ''} className="w-full h-full object-cover" loading="lazy" />
                  </div>
                  <p className="text-[11px] text-warm-dark/85 mt-1.5 truncate px-0.5">{p.title || '未命名'}</p>
                  {p.date && <p className="text-[9px] text-warm-gray/60 mt-0.5 px-0.5 tracking-[0.05em]">{p.date}</p>}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {active && (
        <PhotoViewer
          photo={active}
          onClose={() => setActive(null)}
          onSaved={(updated) => setPhotos((list) => list.map((p) => (p.id === updated.id ? updated : p)))}
          onDeleted={(id) => setPhotos((list) => list.filter((p) => p.id !== id))}
        />
      )}
    </div>
  )
}
