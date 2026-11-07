import 'leaflet/dist/leaflet.css'
import { useMutation } from '@tanstack/react-query'
import { Alert, Button, Space } from 'antd'
import { useState } from 'react'
import { CircleMarker, ImageOverlay, MapContainer, Polygon, Polyline, useMapEvents } from 'react-leaflet'
import * as api from './missionApi'
import type { GeoJsonPolygon, OrthophotoBounds, SliceTilesResult } from './missionTypes'
import { closedBoundaryPolygon, estimateAreaHectares, missionError } from './missionWorkflow'

const boundaryColor = '#10b981'

function ClickCapture({ enabled, onAdd }: { enabled: boolean; onAdd: (point: [number, number]) => void }) {
  useMapEvents({ click: event => { if (enabled) onAdd([event.latlng.lng, event.latlng.lat]) } })
  return null
}

export function BoundaryTilingPanel({ token, farmId, missionId, previewUrl, bounds, onSliced }: {
  token: string; farmId: string; missionId: string; previewUrl: string; bounds: OrthophotoBounds; onSliced: (result: SliceTilesResult, polygon: GeoJsonPolygon) => void
}) {
  const [points, setPoints] = useState<[number, number][]>([])
  const [locked, setLocked] = useState(false)
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
      <Button onClick={() => setLocked(value => !value)}>{locked ? '✏️ Mở khóa vẽ tiếp' : '🔒 Khóa viền'}</Button>
    </Space>
    <div style={{ height: 480, marginTop: 12, marginBottom: 12 }}>
      <MapContainer bounds={leafletBounds} style={{ height: '100%', width: '100%' }}>
        <ImageOverlay url={previewUrl} bounds={leafletBounds} />
        <ClickCapture enabled={!locked} onAdd={point => setPoints(previous => [...previous, point])} />
        {points.map((point, index) => <CircleMarker key={index} center={[point[1], point[0]]} radius={6} pathOptions={{ color: boundaryColor, fillColor: '#a7f3d0', fillOpacity: 0.9 }} />)}
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
