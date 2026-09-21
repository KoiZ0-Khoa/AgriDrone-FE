import { useCallback, useEffect, useRef, useState } from 'react'
import { asset, cssVars, prefersReducedMotion } from './utils'

type ZoneKey = 'a' | 'b' | 'c' | 'd'
type ZoneStatus = 'ok' | 'warn' | 'bad'
type ScanState = 'idle' | 'scanning' | 'done'
type Point = [number, number]

type Zone = {
  name: string
  crop: string
  area: string
  owner: string
  last: string
  health: number
  cover: number
  status: ZoneStatus
  label: string
  poly: Point[]
  labelAt: { left: string; top: string }
}

const ZONES: Record<ZoneKey, Zone> = {
  a: { name: 'Khu A', crop: 'Rau luống phủ bạt', area: '4,2 ha', owner: 'Lan · Manager', last: 'Hôm nay, 07:40', health: 92, cover: 88, status: 'ok', label: 'Khỏe mạnh', poly: [[2, 3], [48, 3], [48, 80], [2, 80]], labelAt: { left: '25%', top: '41%' } },
  b: { name: 'Khu B', crop: 'Rau luống', area: '2,1 ha', owner: 'Minh · Manager', last: 'Hôm nay, 07:52', health: 71, cover: 74, status: 'warn', label: 'Cần theo dõi', poly: [[52, 3], [82, 3], [82, 52], [52, 52]], labelAt: { left: '67%', top: '28%' } },
  c: { name: 'Khu C', crop: 'Lúa mì', area: '6,8 ha', owner: 'Hùng · Worker', last: 'Hôm nay, 08:05', health: 96, cover: 93, status: 'ok', label: 'Khỏe mạnh', poly: [[100, 22], [100, 100], [57, 100], [70, 72], [84, 45]], labelAt: { left: '86%', top: '76%' } },
  d: { name: 'Khu D', crop: 'Vùng đệm, cây xanh', area: '1,3 ha', owner: 'Chưa phân công', last: 'Hôm nay, 08:14', health: 54, cover: 61, status: 'bad', label: 'Cần kiểm tra', poly: [[2, 85], [44, 85], [44, 98], [2, 98]], labelAt: { left: '23%', top: '91.5%' } },
}
const KEYS = Object.keys(ZONES) as ZoneKey[]

const PATH: Point[] = [
  [5, 8], [44, 8], [44, 20], [5, 20], [5, 32], [44, 32], [44, 44], [5, 44], [5, 56], [44, 56], [44, 68], [5, 68],
  [55, 8], [78, 8], [78, 20], [55, 20], [55, 32], [78, 32], [78, 44], [55, 44],
  [90, 32], [96, 44], [88, 56], [96, 68], [80, 80], [70, 92], [90, 92], [96, 84],
  [40, 90], [6, 89], [6, 94], [40, 94],
]
const CUMULATIVE = PATH.reduce<number[]>((acc, p, i) => {
  acc.push(i === 0 ? 0 : acc[i - 1] + Math.hypot(p[0] - PATH[i - 1][0], p[1] - PATH[i - 1][1]))
  return acc
}, [])
const TOTAL = CUMULATIVE[CUMULATIVE.length - 1]
const PATH_POINTS = PATH.map((p) => p.join(',')).join(' ')
const SPEED = 50

function inPoly([x, y]: Point, poly: Point[]) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function useCountUp(target: number) {
  const [value, setValue] = useState(0)
  const from = useRef(0)
  useEffect(() => {
    if (prefersReducedMotion()) {
      from.current = target
      setValue(target)
      return
    }
    const start = from.current
    const t0 = performance.now()
    let id = 0
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / 1000)
      const eased = 1 - Math.pow(1 - k, 3)
      from.current = start + (target - start) * eased
      setValue(Math.round(from.current))
      if (k < 1) id = requestAnimationFrame(tick)
    }
    id = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(id)
  }, [target])
  return value
}

const idleStates = (): Record<ZoneKey, ScanState> => ({ a: 'idle', b: 'idle', c: 'idle', d: 'idle' })

