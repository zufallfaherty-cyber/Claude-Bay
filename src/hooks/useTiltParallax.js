import { useEffect } from 'react'

// Feeds the phone's tilt into two CSS variables (--tilt-x / --tilt-y, both
// -1..1). Home cards read them to drift a few px relative to the water
// background, which reads as a gentle "glasses-free 3D" parallax.
//
// iOS only hands out orientation data after a user gesture asks for it, so the
// listener is attached right away (Android and already-granted iOS start
// sending immediately) and every tap retries requestPermission until data
// actually arrives. Retrying matters because the first tap usually also
// navigates, which would otherwise cancel a pending request for good.
const FULL_TILT_DEG = 22 // physical tilt that maps to a full parallax unit
const EASE = 0.09

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

export default function useTiltParallax() {
  useEffect(() => {
    if (typeof window === 'undefined' || !window.DeviceOrientationEvent) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

    const root = document.documentElement
    let stopped = false
    let gotData = false
    let raf = 0
    let curX = 0
    let curY = 0
    let targetX = 0
    let targetY = 0
    let baseBeta = null
    let baseGamma = null

    const tick = () => {
      raf = 0
      curX += (targetX - curX) * EASE
      curY += (targetY - curY) * EASE
      const settled = Math.abs(targetX - curX) < 0.001 && Math.abs(targetY - curY) < 0.001
      if (settled) {
        curX = targetX
        curY = targetY
      }
      root.style.setProperty('--tilt-x', curX.toFixed(4))
      root.style.setProperty('--tilt-y', curY.toFixed(4))
      if (!settled) raf = requestAnimationFrame(tick)
    }
    const kick = () => { if (!raf) raf = requestAnimationFrame(tick) }

    const onOrient = (e) => {
      if (e.beta == null || e.gamma == null) return
      if (!gotData) gotData = true
      if (baseBeta === null) { baseBeta = e.beta; baseGamma = e.gamma }
      // Re-centre after a big posture change (lying down, switching orientation)
      if (Math.abs(e.beta - baseBeta) > 55 || Math.abs(e.gamma - baseGamma) > 55) {
        baseBeta = e.beta
        baseGamma = e.gamma
      }
      targetX = clamp((e.gamma - baseGamma) / FULL_TILT_DEG, -1, 1)
      targetY = clamp((e.beta - baseBeta) / FULL_TILT_DEG, -1, 1)
      kick()
    }

    // Attach immediately: harmless before permission is granted, and it means
    // Android (and iOS that was already allowed) just works.
    window.addEventListener('deviceorientation', onOrient, true)

    const requestOnTap = () => {
      if (stopped || gotData) return
      if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        // Already granted → resolves immediately without a prompt; still
        // pending → shows the iOS dialog.
        DeviceOrientationEvent.requestPermission().catch(() => {})
      } else {
        gotData = true
      }
    }
    window.addEventListener('pointerdown', requestOnTap, true)

    return () => {
      stopped = true
      if (raf) cancelAnimationFrame(raf)
      window.removeEventListener('deviceorientation', onOrient, true)
      window.removeEventListener('pointerdown', requestOnTap, true)
      root.style.removeProperty('--tilt-x')
      root.style.removeProperty('--tilt-y')
    }
  }, [])
}
