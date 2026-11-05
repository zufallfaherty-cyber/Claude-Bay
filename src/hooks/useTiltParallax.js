import { useEffect } from 'react'

// Feeds the phone's tilt into two CSS variables (--tilt-x / --tilt-y, both
// -1..1). Home cards read them to drift a few px relative to the water
// background, which reads as a gentle "glasses-free 3D" parallax.
//
// iOS needs a user gesture before it will hand out orientation data, so the
// permission prompt is attached to the next tap on the home screen.
const FULL_TILT_DEG = 22 // physical tilt that maps to a full parallax unit
const EASE = 0.09

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

export default function useTiltParallax() {
  useEffect(() => {
    if (typeof window === 'undefined' || !window.DeviceOrientationEvent) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

    const root = document.documentElement
    let stopped = false
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

    const attach = () => {
      if (!stopped) window.addEventListener('deviceorientation', onOrient, true)
    }
    const requestOnTap = () => {
      window.removeEventListener('pointerdown', requestOnTap, true)
      if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        // The tap may also navigate away, so guard against attaching after
        // the effect has already cleaned up.
        DeviceOrientationEvent.requestPermission()
          .then((state) => { if (state === 'granted') attach() })
          .catch(() => {})
      } else {
        attach()
      }
    }

    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      window.addEventListener('pointerdown', requestOnTap, true)
    } else {
      attach()
    }

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
