import 'leaflet/dist/leaflet.css'
import { useMutation } from '@tanstack/react-query'
import { Alert, App, Button, Form, InputNumber, Popconfirm, Space, Tag } from 'antd'
import { useState } from 'react'
import { CircleMarker, ImageOverlay, MapContainer, Polygon, Popup, useMapEvents } from 'react-leaflet'
import { MapBaseLayers } from '../../components/MapBaseLayers'
import * as api from './missionApi'
import type { DetectedTree, DetectMissionTreesResult, GeoJsonPolygon, OrthophotoBounds } from './missionTypes'
import { isWithinOrthophotoBounds, missionError } from './missionWorkflow'

// Giữ đúng token màu của app (global.css :root / workspace.css .app-shell) thay vì bảng màu map_picker.
const activeColor = 'var(--mint)'
const anchorColor = '#f59e0b'
const missingColor = 'var(--muted)'

// Bắt buộc chỉ chấm trụ thủ công trong phạm vi ảnh orthophoto — click ra ngoài (trên nền vệ tinh/OSM) không được tính.
function ClickCapture({ enabled, bounds, onAdd, onOutsideBounds }: { enabled: boolean; bounds: OrthophotoBounds; onAdd: (lat: number, lon: number) => void; onOutsideBounds: () => void }) {
  useMapEvents({ click: event => {
    if (!enabled) return
    if (!isWithinOrthophotoBounds(event.latlng.lat, event.latlng.lng, bounds)) { onOutsideBounds(); return }
    onAdd(event.latlng.lat, event.latlng.lng)
  } })
  return null
}

// Renumber cột của các cây còn lại trong cùng 1 hàng sau khi xóa/xác nhận 1 vị trí (học theo dismissMissingTree/deleteActiveTree của map_picker.py).
function renumberAfterRemoval<T extends DetectedTree>(trees: T[], row: number, removedCol: number): T[] {
  return trees.map(tree => tree.row === row && tree.col > removedCol ? { ...tree, col: tree.col - 1, id: `${tree.status === 'MISSING' ? 'missing' : 'tree'}_r${tree.row}_c${tree.col - 1}` } : tree)
}

