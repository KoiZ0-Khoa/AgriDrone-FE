import 'leaflet/dist/leaflet.css'
import { ArrowLeftOutlined, ReloadOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { Alert, Button, Drawer, Empty, Image, Space, Tag } from 'antd'
import type { ImageOverlay as LeafletImageOverlay } from 'leaflet'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CircleMarker, GeoJSON as GeoJsonLayer, ImageOverlay, MapContainer } from 'react-leaflet'
import { CommonState } from '../../components/CommonState'
import { MapBaseLayers } from '../../components/MapBaseLayers'
import { useAuth } from '../auth/AuthContext'
import { getFarmContext } from './farmOperationsApi'
import * as api from './plantHealthMapApi'
import type { FarmHealthPlant } from './plantHealthMapTypes'
import { diseaseZoneStatusLabels, healthStatusColors, healthStatusLabels, plantHealthMapError } from './plantHealthMapWorkflow'
import type { OrthophotoBounds } from '../missions/missionTypes'

const zoneColor = '#b42318'

// Cắt ImageOverlay theo đúng hình polygon ranh giới vườn (boundaryGeoJson) thay vì để nguyên khung
// chữ nhật bao quanh ảnh — tránh lộ viền trắng/đất trống không thuộc vườn. Dùng clip-path theo %
// vì Leaflet chỉ CSS-transform (pan/zoom) cả thẻ <img>, nên clip-path tính theo % kích thước ảnh
// vẫn bám đúng polygon qua mọi lần pan/zoom mà không cần tính lại.
function boundaryClipPath(boundaryGeoJson: string | null, bounds: OrthophotoBounds): string | null {
  if (!boundaryGeoJson) return null
  let ring: [number, number][] | null = null
  try {
    const geometry = JSON.parse(boundaryGeoJson)
    if (geometry.type === 'Polygon') ring = geometry.coordinates[0]
    else if (geometry.type === 'MultiPolygon') ring = geometry.coordinates[0]?.[0] ?? null
  } catch { ring = null }
  if (!ring || ring.length < 3) return null
  const { minLat, maxLat, minLon, maxLon } = bounds
  const latSpan = maxLat - minLat
  const lonSpan = maxLon - minLon
  if (latSpan <= 0 || lonSpan <= 0) return null
  const points = ring.map(([lon, lat]) => {
    const x = ((lon - minLon) / lonSpan) * 100
    const y = ((maxLat - lat) / latSpan) * 100
    return `${x.toFixed(2)}% ${y.toFixed(2)}%`
  })
  return `polygon(${points.join(', ')})`
}

// Nới maxBounds rộng hơn khung ảnh vườn một khoảng theo tỉ lệ, để vẫn thấy nền vệ tinh xung quanh
// khi kéo map, nhưng không kéo được quá xa tới mức mất hẳn vườn khỏi màn hình.
const PAN_PADDING_RATIO = 0.6
function paddedBounds(bounds: OrthophotoBounds): [[number, number], [number, number]] {
  const latPad = (bounds.maxLat - bounds.minLat) * PAN_PADDING_RATIO
  const lonPad = (bounds.maxLon - bounds.minLon) * PAN_PADDING_RATIO
  return [[bounds.minLat - latPad, bounds.minLon - lonPad], [bounds.maxLat + latPad, bounds.maxLon + lonPad]]
}

