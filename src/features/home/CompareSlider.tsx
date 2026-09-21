import { useEffect, useRef, useState } from 'react'
import { asset, cssVars, prefersReducedMotion } from './utils'

export function CompareSlider() {
  const [position, setPosition] = useState(prefersReducedMotion() ? 50 : 96)
  const rootRef = useRef<HTMLDivElement>(null)
  const touched = useRef(false)

  useEffect(() => {
    const el = rootRef.current
    if (!el || prefersReducedMotion()) return
    let frame = 0
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        io.disconnect()
        const t0 = performance.now()
        const tick = (now: number) => {
          if (touched.current) return
          const k = Math.min(1, (now - t0) / 1800)
          setPosition(96 - 46 * (1 - Math.pow(1 - k, 3)))
          if (k < 1) frame = requestAnimationFrame(tick)
        }
        frame = requestAnimationFrame(tick)
      },
      { threshold: 0.6 },
    )
    io.observe(el)
    return () => {
      io.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <div
      ref={rootRef}
      className="hp-cmp hp-rv"
      style={cssVars({ '--d': '.15s', '--pos': `${position}%`, '--hp-cmp-img': `url(${asset('field-contrast.jpg')})` })}
    >
      <div className="hp-layer" />
      <div className="hp-layer hp-heat" />
      <span className="hp-cap hp-l">Ảnh chụp thường</span>
      <span className="hp-cap hp-r">Bản đồ sức khỏe (minh hoạ)</span>
      <div className="hp-handle"><span aria-hidden="true">⇄</span></div>
      <div className="hp-legend">
        <span><i style={{ background: '#2e9b62' }} />Khỏe</span>
        <span><i style={{ background: '#e2a927' }} />Theo dõi</span>
        <span><i style={{ background: '#d0523a' }} />Cần kiểm tra</span>
      </div>
      <input
        type="range"
        min={4}
        max={96}
        step={0.5}
        value={position}
        aria-label="So sánh ảnh chụp thường và bản đồ sức khỏe"
        onChange={(event) => {
          touched.current = true
          setPosition(Number(event.target.value))
        }}
      />
    </div>
  )
}
