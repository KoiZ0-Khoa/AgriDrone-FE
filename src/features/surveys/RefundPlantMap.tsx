import { CircleMarker, MapContainer, TileLayer, Tooltip } from 'react-leaflet'
import type { LatLngTuple } from 'leaflet'
import type { RefundFarmPlant } from './qualityRefundApi'
import 'leaflet/dist/leaflet.css'
import './farm-location.css'

export default function RefundPlantMap({ plants, selected, disabled, toggle }: { plants: RefundFarmPlant[]; selected: string[]; disabled: boolean; toggle: (id: string) => void }) {
  const points = plants.flatMap(plant => plant.lat != null && plant.lon != null && Math.abs(plant.lat) <= 90 && Math.abs(plant.lon) <= 180
    ? [{ plant, position: [plant.lat, plant.lon] as LatLngTuple }] : [])
  const selectedIds = new Set(selected)
  if (!points.length) return <p className="form-hint">Chưa có tọa độ hợp lệ. Bạn có thể chọn trụ từ danh sách.</p>
  return <div className="farm-location-map" role="region" aria-label="Bản đồ vị trí trụ">
    <MapContainer bounds={points.map(point => point.position)} boundsOptions={{ padding: [24, 24], maxZoom: 18 }} scrollWheelZoom={false} preferCanvas>
      <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' />
      {points.map(({ plant, position }) => <CircleMarker key={plant.id} center={position} radius={selectedIds.has(plant.id) ? 8 : 5} pathOptions={{ color: selectedIds.has(plant.id) ? '#1b54b8' : '#146d4c', fillOpacity: 0.8 }}
        eventHandlers={{ click: () => { if (!disabled) toggle(plant.id) } }}>
        <Tooltip>{plant.plantCode}</Tooltip>
      </CircleMarker>)}
    </MapContainer>
  </div>
}
