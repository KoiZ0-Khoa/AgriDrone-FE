import { useEffect, useRef, useState } from 'react'
import { asset, prefersReducedMotion } from './utils'

const FEATURES = [
  { title: 'Nông trại & Khu vực', text: 'Tạo nông trại, chia khu vực, lưu trữ và khôi phục khi cần mà vẫn giữ nguyên lịch sử.', ready: true, image: 'field-rows.jpg', alt: 'Ruộng chia khu nhìn từ trên cao', caption: '4 khu · 14,4 ha' },
  { title: 'Phân công thành viên', text: 'Giao Manager hoặc Worker cho cả nông trại hay từng khu vực, thu hồi bất cứ lúc nào.', ready: true, image: 'sprayers.jpg', alt: 'Đội máy làm việc trên cánh đồng', caption: 'Manager · Worker' },
  { title: 'Nhiệm vụ bay', text: 'Lập kế hoạch, giao nhiệm vụ cho drone và theo dõi từng chuyến bay khảo sát.', ready: false, image: 'drone-spray.jpg', alt: 'Drone bay phun trên ruộng', caption: 'Lộ trình tự động' },
  { title: 'Duyệt kết quả AI', text: 'Xem kết quả kiểm tra sức khỏe cây trồng và xác nhận trước khi hành động.', ready: false, image: 'field-contrast.jpg', alt: 'Ảnh trên cao hai loại cây trồng', caption: 'Xác nhận trước khi hành động' },
]

const AUTOPLAY_MS = 7000

export function FeatureTabs() {
  const [current, setCurrent] = useState(0)
  const [paused, setPaused] = useState(false)
  const [visible, setVisible] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.4 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    if (!visible || paused || prefersReducedMotion()) return
    const timer = window.setTimeout(() => setCurrent((i) => (i + 1) % FEATURES.length), AUTOPLAY_MS)
    return () => window.clearTimeout(timer)
  }, [current, visible, paused])

  const active = FEATURES[current]

  return (
    <div ref={rootRef} className={`hp-tabs hp-rv${paused ? ' hp-paused' : ''}`}>
      <div className="hp-tab-list">
        {FEATURES.map((feature, i) => (
          <div key={feature.title} className={`hp-tab${i === current ? ' hp-open' : ''}`}>
            <h3 className="hp-tab-h">
              <button
                className="hp-tab-btn"
                type="button"
                aria-expanded={i === current}
                aria-controls={`hp-feature-${i}`}
                onClick={() => {
                  setCurrent(i)
                  setPaused(true)
                }}
              >
                <span className="hp-num">{String(i + 1).padStart(2, '0')}</span>
                <span className="hp-tab-title">{feature.title}</span>
                <span className="hp-chev" aria-hidden="true">
                  <svg className="hp-i" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" /></svg>
                </span>
              </button>
            </h3>
            <div className="hp-tab-body" id={`hp-feature-${i}`} inert={i !== current}>
              <div>
                <p>{feature.text}</p>
                <span className={`hp-tag${feature.ready ? '' : ' hp-soon'}`}>{feature.ready ? 'Đã sẵn sàng' : 'Sắp ra mắt'}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="hp-tab-media">
        {FEATURES.map((feature, i) => (
          <img key={feature.image} className={i === current ? 'hp-on' : undefined} src={asset(feature.image)} alt={i === current ? feature.alt : ''} loading="lazy" />
        ))}
        <div className="hp-tab-cap" aria-live="polite">
          <span><i className="hp-dot" style={{ background: 'var(--forest)' }} />{active.title}</span>
          <small>{active.caption}</small>
        </div>
      </div>
    </div>
  )
}
