import 'leaflet/dist/leaflet.css'
import { useMutation } from '@tanstack/react-query'
import { Alert, App, Button, Slider, Space } from 'antd'
import { useState } from 'react'
import { CircleMarker, ImageOverlay, MapContainer, Polygon, Polyline, useMapEvents } from 'react-leaflet'
import { MapBaseLayers } from '../../components/MapBaseLayers'
import * as api from './missionApi'
import type { GeoJsonPolygon, OrthophotoBounds, SliceTilesResult } from './missionTypes'
import { closedBoundaryPolygon, estimateAreaHectares, isWithinOrthophotoBounds, missionError } from './missionWorkflow'

// Dùng đúng token màu của app (xem global.css :root / workspace.css .app-shell), không phải màu tối/cyan của map_picker.
const boundaryColor = 'var(--mint)'

// Bắt buộc chỉ chấm điểm ranh giới trong phạm vi ảnh orthophoto — click ra ngoài (trên nền vệ tinh/OSM) không được tính.
function ClickCapture({ enabled, bounds, onAdd, onOutsideBounds }: { enabled: boolean; bounds: OrthophotoBounds; onAdd: (point: [number, number]) => void; onOutsideBounds: () => void }) {
  useMapEvents({ click: event => {
    if (!enabled) return
    if (!isWithinOrthophotoBounds(event.latlng.lat, event.latlng.lng, bounds)) { onOutsideBounds(); return }
    onAdd([event.latlng.lng, event.latlng.lat])
  } })
  return null
}

export function BoundaryTilingPanel({ token, farmId, missionId, previewUrl, bounds, onSliced }: {
  token: string; farmId: string; missionId: string; previewUrl: string; bounds: OrthophotoBounds; onSliced: (result: SliceTilesResult, polygon: GeoJsonPolygon) => void
}) {
  const { message } = App.useApp()
  const [points, setPoints] = useState<[number, number][]>([])
  const [locked, setLocked] = useState(false)
  const [opacity, setOpacity] = useState(1)
  const leafletBounds: [[number, number], [number, number]] = [[bounds.minLat, bounds.minLon], [bounds.maxLat, bounds.maxLon]]
  const latLngPoints = points.map(([lng, lat]): [number, number] => [lat, lng])
  const area = estimateAreaHectares(points)

  const sliceMutation = useMutation({
    mutationFn: () => api.sliceMissionTiles(token, farmId, missionId, closedBoundaryPolygon(points)),
    onSuccess: data => { onSliced(data, closedBoundaryPolygon(points)); setLocked(true) },
  })

  return <>
    <Space wrap>
      <Button disabled={locked || points.length === 0} onClick={() => setPoints(previous => previous.slice(0, -1))}>↩ Xóa điểm cuối</Button>
      <Button disabled={locked || points.length === 0} onClick={() => setPoints([])}>🗑️ Xóa hết</Button>
      <Button type={locked ? 'primary' : 'default'} onClick={() => setLocked(value => !value)}>{locked ? '🔒 Đã khóa viền (bấm để mở lại)' : '✏️ Đang vẽ viền (click bản đồ để thêm điểm)'}</Button>
    </Space>
    <Space align="center" style={{ marginTop: 12 }}>
      <span className="form-hint">Độ mờ ảnh drone</span>
      <Slider style={{ width: 160 }} min={10} max={100} value={Math.round(opacity * 100)} onChange={value => setOpacity(value / 100)} tooltip={{ formatter: value => `${value}%` }} />
    </Space>
    <div style={{ position: 'relative', height: 560, marginTop: 8, marginBottom: 12 }}>
      <div className="map-live-banner">
        <span>📐 {points.length} điểm</span>
        <span>🟢 {points.length >= 3 ? `${area.toFixed(2)} ha` : '—'}</span>
      </div>
      <MapContainer bounds={leafletBounds} maxZoom={22} style={{ height: '100%', width: '100%' }}>
        <MapBaseLayers />
        <ImageOverlay url={previewUrl} bounds={leafletBounds} opacity={opacity} />
        <ClickCapture enabled={!locked} bounds={bounds} onAdd={point => setPoints(previous => [...previous, point])} onOutsideBounds={() => message.warning('Chỉ chấm điểm được trong phạm vi ảnh orthophoto.')} />
        {points.map((point, index) => <CircleMarker key={index} center={[point[1], point[0]]} radius={6} pathOptions={{ color: boundaryColor, fillColor: boundaryColor, fillOpacity: 0.9 }} />)}
        {points.length >= 2 && points.length < 3 ? <Polyline positions={latLngPoints} pathOptions={{ color: boundaryColor }} /> : null}
        {points.length >= 3 ? <Polygon positions={[...latLngPoints, latLngPoints[0]]} pathOptions={{ color: boundaryColor, fillOpacity: 0.15 }} /> : null}
      </MapContainer>
    </div>
    {points.length === 0 ? <p className="form-hint">Chưa có điểm nào. Hãy click lên ảnh.</p> : <ol>{points.map((point, index) => <li key={index}>#{index + 1}: {point[1].toFixed(6)}, {point[0].toFixed(6)}</li>)}</ol>}
    <p className="form-hint">{points.length} điểm{points.length >= 3 ? ` · diện tích ước tính ${area.toFixed(2)} ha` : ''}</p>
    {sliceMutation.error ? <Alert type="error" showIcon message={missionError(sliceMutation.error)} /> : null}
    <Button type="primary" disabled={!locked || points.length < 3} loading={sliceMutation.isPending} onClick={() => sliceMutation.mutate()}>Cắt tiles</Button>
    {sliceMutation.data ? <Alert type="success" showIcon message={`Đã cắt ${sliceMutation.data.totalTiles} tile (${sliceMutation.data.totalTiles640} × 640, ${sliceMutation.data.totalTiles1280} × 1280).`} /> : null}
  </>
}
