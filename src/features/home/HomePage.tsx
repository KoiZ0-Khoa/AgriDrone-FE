import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { BrandMark } from '../../components/BrandMark'
import { useAuth } from '../auth/AuthContext'
import { CompareSlider } from './CompareSlider'
import { FeatureTabs } from './FeatureTabs'
import { FlightMap } from './FlightMap'
import { asset, cssVars, prefersReducedMotion } from './utils'
import '@fontsource/cormorant-garamond/300.css'
import '@fontsource/cormorant-garamond/300-italic.css'
import '@fontsource/cormorant-garamond/400.css'
import '@fontsource/cormorant-garamond/500.css'
import './home.css'

const NAV = [
  { id: 'giai-phap', label: 'Giải pháp' },
  { id: 'xem-thu', label: 'Xem thử' },
  { id: 'loi-ich', label: 'Lợi ích' },
  { id: 'quy-trinh', label: 'Quy trình' },
  { id: 'vai-tro', label: 'Vai trò' },
]

const MARQUEE = ['Quản lý nông trại và khu vực', 'Phân công Manager và Worker', 'Theo dõi nhiệm vụ bay', 'Duyệt kết quả AI trước khi hành động']

const HEADLINE: { text: string; em?: boolean }[] = [
  ...'Nhìn nông trại từ trên cao,'.split(' ').map((text) => ({ text })),
  ...'quyết định từ dưới đất.'.split(' ').map((text) => ({ text, em: true })),
]

const STEPS = [
  { title: 'Tạo nông trại', text: 'Khai báo nông trại, địa chỉ, diện tích và chia thành các khu vực.' },
  { title: 'Mời và phân công', text: 'Mời thành viên vào đơn vị rồi giao Manager, Worker cho đúng khu vực.' },
  { title: 'Bay khảo sát', text: 'Lên nhiệm vụ cho drone bay qua các khu vực và thu thập hình ảnh.' },
  { title: 'Duyệt và theo dõi', text: 'Kiểm tra kết quả AI, xác nhận và theo dõi xu hướng theo thời gian.' },
]

const ROLES = [
  { badge: 'Chủ đơn vị', title: 'Nắm toàn bộ nông trại', text: 'Người chịu trách nhiệm cao nhất của đơn vị.', items: ['Tạo, lưu trữ và khôi phục nông trại', 'Mời quản trị, đổi vai trò, chuyển quyền sở hữu', 'Phân công mọi vị trí trong nông trại'] },
  { badge: 'Quản trị đơn vị', title: 'Vận hành hằng ngày', text: 'Cánh tay phải của chủ đơn vị trong quản lý đội ngũ.', items: ['Chỉnh sửa thông tin nông trại', 'Mời và quản lý thành viên', 'Giao việc cho Manager và Worker'] },
  { badge: 'Thành viên', title: 'Làm đúng phần việc', text: 'Được giao làm Manager hoặc Worker theo từng nông trại.', items: ['Xem nông trại và khu vực được giao', 'Manager chỉnh sửa khu vực mình phụ trách', 'Nhận nhiệm vụ và cập nhật hiện trường'] },
]

