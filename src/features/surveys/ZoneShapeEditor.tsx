import 'leaflet/dist/leaflet.css'
import { Alert, Button, Modal, Space } from 'antd'
import { divIcon, type Marker as LeafletMarker } from 'leaflet'
import { useState } from 'react'
import { CircleMarker, GeoJSON, ImageOverlay, MapContainer, Marker, Polygon, Polyline, Tooltip, useMapEvents } from 'react-leaflet'
import { MapBaseLayers } from '../../components/MapBaseLayers'
import { mapBoundary, previewUrl } from '../baseMaps/workflow'
import type { GeoJsonPolygon } from '../farms/types'
import type { OrthophotoBounds } from '../missions/missionTypes'
import { polygonVertices, zoneCoversPoint, zonePolygon, type ZoneVertex } from './zoneGeometry'
import './comboReviewVisuals.css'

const vertexIcon = divIcon({
  className: 'zone-shape-vertex', html: '<span aria-hidden="true"></span>', iconSize: [14, 14], iconAnchor: [7, 7],
})
const mapPoint = ([lon, lat]: ZoneVertex): [number, number] => [lat, lon]

function AddVertices({ add }: { add: (point: ZoneVertex) => void }) {
  useMapEvents({ click: ({ latlng }) => add([latlng.lng, latlng.lat]) })
  return null
}

type Props = {
  title: string; geometry: GeoJsonPolygon | null; boundaryGeoJson: string | null
  bounds: OrthophotoBounds | null; imageUrl: string | null
  memberPoints: { id: string; lon: number; lat: number; label: string }[]
  onSave: (geometry: GeoJsonPolygon) => void; onClose: () => void
}

export default function ZoneShapeEditor({ title, geometry, boundaryGeoJson, bounds, imageUrl, memberPoints, onSave, onClose }: Props) {
  const [rings, setRings] = useState<ZoneVertex[][]>(() => geometry ? polygonVertices(geometry) : [[]])
  const initial = geometry ? polygonVertices(geometry) : [[]]
  const vertices = rings[0] ?? []
  const setOuter = (outer: ZoneVertex[]) => setRings(current => [outer, ...current.slice(1)])
  const boundary = mapBoundary(boundaryGeoJson)
  const draft = zonePolygon(rings)
  const image = previewUrl(imageUrl)
  const imageBounds: [[number, number], [number, number]] | undefined = bounds && bounds.minLat < bounds.maxLat && bounds.minLon < bounds.maxLon
    ? [[bounds.minLat, bounds.minLon], [bounds.maxLat, bounds.maxLon]] : undefined
  const fallbackPoints = initial.flat().length ? initial.flat().map(mapPoint)
    : boundary?.coordinates[0]?.map(([lon, lat]): [number, number] => [lat, lon])
  const mapBounds = fallbackPoints?.length ? fallbackPoints : imageBounds
  const validation = draft && boundary && vertices.some(([lon, lat]) => !zoneCoversPoint(boundary, lon, lat))
    ? 'Đỉnh của vùng phải nằm trong ranh giới nông trại.'
    : null

  return <Modal open width={900} title={title} okText="Lưu viền vùng" cancelText="Hủy" onCancel={onClose}
    okButtonProps={{ disabled: !draft || !!validation }} onOk={() => { if (draft && !validation) onSave(draft) }}>
    <p className="form-hint">Bấm bản đồ để thêm đỉnh hoặc kéo các đỉnh để chỉnh viền. Chọn Vẽ lại để bắt đầu một viền mới.</p>
    <Space wrap className="workflow-toolbar">
      <Button onClick={() => setRings([[]])}>Vẽ lại</Button>
      <Button disabled={!vertices.length} onClick={() => setOuter(vertices.slice(0, -1))}>Bỏ đỉnh cuối</Button>
      <Button onClick={() => setRings(initial)}>Khôi phục viền</Button>
    </Space>
    {mapBounds ? <div className="zone-shape-map"><MapContainer bounds={mapBounds} boundsOptions={{ padding: [24, 24] }} maxZoom={22}
      doubleClickZoom={false} style={{ height: '100%', width: '100%' }}>
      <MapBaseLayers />
      {image && imageBounds ? <ImageOverlay url={image} bounds={imageBounds} /> : null}
      {boundary ? <GeoJSON data={boundary} interactive={false} style={{ color: '#08764e', fill: false, weight: 2 }} /> : null}
      {draft ? <Polygon positions={rings.map(ring => ring.map(mapPoint))} interactive={false} pathOptions={{ color: '#ae620e', fillOpacity: 0.18 }} />
        : <Polyline positions={vertices.map(mapPoint)} interactive={false} />}
      {memberPoints.map(({ id, lon, lat, label }) => <CircleMarker key={id} center={[lat, lon]} radius={5} bubblingMouseEvents={false}
        pathOptions={{ color: '#fff', weight: 1, fillOpacity: 1, fillColor: draft && zoneCoversPoint(draft, lon, lat) ? '#08764e' : '#b42318' }}>
        <Tooltip>{label}</Tooltip>
      </CircleMarker>)}
      <AddVertices add={point => setRings(current => [[...(current[0] ?? []), point], ...current.slice(1)])} />
      {vertices.map((vertex, index) => <Marker key={index} position={mapPoint(vertex)} icon={vertexIcon} draggable
        eventHandlers={{ dragend: event => {
          const point = (event.target as LeafletMarker).getLatLng()
          setRings(current => [current[0].map((item, indexOfVertex) => indexOfVertex === index ? [point.lng, point.lat] : item), ...current.slice(1)])
        } }}>
        <Tooltip>Đỉnh {index + 1}</Tooltip>
      </Marker>)}
    </MapContainer></div> : <Alert type="warning" showIcon title="Chưa có tọa độ để vẽ vùng" />}
    {memberPoints.length ? <p className="form-hint">Điểm xanh nằm trong viền. Điểm đỏ nằm ngoài viền.</p> : null}
    {validation ? <Alert className="workflow-notice" type="error" showIcon title={validation} /> : null}
  </Modal>
}
