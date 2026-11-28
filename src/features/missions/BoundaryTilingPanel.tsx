import 'leaflet/dist/leaflet.css'
import { Alert, App, Button, Flex, Popconfirm, Slider, Space } from 'antd'
import { useState } from 'react'
import { CircleMarker, ImageOverlay, MapContainer, Polygon, Polyline, useMapEvents } from 'react-leaflet'
import { MapBaseLayers } from '../../components/MapBaseLayers'
import type { GeoJsonPolygon, MissionTilingJob, OrthophotoBounds } from './missionTypes'
import { closedBoundaryPolygon, completedMissionTiling, estimateAreaHectares, isMissionTilingActive, isWithinOrthophotoBounds, missionError } from './missionWorkflow'

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

export function BoundaryTilingPanel({
  previewUrl, bounds, job, editing, loading, submitting, submitError, statusError, checking, onRefresh,
  onSlice, onUnlock, disabled, approvedBoundary,
}: {
  previewUrl: string; bounds: OrthophotoBounds; job: MissionTilingJob | null | undefined; editing: boolean
  loading: boolean; submitting: boolean; submitError: unknown; statusError: unknown; checking: boolean; onRefresh: () => void
  onSlice: (polygon: GeoJsonPolygon) => void; onUnlock: () => void; disabled?: boolean
  approvedBoundary?: number[][][]
}) {
  const { message } = App.useApp()
  const savedPoints = job?.polygonGeoJson?.coordinates[0]?.slice(0, -1) ?? []
  const [points, setPoints] = useState(() => savedPoints)
  const [locked, setLocked] = useState(savedPoints.length >= 3 && !editing)
  const [opacity, setOpacity] = useState(1)
  const leafletBounds: [[number, number], [number, number]] = [[bounds.minLat, bounds.minLon], [bounds.maxLat, bounds.maxLon]]
  const latLngPoints = points.map(([lng, lat]): [number, number] => [lat, lng])
  const area = estimateAreaHectares(points)

  const active = isMissionTilingActive(job)
  const completed = !editing ? completedMissionTiling(job) : null
  const blocked = disabled || loading || active || submitting
  const canEdit = !locked && !blocked

  return <>
    <Space wrap>
      <Button disabled={!canEdit || points.length === 0} onClick={() => setPoints(previous => previous.slice(0, -1))}>Xóa điểm cuối</Button>
      <Popconfirm title="Xóa hết điểm đã vẽ?" onConfirm={() => setPoints([])} okText="Xóa" cancelText="Hủy" disabled={!canEdit || points.length === 0}>
        <Button disabled={!canEdit || points.length === 0}>Xóa hết</Button>
      </Popconfirm>
      <span className="form-hint">{locked ? 'Đã khóa ranh giới.' : 'Bấm lên ảnh để thêm điểm. Vẽ xong, khóa ranh giới bên dưới để cắt tiles.'}</span>
      {approvedBoundary ? <span className="form-hint">Nét đứt là ranh giới đã duyệt của nông trại.</span> : null}
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
        {approvedBoundary ? <Polygon positions={approvedBoundary.map(ring => ring.map(([lng, lat]): [number, number] => [lat, lng]))}
          pathOptions={{ color: 'var(--text)', dashArray: '6 5', fill: false }} /> : null}
        <ClickCapture enabled={canEdit} bounds={bounds} onAdd={point => setPoints(previous => [...previous, point])} onOutsideBounds={() => message.warning('Chỉ chấm điểm được trong phạm vi ảnh orthophoto.')} />
        {points.map((point, index) => <CircleMarker key={index} center={[point[1], point[0]]} radius={6} pathOptions={{ color: boundaryColor, fillColor: boundaryColor, fillOpacity: 0.9 }} />)}
        {points.length >= 2 && points.length < 3 ? <Polyline positions={latLngPoints} pathOptions={{ color: boundaryColor }} /> : null}
        {points.length >= 3 ? <Polygon positions={[...latLngPoints, latLngPoints[0]]} pathOptions={{ color: boundaryColor, fillOpacity: 0.15 }} /> : null}
      </MapContainer>
    </div>
    {points.length === 0 ? <p className="form-hint">Chưa có điểm nào. Hãy click lên ảnh.</p> : <ol>{points.map((point, index) => <li key={index}>#{index + 1}: {point[1].toFixed(6)}, {point[0].toFixed(6)}</li>)}</ol>}
    <p className="form-hint">{points.length} điểm{points.length >= 3 ? ` · diện tích ước tính ${area.toFixed(2)} ha` : ''}</p>
    {!loading && !active && !completed ? <p className="form-hint" role="status">{points.length < 3 ? 'Chọn ít nhất 3 điểm để tạo ranh giới.' : locked ? 'Ranh giới đã khóa. Bạn có thể cắt tiles.' : 'Bấm Khóa ranh giới để bật nút Cắt tiles.'}</p> : null}
    <Flex vertical gap={12}>
      {loading ? <Alert type="info" showIcon message="Đang kiểm tra trạng thái cắt tiles…" /> : null}
      {active ? <Alert type="info" showIcon message={job?.status === 'QUEUED' ? 'Đang chờ cắt tiles' : 'Đang cắt tiles'} /> : null}
      {job?.status === 'FAILED' ? <Alert type="error" showIcon message="Cắt tiles thất bại" description={job.error || 'Bạn có thể thử cắt lại.'} /> : null}
      {job?.status === 'COMPLETED' && !editing && !completed ? <Alert type="warning" showIcon message="Lượt cắt tiles thiếu dữ liệu để chạy YOLO. Hãy cắt lại." /> : null}
      {submitError ? <Alert type="error" showIcon message={missionError(submitError)} /> : null}
      {statusError ? <Alert type="error" showIcon message="Chưa đọc được trạng thái cắt tiles" description={missionError(statusError)} /> : null}
      <Space wrap>
        <Button type={locked ? 'default' : 'primary'} disabled={blocked || points.length < 3} onClick={() => {
          if (locked) onUnlock()
          setLocked(!locked)
        }}>{locked ? 'Mở khóa chỉnh sửa' : 'Khóa ranh giới'}</Button>
        <Button type="primary" disabled={blocked || !!completed || !locked || points.length < 3} loading={submitting} onClick={() => onSlice(closedBoundaryPolygon(points))}>{job?.status === 'FAILED' ? 'Cắt lại tiles' : 'Cắt tiles'}</Button>
        {active || !!submitError || !!statusError ? <Button loading={checking} disabled={submitting} onClick={onRefresh}>Kiểm tra lại</Button> : null}
      </Space>
    </Flex>
  </>
}