const BENEFITS = [
  { title: 'Nhìn toàn cảnh', text: 'Tổng quan nông trại, khu vực và vận hành trong một màn hình.', icon: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M9 4v16" /></> },
  { title: 'Phân quyền rõ ràng', text: 'Mỗi vai trò chỉ thấy và làm đúng phần việc của mình.', icon: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></> },
  { title: 'Giữ nguyên lịch sử', text: 'Lưu trữ thay vì xóa, vẫn khôi phục được khi cần.', icon: <><path d="M12 8v5l3 2" /><circle cx="12" cy="12" r="9" /></> },
  { title: 'Không ghi đè nhầm', text: 'Sửa cùng lúc sẽ được cảnh báo xung đột, không mất thay đổi.', icon: <path d="M4 12l5 5L20 6" /> },
]

const Arrow = () => (
  <svg className="hp-i hp-arr" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
)
const Tick = () => (
  <svg className="hp-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12l5 5L20 6" /></svg>
)

export function HomePage() {
  const { session } = useAuth()
  const rootRef = useRef<HTMLDivElement>(null)
  const progressRef = useRef<HTMLDivElement>(null)
  const heroMediaRef = useRef<HTMLDivElement>(null)
  const stepsRef = useRef<HTMLOListElement>(null)
  const [scrolled, setScrolled] = useState(false)
  const [activeNav, setActiveNav] = useState(-1)
  const [stepsOn, setStepsOn] = useState(0)
  const [hud, setHud] = useState({ pct: 0, alt: 32, speed: 6.2, battery: 78 })

  useEffect(() => {
    const reduce = prefersReducedMotion()
    let ticking = false
    const update = () => {
      ticking = false
      const y = window.scrollY
      const max = document.documentElement.scrollHeight - window.innerHeight
      if (progressRef.current) progressRef.current.style.transform = `scaleX(${max > 0 ? y / max : 0})`
      setScrolled(y > 60)
      if (!reduce && heroMediaRef.current && y < window.innerHeight * 1.2) heroMediaRef.current.style.transform = `translate3d(0, ${y * 0.22}px, 0)`

      let current = -1
      NAV.forEach((item, i) => {
        const el = document.getElementById(item.id)
        if (el && el.getBoundingClientRect().top < window.innerHeight * 0.4) current = i
      })
      setActiveNav(current)

      const steps = stepsRef.current
      if (steps) {
        const rect = steps.getBoundingClientRect()
        const wide = window.innerWidth > 900
        const p = Math.min(1, Math.max(0, (window.innerHeight * 0.75 - rect.top) / (rect.height + 80)))
        const progress = wide ? Math.min(1, p * 1.25) : 0
        steps.style.setProperty('--p', String(progress))
        const items = Array.from(steps.children)
        setStepsOn(items.filter((el, i) => (wide ? p > 0.02 && progress > i / 3 - 0.02 : el.getBoundingClientRect().top < window.innerHeight * 0.7)).length)
      }
    }
    const onScroll = () => {
      if (!ticking) {
        ticking = true
        requestAnimationFrame(update)
      }
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  useEffect(() => {
    const items = rootRef.current?.querySelectorAll('.hp-rv') ?? []
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.setAttribute('data-in', '')
            io.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.15, rootMargin: '0px 0px -6% 0px' },
    )
    items.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    const tick = () =>
      setHud((prev) => {
        const pct = prev.pct >= 100 ? 8 : Math.min(100, Math.round(prev.pct + 6 + Math.random() * 5))
        return {
          pct,
          alt: 31 + Math.round(Math.random() * 3),
          speed: Number((5.8 + Math.random() * 0.9).toFixed(1)),
          battery: Math.max(31, 78 - Math.floor(pct * 0.35)),
        }
      })
    const start = window.setTimeout(tick, 1700)
    if (prefersReducedMotion()) return () => window.clearTimeout(start)
    const interval = window.setInterval(tick, 1600)
    return () => {
      window.clearTimeout(start)
      window.clearInterval(interval)
    }
  }, [])

  const lane = Math.min(9, 1 + Math.floor(hud.pct / 11.2))
  const primaryHref = session ? '/dashboard' : '/login'
  const primaryLabel = session ? 'Vào bảng điều khiển' : 'Đăng nhập để bắt đầu'

  return (
    <div className="home" ref={rootRef} id="top">
      <div className="hp-marquee" aria-hidden="true">
        <div className="hp-marquee-track">
          {Array.from({ length: 4 }).flatMap((_, r) =>
            MARQUEE.map((text) => (
              <span className="hp-marquee-item" key={`${r}-${text}`}>
                {text}
                <svg className="hp-i" viewBox="0 0 24 24" stroke="currentColor"><circle cx="12" cy="12" r="9" /><path d="M8 12.5l2.7 2.7L16 9.5" /></svg>
              </span>
            )),
          )}
        </div>
      </div>

      <header className={`hp-header${scrolled ? ' hp-scrolled' : ''}`}>
        <div className="hp-wrap hp-header-inner">
          <a className="hp-brand" href="#top" aria-label="AgriDrone - Về đầu trang"><BrandMark /></a>
          <nav className="hp-nav" aria-label="Điều hướng chính">
            {NAV.map((item, i) => (
              <a key={item.id} href={`#${item.id}`} className={i === activeNav ? 'hp-active' : undefined}>{item.label}</a>
            ))}
          </nav>
          <div className="hp-header-actions">
            {session ? (
              <Link className="hp-btn hp-btn-white" to="/dashboard">Vào bảng điều khiển</Link>
            ) : (
              <>
                <Link className="hp-btn hp-btn-ghost-light" to="/register">Đăng ký</Link>
                <Link className="hp-btn hp-btn-white" to="/login">Đăng nhập</Link>
              </>
            )}
          </div>
        </div>
        <div className="hp-progress" ref={progressRef} />
      </header>

      <main>
        <section className="hp-hero" style={{ padding: 0 }} aria-labelledby="hp-hero-title">
          <div className="hp-hero-media" ref={heroMediaRef}><img src={asset('drone-spray.jpg')} alt="" /></div>
          <div className="hp-wrap hp-hero-copy">
            <span className="hp-hero-chip"><i className="hp-dot" />Vận hành nông trại bằng drone</span>
            <h1 id="hp-hero-title">
              {HEADLINE.map((word, i) => (
                <span key={i}>
                  <span className="hp-w" style={cssVars({ '--i': i })}>{word.em ? <em>{word.text}</em> : word.text}</span>{' '}
                </span>
              ))}
            </h1>
            <p>AgriDrone gom nông trại, khu vực, nhiệm vụ bay và kết quả kiểm tra sức khỏe cây trồng vào một nơi để cả đội cùng nắm tình hình.</p>
            <div className="hp-hero-actions">
              <Link className="hp-btn hp-btn-lime" to={primaryHref}>{primaryLabel}<Arrow /></Link>
              <a className="hp-btn hp-btn-ghost-light" href="#xem-thu">Xem thử bản đồ</a>
            </div>
          </div>

          <aside className="hp-hud" aria-label="Minh hoạ nhiệm vụ đang bay">
            <div className="hp-hud-top"><span><i className="hp-dot" />Đang bay</span><small>Minh hoạ</small></div>
            <h3>Kiểm tra Khu B</h3>
            <div className="hp-sub">Luống {lane} / 9 · Nông trại Đồng Xanh</div>
            <div className="hp-bar"><b style={{ width: `${hud.pct}%` }} /></div>
            <div className="hp-hud-row"><span>Tiến độ</span><span>{hud.pct}%</span></div>
            <div className="hp-hud-stats">
              <div><strong>{hud.alt} m</strong><small>Độ cao</small></div>
              <div><strong>{hud.speed.toFixed(1)} m/s</strong><small>Tốc độ</small></div>
              <div><strong>{hud.battery}%</strong><small>Pin</small></div>
            </div>
          </aside>

          <a className="hp-scroll-cue" href="#giai-phap"><i />Cuộn xuống</a>
        </section>

        <section id="giai-phap" aria-labelledby="hp-gp-title">
          <div className="hp-wrap">
            <div className="hp-section-head hp-rv">
              <span className="hp-eyebrow">Giải pháp</span>
              <h2 id="hp-gp-title">Một nơi cho cả nông trại, từ chủ đơn vị đến người làm đồng.</h2>
              <p className="hp-lead">Mỗi nông trại được chia thành các khu vực rõ ràng, mỗi người được giao đúng phạm vi họ phụ trách. Dữ liệu từ những chuyến bay quay về cùng một chỗ.</p>
            </div>
            <div style={{ marginTop: 56 }}><FeatureTabs /></div>
          </div>
        </section>

        <section id="xem-thu" style={{ paddingTop: 0 }} aria-labelledby="hp-xt-title">
          <div className="hp-wrap">
            <div className="hp-section-head hp-rv">
              <span className="hp-eyebrow">Xem thử</span>
              <h2 id="hp-xt-title">Cho drone bay một vòng, khu nào cần chú ý sẽ hiện ra.</h2>
              <p className="hp-lead">Bấm “Bay mô phỏng” rồi chọn từng khu vực để xem chỉ số. Đây là dữ liệu minh hoạ để bạn hình dung giao diện.</p>
            </div>
            <div style={{ marginTop: 56 }}><FlightMap /></div>
          </div>
        </section>

        <section className="hp-forest" id="loi-ich" aria-labelledby="hp-li-title">
          <div className="hp-wrap hp-forest-grid">
            <div className="hp-rv">
              <span className="hp-eyebrow">Lợi ích</span>
              <h2 id="hp-li-title">Thấy điều mắt thường bỏ sót.</h2>
              <p className="hp-lead">Kéo thanh trượt để so sánh ảnh chụp thường với bản đồ sức khỏe. Vùng cần chú ý nổi lên ngay, đội ngũ tập trung xử lý đúng chỗ.</p>
              <div className="hp-benefits">
                {BENEFITS.map((b) => (
                  <div className="hp-benefit" key={b.title}>
                    <span className="hp-ring"><svg className="hp-i" viewBox="0 0 24 24" aria-hidden="true">{b.icon}</svg></span>
                    <h3>{b.title}</h3>
                    <p>{b.text}</p>
                  </div>
                ))}
              </div>
            </div>
            <CompareSlider />
          </div>
        </section>

        <section id="quy-trinh" aria-labelledby="hp-qt-title">
          <div className="hp-wrap">
            <div className="hp-section-head hp-rv">
              <span className="hp-eyebrow">Quy trình</span>
              <h2 id="hp-qt-title">Từ mảnh đất đến quyết định, chỉ bốn bước.</h2>
            </div>
            <ol className="hp-steps" ref={stepsRef}>
              {STEPS.map((step, i) => (
                <li className={`hp-step hp-rv${i < stepsOn ? ' hp-on' : ''}`} style={cssVars({ '--d': `${i * 0.1}s` })} key={step.title}>
                  <div className="hp-n" aria-hidden="true">{i + 1}</div>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="vai-tro" style={{ paddingTop: 0 }} aria-labelledby="hp-vt-title">
          <div className="hp-wrap">
            <div className="hp-section-head hp-rv">
              <span className="hp-eyebrow">Vai trò</span>
              <h2 id="hp-vt-title">Mỗi người một phạm vi, không ai phải đoán.</h2>
            </div>
            <div className="hp-roles-grid">
              {ROLES.map((role, i) => (
                <article className="hp-role hp-rv" style={cssVars({ '--d': `${i * 0.1}s` })} key={role.badge}>
                  <span className="hp-badge">{role.badge}</span>
                  <h3>{role.title}</h3>
                  <p>{role.text}</p>
                  <ul>{role.items.map((item) => <li key={item}><Tick />{item}</li>)}</ul>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="hp-cta-photo" style={{ padding: '130px 0' }} aria-labelledby="hp-cta-title">
          <img src={asset('sprayers.jpg')} alt="" loading="lazy" />
          <div className="hp-wrap">
            <h2 id="hp-cta-title" className="hp-rv">Sẵn sàng nhìn nông trại của bạn từ trên cao?</h2>
            <p className="hp-lead hp-rv" style={cssVars({ '--d': '.1s' })}>Đăng nhập nếu đơn vị đã có tài khoản, hoặc nhận lời mời từ chủ đơn vị để tham gia.</p>
            <div className="hp-cta-actions hp-rv" style={cssVars({ '--d': '.2s' })}>
              <Link className="hp-btn hp-btn-lime" to={primaryHref}>{session ? 'Vào bảng điều khiển' : 'Đăng nhập'}<Arrow /></Link>
              {session ? null : <Link className="hp-btn hp-btn-ghost-light" to="/invitation">Tôi có mã lời mời</Link>}
            </div>
          </div>
        </section>
      </main>

      <footer className="hp-footer">
        <div className="hp-wrap">
          <div className="hp-footer-grid">
            <div>
              <a className="hp-brand" href="#top" aria-label="AgriDrone - Về đầu trang"><BrandMark /></a>
              <p>Nền tảng quản lý nông trại và nhiệm vụ bay, xây dựng cho đội ngũ vận hành thực tế.</p>
            </div>
            <div><h4>Sản phẩm</h4><ul><li><a href="#giai-phap">Giải pháp</a></li><li><a href="#xem-thu">Xem thử</a></li><li><a href="#quy-trinh">Quy trình</a></li></ul></div>
            <div><h4>Tài khoản</h4><ul><li><Link to="/login">Đăng nhập</Link></li><li><Link to="/register">Đăng ký</Link></li><li><Link to="/forgot-password">Quên mật khẩu</Link></li><li><Link to="/invitation">Nhận lời mời</Link></li></ul></div>
            <div><h4>Vai trò</h4><ul><li><a href="#vai-tro">Chủ đơn vị</a></li><li><a href="#vai-tro">Quản trị đơn vị</a></li><li><a href="#vai-tro">Thành viên</a></li></ul></div>
          </div>
          <div className="hp-footer-bottom">
            <span>© 2026 AgriDrone. Đồ án FPTU.</span>
            <span>Ảnh: DRONE EFT, Bernd Dittrich, James Baltz / Unsplash</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