export function YoloDetectionPanel({ token, farmId, missionId, previewUrl, bounds, boundaryPolygon, onDetected }: {
  token: string; farmId: string; missionId: string; previewUrl: string; bounds: OrthophotoBounds
  boundaryPolygon: GeoJsonPolygon | null; onDetected: (result: DetectMissionTreesResult) => void
}) {
  const { message } = App.useApp()
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.25)
  const [rowSpacing, setRowSpacing] = useState(2.8)
  const [colSpacing, setColSpacing] = useState(2.5)
  const [anchor, setAnchor] = useState<{ lat: number; lon: number } | null>(null)
  const [pickingAnchor, setPickingAnchor] = useState(false)
  const [manualAddMode, setManualAddMode] = useState(false)
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

  // Toàn bộ thao tác sửa tay dưới đây chỉ là state cục bộ trên FE (giống cách map_picker.py làm, không có API riêng) —
  // mỗi lần sửa gọi lại onDetected() để yoloResult ở trang cha (dùng cho CSV/Publish) luôn khớp dữ liệu đã sửa.
  function applyEdit(next: DetectMissionTreesResult) {
    setResult(next)
    onDetected(next)
  }
  function confirmMissingTree(tree: DetectedTree) {
    if (!result) return
    const missingTrees = result.missingTrees.filter(t => t.id !== tree.id)
    const activeTrees = [...result.activeTrees, { ...tree, status: 'DETECTED', source: 'Xác nhận thủ công', confidence: 1 }]
    applyEdit({ ...result, activeTrees, missingTrees, totalUniqueTrees: activeTrees.length, totalMissingTrees: missingTrees.length })
  }
  function dismissMissingTree(tree: DetectedTree) {
    if (!result) return
    const missingTrees = renumberAfterRemoval(result.missingTrees.filter(t => t.id !== tree.id), tree.row, tree.col)
    const activeTrees = renumberAfterRemoval(result.activeTrees, tree.row, tree.col)
    applyEdit({ ...result, activeTrees, missingTrees, totalMissingTrees: missingTrees.length })
  }
  function deleteActiveTree(tree: DetectedTree) {
    if (!result) return
    const activeTrees = renumberAfterRemoval(result.activeTrees.filter(t => t.id !== tree.id), tree.row, tree.col)
    const missingTrees = renumberAfterRemoval(result.missingTrees, tree.row, tree.col)
    applyEdit({ ...result, activeTrees, missingTrees, totalUniqueTrees: activeTrees.length })
  }
  function addManualTree(lat: number, lon: number) {
    if (!result) return
    // Nếu click gần 1 điểm khuyết có sẵn (~2m), coi như xác nhận điểm đó thay vì tạo cây mới chồng lấn.
    const nearbyMissing = result.missingTrees.find(tree => Math.hypot(tree.lat - lat, tree.lon - lon) < 0.00002)
    if (nearbyMissing) { confirmMissingTree(nearbyMissing); return }
    const row = 1
    const col = result.activeTrees.filter(tree => tree.row === row).length + 1
    const tree: DetectedTree = { id: `tree_r${row}_c${col}_manual_${Date.now()}`, row, col, lat, lon, confidence: 1, status: 'DETECTED', source: 'Chấm tay', isAnchor: false }
    const activeTrees = [...result.activeTrees, tree]
    applyEdit({ ...result, activeTrees, totalUniqueTrees: activeTrees.length })
  }

  const gridRows = result ? Math.max(0, ...result.activeTrees.map(tree => tree.row)) : 0
  const gridCols = result ? Math.max(0, ...result.activeTrees.map(tree => tree.col)) : 0

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
        : <Space>Cây neo: 🟢 Tự động<Button size="small" disabled={!result} onClick={() => { setPickingAnchor(true); setManualAddMode(false) }}>📍 Chọn Cây Neo (H1-C1)</Button></Space>}
    </div>
    <Space style={{ marginBottom: 8 }}>
      <Button size="small" type={manualAddMode ? 'primary' : 'default'} disabled={!result} onClick={() => { setManualAddMode(value => !value); setPickingAnchor(false) }}>
        {manualAddMode ? '🎯 Đang chấm trụ (click bản đồ để thêm)' : '➕ Chấm thêm trụ bằng tay'}
      </Button>
    </Space>
    <div style={{ height: 480, marginBottom: 12 }}>
      <MapContainer bounds={leafletBounds} maxZoom={22} style={{ height: '100%', width: '100%' }}>
        <MapBaseLayers />
        <ImageOverlay url={previewUrl} bounds={leafletBounds} />
        {boundaryPolygon ? <Polygon positions={boundaryPolygon.coordinates[0].map(([lng, lat]): [number, number] => [lat, lng])} pathOptions={{ color: activeColor, fillOpacity: 0.03 }} /> : null}
        <ClickCapture enabled={manualAddMode} bounds={bounds} onAdd={addManualTree} onOutsideBounds={() => message.warning('Chỉ chấm trụ được trong phạm vi ảnh orthophoto.')} />
        {result?.missingTrees.map(tree => <CircleMarker key={tree.id} center={[tree.lat, tree.lon]} radius={6} pathOptions={{ color: missingColor, fillColor: '#fff', fillOpacity: 0.6, dashArray: '2 2' }}>
          <Popup><div style={{ fontSize: 12 }}>
            <strong>Nghi ngờ khuyết: Hàng {tree.row} - Cột {tree.col}</strong>
            <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
              <Button size="small" type="primary" onClick={() => confirmMissingTree(tree)}>Xác nhận có cây</Button>
              <Button size="small" danger onClick={() => dismissMissingTree(tree)}>Xóa điểm khuyết</Button>
            </div>
          </div></Popup>
        </CircleMarker>)}
        {result?.activeTrees.map(tree => <CircleMarker key={tree.id} center={[tree.lat, tree.lon]} radius={isPickedAnchor(tree) ? 9 : 5}
          pathOptions={{ color: isPickedAnchor(tree) ? anchorColor : activeColor, fillColor: isPickedAnchor(tree) ? '#fde68a' : activeColor, fillOpacity: 0.9 }}
          eventHandlers={{ click: () => pickTreeAsAnchor(tree) }}>
          {!pickingAnchor ? <Popup><div style={{ fontSize: 12 }}>
            <strong>Trụ Hàng {tree.row} - Cột {tree.col}</strong>
            <p style={{ margin: '4px 0' }}>Nguồn: {tree.source} · Độ tin cậy: {(tree.confidence * 100).toFixed(0)}%</p>
            <Popconfirm title="Xóa trụ này?" onConfirm={() => deleteActiveTree(tree)} okText="Xóa" cancelText="Hủy">
              <Button size="small" danger>Xóa cây</Button>
            </Popconfirm>
          </div></Popup> : null}
        </CircleMarker>)}
      </MapContainer>
    </div>
    {detectMutation.error ? <Alert type="error" showIcon message={missionError(detectMutation.error)} /> : null}
    <Button type="primary" loading={detectMutation.isPending} onClick={() => detectMutation.mutate()}>Chạy YOLO</Button>
    {result ? <>
      <Alert style={{ marginTop: 12 }} type="success" showIcon message={`Quét ${result.totalTilesScanned} tile · ${result.totalUniqueTrees} cây phát hiện · ${result.totalMissingTrees} cây thiếu (nội suy).`} description={`Model: ${result.modelName}`} />
      <Space wrap style={{ marginTop: 8 }}>
        <Tag color="success">🟢 Trụ nhận diện: {result.activeTrees.length}</Tag>
        <Tag color="default">🔴 Nghi ngờ khuyết: {result.missingTrees.length}</Tag>
        <Tag>📐 Kích thước lưới: {gridRows} hàng × {gridCols} cột</Tag>
      </Space>
    </> : null}
  </>
}
