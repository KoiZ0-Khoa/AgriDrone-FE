import 'leaflet/dist/leaflet.css'
import { useMutation } from '@tanstack/react-query'
import { Alert, Button, Form, InputNumber, Space } from 'antd'
import { useState } from 'react'
import { CircleMarker, ImageOverlay, MapContainer, Polygon } from 'react-leaflet'
import * as api from './missionApi'
import type { DetectedTree, DetectMissionTreesResult, GeoJsonPolygon, OrthophotoBounds } from './missionTypes'
import { missionError } from './missionWorkflow'

const activeColor = '#10b981'
const anchorColor = '#f59e0b'
const missingColor = '#94a3b8'

export function YoloDetectionPanel({ token, farmId, missionId, previewUrl, bounds, boundaryPolygon, onDetected }: {
  token: string; farmId: string; missionId: string; previewUrl: string; bounds: OrthophotoBounds
  boundaryPolygon: GeoJsonPolygon | null; onDetected: (result: DetectMissionTreesResult) => void
}) {
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.25)
  const [rowSpacing, setRowSpacing] = useState(2.8)
  const [colSpacing, setColSpacing] = useState(2.5)
  const [anchor, setAnchor] = useState<{ lat: number; lon: number } | null>(null)
  const [pickingAnchor, setPickingAnchor] = useState(false)
  const [result, setResult] = useState<DetectMissionTreesResult | null>(null)
  const leafletBounds: [[number, number], [number, number]] = [[bounds.minLat, bounds.minLon], [bounds.maxLat, bounds.maxLon]]

  const detectMutation = useMutation({
    mutationFn: () => api.detectMissionTrees(token, farmId, missionId, {
      confidenceThreshold, rowSpacing, colSpacing,
      anchorLat: anchor?.lat, anchorLon: anchor?.lon,
      polygonGeoJson: boundaryPolygon ?? undefined,
    }),
    onSuccess: data => { setResult(data); onDetected(data); setPickingAnchor(false) },
  })

  function pickTreeAsAnchor(tree: DetectedTree) {
    if (!pickingAnchor) return
    setAnchor({ lat: tree.lat, lon: tree.lon })
    setPickingAnchor(false)
  }
  const isPickedAnchor = (tree: DetectedTree) => tree.isAnchor || (anchor !== null && anchor.lat === tree.lat && anchor.lon === tree.lon)

  return <>
    <Form layout="inline">
      <Form.Item label="Độ nhạy AI"><InputNumber min={0} max={1} step={0.05} value={confidenceThreshold} disabled={detectMutation.isPending} onChange={value => setConfidenceThreshold(value ?? 0.25)} /></Form.Item>
      <Form.Item label="Khoảng cách hàng (m)"><InputNumber min={0.1} step={0.1} value={rowSpacing} disabled={detectMutation.isPending} onChange={value => setRowSpacing(value ?? 2.8)} /></Form.Item>
      <Form.Item label="Khoảng cách cột (m)"><InputNumber min={0.1} step={0.1} value={colSpacing} disabled={detectMutation.isPending} onChange={value => setColSpacing(value ?? 2.5)} /></Form.Item>
    </Form>
    {result?.suggestedRowSpacing != null && result.suggestedColSpacing != null ? <Button size="small" onClick={() => { setRowSpacing(result.suggestedRowSpacing!); setColSpacing(result.suggestedColSpacing!) }}>Dùng gợi ý ({result.suggestedRowSpacing.toFixed(2)} × {result.suggestedColSpacing.toFixed(2)})</Button> : null}
    <div style={{ margin: '8px 0' }}>
      {anchor ? <Space>Cây neo: Đã chọn ({anchor.lat.toFixed(5)}, {anchor.lon.toFixed(5)})<Button size="small" onClick={() => setAnchor(null)}>↺ Hủy</Button></Space>
        : pickingAnchor ? <span className="form-hint">🎯 Nhấp vào 1 cây góc trên bản đồ bên dưới</span>
        : <Space>Cây neo: 🟢 Tự động<Button size="small" disabled={!result} onClick={() => setPickingAnchor(true)}>📍 Chọn Cây Neo (H1-C1)</Button></Space>}
    </div>
    <div style={{ height: 480, marginBottom: 12 }}>
      <MapContainer bounds={leafletBounds} style={{ height: '100%', width: '100%' }}>
        <ImageOverlay url={previewUrl} bounds={leafletBounds} />
        {boundaryPolygon ? <Polygon positions={boundaryPolygon.coordinates[0].map(([lng, lat]): [number, number] => [lat, lng])} pathOptions={{ color: activeColor, fillOpacity: 0.03 }} /> : null}
        {result?.missingTrees.map(tree => <CircleMarker key={tree.id} center={[tree.lat, tree.lon]} radius={5} pathOptions={{ color: missingColor, fillColor: '#e2e8f0', fillOpacity: 0.6, dashArray: '2 2' }} />)}
        {result?.activeTrees.map(tree => <CircleMarker key={tree.id} center={[tree.lat, tree.lon]} radius={isPickedAnchor(tree) ? 9 : 5}
          pathOptions={{ color: isPickedAnchor(tree) ? anchorColor : activeColor, fillColor: isPickedAnchor(tree) ? '#fde68a' : '#a7f3d0', fillOpacity: 0.9 }}
          eventHandlers={{ click: () => pickTreeAsAnchor(tree) }} />)}
      </MapContainer>
    </div>
    {detectMutation.error ? <Alert type="error" showIcon message={missionError(detectMutation.error)} /> : null}
    <Button type="primary" loading={detectMutation.isPending} onClick={() => detectMutation.mutate()}>Chạy YOLO</Button>
    {result ? <Alert style={{ marginTop: 12 }} type="success" showIcon message={`Quét ${result.totalTilesScanned} tile · ${result.totalUniqueTrees} cây phát hiện · ${result.totalMissingTrees} cây thiếu (nội suy).`} description={`Model: ${result.modelName}`} /> : null}
  </>
}
