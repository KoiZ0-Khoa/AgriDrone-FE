import { AimOutlined, EnvironmentOutlined } from '@ant-design/icons'
import { Alert, Button, Form, Space, Spin } from 'antd'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { intakeCoordinate } from './intakeNumbers'
import './farm-location.css'

export type FarmLocation = { longitude: number; latitude: number }
const FarmLocationMap = lazy(() => import('./FarmLocationMap'))

export function FarmLocationPicker({ disabled }: { disabled: boolean }) {
  const form = Form.useFormInstance()
  const longitude = Form.useWatch('longitude', form)
  const latitude = Form.useWatch('latitude', form)
  const [locating, setLocating] = useState(false)
  const [mapOpen, setMapOpen] = useState(false)
  const [error, setError] = useState('')
  const [located, setLocated] = useState<(FarmLocation & { accuracy: number }) | null>(null)
  const requestId = useRef(0)
  const pending = useRef(false)
  useEffect(() => () => { requestId.current++; pending.current = false }, [])
  // An older location request must not overwrite coordinates the user just edited.
  useEffect(() => { requestId.current++; pending.current = false; setLocating(false) }, [longitude, latitude, disabled])

  let current: FarmLocation | null = null
  try { current = { longitude: intakeCoordinate(longitude, 'longitude'), latitude: intakeCoordinate(latitude, 'latitude') } } catch { /* Empty or incomplete coordinates can still be selected on the map. */ }

  function apply(location: FarmLocation) {
    form.setFields([
      { name: 'longitude', value: String(location.longitude), errors: [] },
      { name: 'latitude', value: String(location.latitude), errors: [] },
    ])
    setError('')
  }

  function locate() {
    if (disabled || pending.current) return
    setError('')
    if (!window.isSecureContext) { setError('Định vị cần kết nối HTTPS hoặc localhost. Bạn có thể chọn vị trí trên bản đồ hoặc nhập tọa độ.'); return }
    if (!navigator.geolocation) { setError('Trình duyệt này chưa hỗ trợ định vị. Hãy chọn vị trí trên bản đồ hoặc nhập tọa độ.'); return }
    const id = ++requestId.current
    pending.current = true
    setLocating(true)
    navigator.geolocation.getCurrentPosition(position => {
      if (id !== requestId.current) return
      pending.current = false
      setLocating(false)
      try {
        const location = { longitude: intakeCoordinate(position.coords.longitude, 'longitude'), latitude: intakeCoordinate(position.coords.latitude, 'latitude') }
        apply(location)
        setLocated({ ...location, accuracy: position.coords.accuracy })
      } catch { setError('Chưa lấy được tọa độ hợp lệ. Hãy chọn vị trí trên bản đồ hoặc thử lại.') }
    }, failure => {
      if (id !== requestId.current) return
      pending.current = false
      setLocating(false)
      setError(failure.code === 1 ? 'Bạn chưa cho phép truy cập vị trí. Hãy bật quyền vị trí cho trang web hoặc chọn trên bản đồ.' : failure.code === 3 ? 'Lấy vị trí quá lâu. Hãy thử lại hoặc chọn trên bản đồ.' : 'Chưa xác định được vị trí thiết bị. Hãy thử lại hoặc chọn trên bản đồ.')
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 })
  }

  const accuracy = located && current && located.longitude === current.longitude && located.latitude === current.latitude && Number.isFinite(located.accuracy)
    ? `Sai số vị trí thiết bị khoảng ${Math.ceil(located.accuracy).toLocaleString('vi-VN')} m. Kiểm tra lại vị trí nông trại trước khi gửi.` : ''
  return <div className="farm-location-picker">
    <Space wrap>
      <Button htmlType="button" icon={<AimOutlined />} loading={locating} disabled={disabled} onClick={locate}>Lấy vị trí hiện tại</Button>
      <Button htmlType="button" icon={<EnvironmentOutlined />} disabled={disabled || locating} onClick={() => { setError(''); setMapOpen(true) }}>Chọn trên bản đồ</Button>
    </Space>
    <p className="form-hint">Đang ở nông trại? Dùng vị trí hiện tại. Nếu ở nơi khác, hãy chọn vị trí nông trại trên bản đồ.</p>
    <div aria-live="polite">{locating ? <p>Đang lấy vị trí. Cho phép truy cập vị trí khi trình duyệt hỏi.</p> : null}{error ? <Alert type="warning" showIcon title={error} /> : null}{accuracy ? <p className="form-hint">{accuracy}</p> : null}</div>
    {mapOpen ? <Suspense fallback={<div role="status"><Spin size="small" /> Đang mở bản đồ…</div>}><FarmLocationMap initial={current} close={() => setMapOpen(false)} select={location => { if (!disabled) { apply(location); setLocated(null) }; setMapOpen(false) }} /></Suspense> : null}
  </div>
}
