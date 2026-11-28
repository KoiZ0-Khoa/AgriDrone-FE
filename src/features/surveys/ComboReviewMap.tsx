import 'leaflet/dist/leaflet.css'
import '../baseMaps/baseMaps.css'
import { useQuery } from '@tanstack/react-query'
import { Alert, Button } from 'antd'
import { latLngBounds, type LatLngTuple } from 'leaflet'
import { useEffect, useState } from 'react'
import { CircleMarker, GeoJSON, ImageOverlay, MapContainer, Polygon, Tooltip, useMap } from 'react-leaflet'
import { MapBaseLayers } from '../../components/MapBaseLayers'
import { getMapVersion } from '../baseMaps/api'
import { mapBoundary, previewUrl, viewerBounds } from '../baseMaps/workflow'
import type { ComboReviewSelection } from './ComboReviewVisuals'
import { comboBlockerLabel, comboFindingLabel } from './resultReviewWorkflow'
import type { ComboPendingBatch } from './v3Types'

const position = (latitude: number, longitude: number): LatLngTuple | null =>
  Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180
    ? [latitude, longitude] : null

function PanToSelection({ point }: { point: LatLngTuple | null }) {
  const map = useMap()
  const [lat, lon] = point ?? []
  useEffect(() => {
    if (lat !== undefined && lon !== undefined) map.panInside([lat, lon], { padding: [32, 32] })
  }, [map, lat, lon])
  return null
}

type Props = {
  token: string; farmId: string; mapVersionId: string; batch: ComboPendingBatch
  selection: ComboReviewSelection; onSelect: (selection: ComboReviewSelection) => void
}

export default function ComboReviewMap({ token, farmId, mapVersionId, batch, selection, onSelect }: Props) {
  const mapQuery = useQuery({
    queryKey: ['combo-review-map-version', farmId, mapVersionId],
    queryFn: ({ signal }) => getMapVersion(token, farmId, mapVersionId, signal),
    enabled: Boolean(mapVersionId), retry: false, refetchOnWindowFocus: false,
  })
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const map = mapQuery.data
  const boundary = mapBoundary(map?.boundaryGeoJson ?? null)
  const imageBounds = viewerBounds({ bounds: map?.bounds ?? null, boundaryGeoJson: null, plants: [] })
  const image = imageBounds ? previewUrl(map?.previewUrl ?? null) : null
  const findings = batch.findings.flatMap(finding => {
    const point = position(finding.latitude, finding.longitude)
    return point ? [{ id: finding.findingId, point, label: comboFindingLabel(finding.suspectedClassCode), color: finding.suspectedClassCode.toUpperCase().startsWith('HEALTHY_') ? '#15664b' : '#b42318' }] : []
  })
  const exceptions = batch.boundaryExceptions.flatMap(exception => {
    const point = position(exception.latitude, exception.longitude)
    return point ? [{ id: exception.sourceReferenceId, point, label: comboBlockerLabel(exception.boundaryClassification), color: exception.boundaryClassification === 'OUT_OF_BOUNDARY' ? '#b42318' : '#ae620e' }] : []
  })
  const zones = batch.diseaseZones.flatMap(zone => {
    const geometry = mapBoundary(JSON.stringify(zone.geometry))
    return geometry ? [{ zone, rings: geometry.coordinates.map(ring => ring.map(([lon, lat]): LatLngTuple => [lat, lon])) }] : []
  })
  const allPositions = [...findings.map(item => item.point), ...exceptions.map(item => item.point), ...zones.flatMap(item => item.rings.flat())]
  const bounds = (map && viewerBounds(map)) || (allPositions.length ? latLngBounds(allPositions) : null)
  const markers = selection.kind === 'finding' ? findings : selection.kind === 'boundary' ? exceptions : []
  const selectedZone = selection.kind === 'zone' ? zones.find(item => item.zone.sourceProposalId === selection.id) : undefined
  const zoneCenter = selectedZone ? latLngBounds(selectedZone.rings.flat()).getCenter() : null
  const activePoint = markers.find(item => item.id === selection.id)?.point ?? (zoneCenter ? [zoneCenter.lat, zoneCenter.lng] : null)

  if (mapVersionId && mapQuery.isPending) return <div className="combo-review-map-placeholder" role="status">Đang tải bản đồ khảo sát…</div>
  if (!bounds) return <Alert showIcon type="info" title="Chưa có tọa độ để hiển thị bản đồ" />

  return <div className="combo-review-map">
    {!image || failedUrl === image ? <Alert showIcon type="warning" title="Chưa tải được ảnh trực giao"
      description="Các tọa độ và vùng có dữ liệu vẫn hiển thị trên nền vệ tinh."
      action={mapVersionId ? <Button size="small" onClick={() => { setFailedUrl(null); void mapQuery.refetch() }}>Tải lại ảnh nền</Button> : undefined} /> : null}
    <div className="base-map-canvas combo-review-map-canvas" aria-label="Bản đồ kiểm duyệt COMBO">
      <MapContainer key={map?.versionId ?? 'capture-points'} bounds={bounds} boundsOptions={{ padding: [28, 28] }} maxZoom={22} scrollWheelZoom={false} preferCanvas style={{ height: '100%', width: '100%' }}>
        <MapBaseLayers />
        {image && imageBounds && failedUrl !== image ? <ImageOverlay key={image} url={image} bounds={imageBounds} eventHandlers={{ error: () => setFailedUrl(image) }} /> : null}
        {boundary ? <GeoJSON data={boundary} interactive={false} style={{ color: '#08764e', weight: 2, fill: false, dashArray: '6 4' }} /> : null}
        {selection.kind === 'zone' ? zones.map(({ zone, rings }) => {
          const selected = zone.sourceProposalId === selectedZone?.zone.sourceProposalId
          return <Polygon key={zone.sourceProposalId} positions={rings} bubblingMouseEvents={false}
            pathOptions={{ color: selected ? '#145abb' : '#ae620e', weight: selected ? 4 : 2, fillOpacity: selected ? 0.26 : 0.12 }}
            eventHandlers={{ click: () => onSelect({ kind: 'zone', id: zone.sourceProposalId }) }}>
            <Tooltip>{comboFindingLabel(zone.suspectedClassCode)} · {zone.memberships.length} phát hiện</Tooltip>
          </Polygon>
        }) : null}
        {markers.map(item => <CircleMarker key={`${selection.kind}:${item.id}`} center={item.point} radius={item.id === selection.id ? 9 : 5}
          bubblingMouseEvents={false} pathOptions={{ color: item.id === selection.id ? '#145abb' : '#fff', weight: item.id === selection.id ? 3 : 1, fillColor: item.color, fillOpacity: 0.9 }}
          eventHandlers={{ click: () => onSelect({ kind: selection.kind, id: item.id }) }}><Tooltip direction="top">{item.label}</Tooltip></CircleMarker>)}
        {activePoint && selection.kind !== 'zone' ? <CircleMarker center={activePoint} radius={11} interactive={false} pathOptions={{ color: '#145abb', weight: 2, fill: false }} /> : null}
        <PanToSelection point={activePoint} />
      </MapContainer>
    </div>
  </div>
}