export function ManagerPlantHealthMapPage() {
  const { farmId = '' } = useParams()
  const token = useAuth().session!.accessToken
  const [selectedPlant, setSelectedPlant] = useState<FarmHealthPlant | null>(null)
  const imageOverlayRef = useRef<LeafletImageOverlay>(null)

  const farmQuery = useQuery({ queryKey: ['manager-farm-context', farmId], queryFn: ({ signal }) => getFarmContext(token, farmId, signal) })
  const mapQuery = useQuery({
    queryKey: ['farm-plant-health-map', farmId, farmQuery.data?.tenantId],
    queryFn: ({ signal }) => api.getFarmPlantHealthMap(token, farmId, farmQuery.data!.tenantId, signal),
    enabled: Boolean(farmQuery.data),
  })

  const baseMap = mapQuery.data?.baseMap
  const boundaryGeoJson = mapQuery.data?.boundaryGeoJson ?? null
  const clipPath = useMemo(() => baseMap ? boundaryClipPath(boundaryGeoJson, baseMap.bounds) : null, [baseMap, boundaryGeoJson])
  useEffect(() => {
    const imageElement = imageOverlayRef.current?.getElement()
    if (imageElement) imageElement.style.clipPath = clipPath ?? ''
  })

  const back = <Link className="back-link" to={`/manager/farms/${encodeURIComponent(farmId)}`}><ArrowLeftOutlined /> Nông trại</Link>
  if (farmQuery.isPending) return <>{back}<CommonState type="loading" title="Đang tải nông trại" /></>
  if (farmQuery.isError) return <>{back}<CommonState type="error" description={plantHealthMapError(farmQuery.error)} retry={() => farmQuery.refetch()} /></>
  const farm = farmQuery.data

  return <>
    {back}
    <section className="resource-page-heading"><div><span className="page-kicker">BẢN ĐỒ SỨC KHỎE CÂY</span><h1>{farm.name}</h1><p>Tổng hợp tình trạng cây trồng từ các chuyến bay quét bệnh.</p></div>
      <Button icon={<ReloadOutlined />} loading={mapQuery.isFetching} onClick={() => { void mapQuery.refetch() }}>Tải lại</Button>
    </section>

    {mapQuery.isPending ? <CommonState type="loading" title="Đang tải bản đồ sức khỏe cây" />
      : mapQuery.isError ? <CommonState type="error" description={plantHealthMapError(mapQuery.error)} retry={() => mapQuery.refetch()} />
      : !mapQuery.data.baseMap ? <CommonState type="empty" title="Chưa có bản đồ nền" description="Nông trại này chưa publish bản đồ nền (nhiệm vụ Publish GPS cây) nên chưa thể hiển thị bản đồ sức khỏe." />
      : <>
        <section className="resource-panel">
          <div className="resource-panel-heading"><div><strong>Thống kê</strong><span>Tổng hợp từ {mapQuery.data.summary.totalPlants} trụ cây</span></div></div>
          <Space wrap size="large" style={{ marginTop: 8 }}>
            <Tag color="default">Tổng số trụ: {mapQuery.data.summary.totalPlants}</Tag>
            <Tag color="success">Bình thường: {mapQuery.data.summary.normalPlants}</Tag>
            <Tag color="blue">Có trái khỏe: {mapQuery.data.summary.healthyFruitPlants}</Tag>
            <Tag color="error">Phát hiện bệnh: {mapQuery.data.summary.diseasePlants}</Tag>
          </Space>
          {Object.keys(mapQuery.data.summary.diseaseBreakdown).length > 0 ? <ul style={{ marginTop: 12 }}>
            {Object.entries(mapQuery.data.summary.diseaseBreakdown).map(([name, count]) => <li key={name} className="form-hint" style={{ display: 'inline-block', marginRight: 12 }}>{name}: {count}</li>)}
          </ul> : null}
        </section>

        <section className="resource-panel workflow-section">
          <div className="resource-panel-heading"><div><strong>Bản đồ</strong><span>Click vào 1 cây để xem chi tiết vết bệnh/trái.</span></div></div>
          <div style={{ height: 560, marginTop: 12 }}>
            <MapContainer bounds={[[mapQuery.data.baseMap.bounds.minLat, mapQuery.data.baseMap.bounds.minLon], [mapQuery.data.baseMap.bounds.maxLat, mapQuery.data.baseMap.bounds.maxLon]]} maxBounds={paddedBounds(mapQuery.data.baseMap.bounds)} maxBoundsViscosity={1} maxZoom={22} style={{ height: '100%', width: '100%' }}>
              <MapBaseLayers />
              <ImageOverlay ref={imageOverlayRef} url={mapQuery.data.baseMap.previewUrl} bounds={[[mapQuery.data.baseMap.bounds.minLat, mapQuery.data.baseMap.bounds.minLon], [mapQuery.data.baseMap.bounds.maxLat, mapQuery.data.baseMap.bounds.maxLon]]} />
              {mapQuery.data.zones.filter(zone => zone.status !== 'REJECTED').map(zone => {
                let geometry: GeoJSON.GeoJsonObject | null = null
                try { geometry = JSON.parse(zone.geometryGeoJson) } catch { geometry = null }
                return geometry ? <GeoJsonLayer key={zone.id} data={geometry} pathOptions={{ color: zoneColor, weight: 2, fillOpacity: 0.12 }} /> : null
              })}
              {mapQuery.data.plants.map(plant => <CircleMarker key={plant.id} center={[plant.lat, plant.lon]} radius={6}
                pathOptions={{ color: healthStatusColors[plant.healthStatus], fillColor: healthStatusColors[plant.healthStatus], fillOpacity: 0.85 }}
                eventHandlers={{ click: () => setSelectedPlant(plant) }} />)}
            </MapContainer>
          </div>
          <Space style={{ marginTop: 8 }} size="middle">
            <span className="form-hint" style={{ color: healthStatusColors.NORMAL }}>● Bình thường</span>
            <span className="form-hint" style={{ color: healthStatusColors.HEALTHY_FRUIT }}>● Có trái khỏe</span>
            <span className="form-hint" style={{ color: '#b42318' }}>● Phát hiện bệnh</span>
            <span className="form-hint">▭ Vùng cảnh báo ổ dịch</span>
          </Space>
        </section>

        <section className="resource-panel workflow-section">
          <div className="resource-panel-heading"><div><strong>Vùng cảnh báo ổ dịch</strong><span>{mapQuery.data.zones.length} vùng</span></div></div>
          {mapQuery.data.zones.length === 0 ? <Empty description="Chưa phát hiện ổ dịch nào." />
            : <Space direction="vertical" style={{ width: '100%' }}>
              {mapQuery.data.zones.map(zone => <Alert key={zone.id} type={zone.status === 'REJECTED' ? 'info' : 'warning'} showIcon
                message={<>{zone.diseaseNameVi || zone.diseaseName} · {zone.totalTrees} cây <Tag>{diseaseZoneStatusLabels[zone.status] ?? zone.status}</Tag></>}
                description={zone.alertType} />)}
            </Space>}
        </section>
      </>}

    <Drawer open={selectedPlant !== null} title={selectedPlant ? `Trụ ${selectedPlant.plantCode} · Hàng ${selectedPlant.row} - Cột ${selectedPlant.col}` : ''} width={420} onClose={() => setSelectedPlant(null)}>
      {selectedPlant ? <>
        <Tag color={selectedPlant.healthStatus === 'DISEASE' ? 'error' : selectedPlant.healthStatus === 'HEALTHY_FRUIT' ? 'blue' : 'success'}>{healthStatusLabels[selectedPlant.healthStatus]}</Tag>
        <p className="form-hint" style={{ marginTop: 12 }}>{selectedPlant.lat.toFixed(6)}, {selectedPlant.lon.toFixed(6)}</p>
        {selectedPlant.observations.length === 0 ? <Empty description="Chưa có vết ghi nhận nào." />
          : <Space direction="vertical" style={{ width: '100%', marginTop: 12 }}>
            {selectedPlant.observations.map(observation => <div key={observation.id} className="resource-panel" style={{ padding: 12 }}>
              <strong>{observation.classNameVi || observation.className}</strong>
              <p className="form-hint">Độ tin cậy {(observation.confidence * 100).toFixed(0)}% · lệch {observation.gpsDistanceM.toFixed(1)} m</p>
              {observation.cropImageUrl ? <Image src={observation.cropImageUrl} width="100%" alt={observation.imageName} /> : null}
            </div>)}
          </Space>}
      </> : null}
    </Drawer>
  </>
}
