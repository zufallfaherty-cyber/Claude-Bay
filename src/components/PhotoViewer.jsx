import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { updatePhoto, deletePhoto } from '../lib/album'

export default function PhotoViewer({ photo, onClose, onSaved, onDeleted }) {
  const [title, setTitle] = useState(photo?.title || '')
  const [date, setDate] = useState(photo?.date || '')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const sample = !!photo?.sample

  useEffect(() => {
    setTitle(photo?.title || '')
    setDate(photo?.date || '')
    setSaved(false)
  }, [photo])

  if (!photo) return null

  const handleSave = async () => {
    if (sample) return
    setBusy(true)
    const updated = await updatePhoto(photo.id, { title: title.trim(), date })
    setBusy(false)
    setSaved(true)
    if (updated) onSaved?.(updated)
    setTimeout(() => setSaved(false), 1600)
  }

  const handleDelete = async () => {
    if (sample) return
    if (!confirm('删除这张照片吗？')) return
    setBusy(true)
    await deletePhoto(photo.id)
    setBusy(false)
    onDeleted?.(photo.id)
    onClose?.()
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-[#20261d]/55 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full sm:max-w-sm max-h-[92vh] bg-[#F7F5F2] rounded-t-[28px] sm:rounded-[28px] overflow-hidden shadow-[0_-10px_40px_rgba(30,40,25,0.25)] flex flex-col animate-[slideUp_0.28s_ease-out]">
        <div className="relative bg-[#20261d]">
          <img src={photo.url} alt={photo.title || '回忆'} className="w-full max-h-[52vh] object-contain" />
          <button
            onClick={onClose}
            aria-label="关闭"
            className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/35 text-white flex items-center justify-center backdrop-blur-md active:scale-90 transition-transform"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="px-6 pt-5 pb-[calc(env(safe-area-inset-bottom,0px)+20px)]">
          {sample ? (
            <p className="text-[12px] text-warm-gray leading-relaxed">
              这是相册的示例封面。去「我的 → 设置 → 回忆相册」上传你们自己的照片，就能在这里命名和写日期了。
            </p>
          ) : (
            <>
              <label className="block text-[10px] tracking-[0.2em] text-warm-gray/60 uppercase mb-1.5">名字</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="给这张照片取个名字"
                maxLength={40}
                className="w-full px-4 py-3 bg-white rounded-xl text-[14px] text-warm-dark border border-warm-line/60 outline-none focus:border-sage/50 transition-colors"
              />

              <label className="block text-[10px] tracking-[0.2em] text-warm-gray/60 uppercase mt-4 mb-1.5">日期</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-4 py-3 bg-white rounded-xl text-[14px] text-warm-dark border border-warm-line/60 outline-none focus:border-sage/50 transition-colors"
              />

              <div className="flex items-center gap-3 mt-5">
                <button
                  onClick={handleSave}
                  disabled={busy}
                  className="flex-1 h-11 rounded-2xl bg-sage-deep text-white text-[13px] tracking-[0.08em] active:scale-[0.98] transition-transform disabled:opacity-60"
                >
                  {busy ? '保存中…' : saved ? '已保存 ✓' : '保存'}
                </button>
                <button
                  onClick={handleDelete}
                  disabled={busy}
                  className="h-11 px-4 rounded-2xl text-[12px] text-warm-gray border border-warm-line/70 active:scale-[0.98] transition-transform disabled:opacity-60"
                >
                  删除
                </button>
              </div>
              {photo.local && (
                <p className="text-[10px] text-warm-gray/55 mt-3 text-center">仅保存在这台设备（服务器相册尚未启用）</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