export function FlightMap() {
  const [states, setStates] = useState(idleStates)
  const [selected, setSelected] = useState<ZoneKey>('a')
  const [running, setRunning] = useState(false)
  const [finished, setFinished] = useState(false)
  const [status, setStatus] = useState('Sẵn sàng')
  const mapRef = useRef<HTMLDivElement>(null)
  const droneRef = useRef<HTMLDivElement>(null)
  const progressRef = useRef<HTMLElement>(null)
  const frameRef = useRef(0)
  const runningRef = useRef(false)

  const fly = useCallback(() => {
    if (runningRef.current) return
    const bar = progressRef.current
    if (bar) bar.style.width = '0'
    setFinished(false)
    if (prefersReducedMotion()) {
      setStates({ a: 'done', b: 'done', c: 'done', d: 'done' })
      setStatus('Hoàn tất 4/4')
      setFinished(true)
      if (bar) bar.style.width = '100%'
      return
    }
    runningRef.current = true
    setRunning(true)
    setStates(idleStates())
    let distance = 0
    let last = performance.now()
    let inside: ZoneKey | null = null
    const local = idleStates()

    const step = (now: number) => {
      distance += SPEED * Math.min(0.25, (now - last) / 1000)
      last = now
      if (distance >= TOTAL) {
        setStates({ a: 'done', b: 'done', c: 'done', d: 'done' })
        setStatus('Hoàn tất 4/4')
        setFinished(true)
        setRunning(false)
        runningRef.current = false
        if (bar) bar.style.width = '100%'
        return
      }
      let i = 1
      while (CUMULATIVE[i] < distance) i++
      const t = (distance - CUMULATIVE[i - 1]) / (CUMULATIVE[i] - CUMULATIVE[i - 1])
      const x = PATH[i - 1][0] + (PATH[i][0] - PATH[i - 1][0]) * t
      const y = PATH[i - 1][1] + (PATH[i][1] - PATH[i - 1][1]) * t
      const drone = droneRef.current
      if (drone) {
        drone.style.left = `${x}%`
        drone.style.top = `${y}%`
      }
      if (bar) bar.style.width = `${(distance / TOTAL) * 100}%`

      const here = KEYS.find((k) => inPoly([x, y], ZONES[k].poly)) ?? null
      if (here !== inside) {
        if (inside && local[inside] === 'scanning') local[inside] = 'done'
        if (here && local[here] !== 'done') local[here] = 'scanning'
        inside = here
        setStates({ ...local })
        setStatus(`Đã quét ${KEYS.filter((k) => local[k] === 'done').length}/4`)
      }
      frameRef.current = requestAnimationFrame(step)
    }
    frameRef.current = requestAnimationFrame(step)
  }, [])

  useEffect(() => () => cancelAnimationFrame(frameRef.current), [])

  useEffect(() => {
    const el = mapRef.current
    if (!el) return
    let timer = 0
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          timer = window.setTimeout(fly, 500)
          io.disconnect()
        }
      },
      { threshold: 0.5 },
    )
    io.observe(el)
    return () => {
      io.disconnect()
      window.clearTimeout(timer)
    }
  }, [fly])

  const zone = ZONES[selected]
  const done = states[selected] === 'done'
  const health = useCountUp(done ? zone.health : 0)
  const cover = useCountUp(done ? zone.cover : 0)
  const pillClass = done ? `hp-pill hp-${zone.status}` : 'hp-pill'
  const pillText = done ? zone.label : states[selected] === 'scanning' ? 'Đang quét…' : 'Chưa quét'

  return (
    <div className="hp-demo hp-rv">
      <div ref={mapRef} className={`hp-map${running ? ' hp-flying' : ''}`} style={cssVars({ '--hp-map-img': `url(${asset('field-rows.jpg')})` })}>
        <svg className="hp-zones" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {KEYS.map((k) => {
            const cls = ['hp-zone', k === selected && 'hp-sel', states[k] === 'scanning' && 'hp-scanning', states[k] === 'done' && `hp-done hp-${ZONES[k].status}`].filter(Boolean).join(' ')
            return <polygon key={k} className={cls} points={ZONES[k].poly.map((p) => p.join(',')).join(' ')} onClick={() => setSelected(k)} />
          })}
          <polyline className="hp-path" points={PATH_POINTS} />
        </svg>
        {KEYS.map((k) => {
          const cls = ['hp-zlabel', k === selected && 'hp-sel', states[k] === 'done' && `hp-${ZONES[k].status}`].filter(Boolean).join(' ')
          return (
            <button key={k} type="button" className={cls} style={ZONES[k].labelAt} aria-pressed={k === selected} onClick={() => setSelected(k)}>
              <i className="hp-sd" />
              {ZONES[k].name}
            </button>
          )
        })}
        <div ref={droneRef} className="hp-drone" aria-hidden="true">
          <svg viewBox="0 0 40 40">
            <g stroke="#fff" strokeWidth="2" strokeLinecap="round"><path d="M12 12l16 16M28 12L12 28" /></g>
            <rect x="14" y="14" width="12" height="12" rx="4" fill="#07503f" stroke="#fff" strokeWidth="1.5" />
            <circle cx="20" cy="20" r="2" fill="#e8fe85" />
            <g fill="#fff" fillOpacity=".85">
              <ellipse className="hp-rotor" cx="10" cy="10" rx="6.5" ry="1.8" />
              <ellipse className="hp-rotor" cx="30" cy="10" rx="6.5" ry="1.8" />
              <ellipse className="hp-rotor" cx="10" cy="30" rx="6.5" ry="1.8" />
              <ellipse className="hp-rotor" cx="30" cy="30" rx="6.5" ry="1.8" />
            </g>
          </svg>
        </div>
        <div className="hp-map-bar">
          <output aria-live="polite">{status}</output>
          <div className="hp-track"><b ref={progressRef} /></div>
          <button className="hp-btn hp-btn-primary" type="button" onClick={fly} disabled={running}>
            {running ? 'Đang bay…' : finished ? 'Bay lại' : 'Bay mô phỏng'}
          </button>
        </div>
      </div>

      <div className="hp-panel">
        <span className="hp-k">Khu vực đã chọn</span>
        <h3>{zone.name}</h3>
        <span className={pillClass}>{pillText}</span>
        {done ? (
          <div>
            <div className="hp-meter">
              <div className="hp-meter-row"><span>Điểm sức khỏe</span><strong>{health}</strong></div>
              <div className="hp-bar"><b style={{ width: `${zone.health}%` }} /></div>
            </div>
            <div className="hp-meter">
              <div className="hp-meter-row"><span>Độ phủ xanh</span><strong>{cover}%</strong></div>
              <div className="hp-bar"><b style={{ width: `${zone.cover}%` }} /></div>
            </div>
          </div>
        ) : (
          <p className="hp-empty-msg">Chưa có dữ liệu. Hãy cho drone bay qua khu này để nhận kết quả.</p>
        )}
        <dl>
          <div><dt>Cây trồng</dt><dd>{zone.crop}</dd></div>
          <div><dt>Diện tích</dt><dd>{zone.area}</dd></div>
          <div><dt>Người phụ trách</dt><dd>{zone.owner}</dd></div>
          <div><dt>Lần bay gần nhất</dt><dd>{done ? zone.last : '—'}</dd></div>
        </dl>
        <p className="hp-note">Dữ liệu minh hoạ, không phải số liệu thật.</p>
      </div>
    </div>
  )
}
