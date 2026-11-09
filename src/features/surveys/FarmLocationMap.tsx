import { Alert, Button, Modal } from 'antd'
import { divIcon, type Map as LeafletMap, type Marker as LeafletMarker } from 'leaflet'
import { useRef, useState } from 'react'
import { MapContainer, Marker, TileLayer, useMapEvents } from 'react-leaflet'
import type { FarmLocation } from './FarmLocationPicker'
import 'leaflet/dist/leaflet.css'

const pin = divIcon({ className: 'farm-location-pin', html: '<span></span>', iconSize: [28, 36], iconAnchor: [14, 36] })

function MapSelection({ location, select }: { location: FarmLocation | null; select: (location: FarmLocation) => void }) {
  useMapEvents({ click(event) { const point = event.latlng.wrap(); select({ longitude: point.lng, latitude: point.lat }) } })
  return location ? <Marker position={[location.latitude, location.longitude]} icon={pin} draggable title="Vị trí nông trại: kéo ghim để điều chỉnh" eventHandlers={{ dragend(event) {
    const point = (event.target as LeafletMarker).getLatLng().wrap()
    select({ longitude: point.lng, latitude: point.lat })
  } }} /> : null
}

export default function FarmLocationMap({ initial, close, select }: { initial: FarmLocation | null; close: () => void; select: (location: FarmLocation) => void }) {
  const [location, setLocation] = useState(initial)
  const [tileError, setTileError] = useState(false)
  const [tileAttempt, setTileAttempt] = useState(0)
  const map = useRef<LeafletMap | null>(null)
  return <Modal open title="Chọn vị trí nông trại" width={760} okText="Dùng vị trí này" cancelText="Hủy" okButtonProps={{ disabled: !location }} onCancel={close} onOk={() => { if (location) select(location) }}>
    <p>Bấm vào bản đồ hoặc kéo ghim đến nông trại. Dùng nút + / − để phóng to, thu nhỏ.</p>
    {tileError ? <Alert type="warning" showIcon title="Một số ảnh nền chưa tải được. Thử tải lại bản đồ." description="Tọa độ và ghim vẫn được giữ lại. Nếu nền còn trống, đóng bản đồ và dùng vị trí hiện tại hoặc nhập tọa độ." action={<Button htmlType="button" onClick={() => { setTileError(false); setTileAttempt(attempt => attempt + 1) }}>Tải lại bản đồ</Button>} /> : null}
    <div className="farm-location-map" role="region" aria-label="Bản đồ chọn vị trí nông trại">
      <MapContainer ref={map} center={initial ? [initial.latitude, initial.longitude] : [14, 108]} zoom={initial ? 16 : 5} scrollWheelZoom={false}>
        <TileLayer key={tileAttempt} url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors' eventHandlers={{ tileerror() { setTileError(true) }, tileload() { setTileError(false) } }} />
        <MapSelection location={location} select={setLocation} />
      </MapContainer>
    </div>
    <div className="farm-location-map-summary" aria-live="polite">
      {location ? <span>Kinh độ: <strong>{location.longitude.toFixed(7)}</strong> · Vĩ độ: <strong>{location.latitude.toFixed(7)}</strong></span> : <span>Chưa chọn vị trí nông trại.</span>}
      <Button htmlType="button" onClick={() => { const point = map.current?.getCenter().wrap(); if (point) setLocation({ longitude: point.lng, latitude: point.lat }) }}>Chọn tâm bản đồ</Button>
    </div>
    <p className="form-hint">Đây là vị trí tham khảo. Ranh giới nông trại sẽ được Manager xác minh.</p>
  </Modal>
}
