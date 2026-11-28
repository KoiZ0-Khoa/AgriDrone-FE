import '../baseMaps/baseMaps.css'
import { latLngBounds, type LatLngTuple } from 'leaflet'
import { useEffect, useRef } from 'react'
import { CircleMarker, Polygon, Polyline, Tooltip, useMap } from 'react-leaflet'
import { BaseMapViewer } from '../baseMaps/BaseMapViewer'
import type { MapPlant, MapVersionDetail } from '../baseMaps/types'
import { mapBoundary } from '../baseMaps/workflow'
import type { ComboReviewSelection } from './ComboReviewVisuals'
import { healthStatusColors } from './plantHealthMapWorkflow'
import { comboBlockerLabel, comboFindingLabel, type ComboReviewDraft, type comboReviewPlantLinks } from './resultReviewWorkflow'
import type { ComboPendingBatch } from './v3Types'

const position = (lat: number, lon: number): LatLngTuple | null =>
  Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? [lat, lon] : null

// Bay tới mục đang chọn mỗi khi đổi lựa chọn: vùng thì vừa khung vùng, điểm thì phóng to đủ để thấy từng trụ.
function FocusSelection({ focusKey, point, bounds }: { focusKey: string; point: LatLngTuple | null; bounds: LatLngTuple[] | null }) {
  const map = useMap()
  const target = useRef({ point, bounds })
  target.current = { point, bounds }
  useEffect(() => {
    const { point, bounds } = target.current
    if (bounds?.length) map.flyToBounds(latLngBounds(bounds), { padding: [32, 32], maxZoom: 21, duration: 0.6 })
    else if (point) map.flyTo(point, Math.max(map.getZoom(), FOCUS_ZOOM), { duration: 0.6 })
  }, [map, focusKey])
  return null
}

const FOCUS_ZOOM = 20

export type ZoneMemberPoint = { id: string; lat: number; lon: number; label: string; member: boolean }

type Props = {
  map: MapVersionDetail; batch: ComboPendingBatch; draft: ComboReviewDraft; links: ReturnType<typeof comboReviewPlantLinks>
  selection: ComboReviewSelection; nearestPlant?: Pick<MapPlant, 'lat' | 'lon'>; onSelect: (selection: ComboReviewSelection) => void
  zoneMembers?: ZoneMemberPoint[]; onToggleZoneMember?: (findingId: string) => void
}

export default function ComboReviewMap({ map, batch, draft, links, selection, nearestPlant, onSelect, zoneMembers = [], onToggleZoneMember }: Props) {
  const markers = selection.kind === 'boundary' ? [
    ...batch.boundaryExceptions.map(item => ({
      id: item.sourceReferenceId, point: position(item.latitude, item.longitude), label: comboBlockerLabel(item.boundaryClassification),
    })),
    ...links.gpsFindings.map(item => ({
      id: item.findingId, point: position(item.latitude, item.longitude), label: comboFindingLabel(item.suspectedClassCode),
    })),
  ] : []
  const zones = selection.kind === 'zone' ? batch.diseaseZones.flatMap(zone => {
    const change = draft.zones[zone.sourceProposalId]
    const geometry = mapBoundary(JSON.stringify(change?.decision === 'Adjust' ? change.geometry ?? zone.geometry : zone.geometry))
    return geometry ? [{ zone, rings: geometry.coordinates.map(ring => ring.map(([lon, lat]): LatLngTuple => [lat, lon])) }] : []
  }) : []
  const activePlant = selection.kind === 'finding' && selection.id ? links.plantByFinding.get(selection.id) : undefined
  const activeZone = zones.find(({ zone }) => zone.sourceProposalId === selection.id)
  const center = activeZone ? latLngBounds(activeZone.rings.flat()).getCenter() : null
  const activePoint = activePlant ? position(activePlant.lat, activePlant.lon)
    : center ? position(center.lat, center.lng) : markers.find(item => item.id === selection.id)?.point ?? null

  return <div className="combo-review-map" aria-label="Bản đồ kiểm duyệt COMBO">
    <BaseMapViewer map={map} renderPlant={plant => {
      const findings = selection.kind === 'finding' ? links.findingsByPlant.get(plant.plantId) : undefined
      const accepted = findings?.filter(item => draft.findings[item.findingId]?.decision === 'Accept')
      const suspect = accepted?.find(item => !item.suspectedClassCode.toUpperCase().startsWith('HEALTHY_'))
      const chosen = findings?.find(item => item.findingId === selection.id) ?? suspect ?? findings?.[0]
      const selected = activePlant?.plantId === plant.plantId
      const color = suspect ? healthStatusColors.DISEASE : accepted?.length ? healthStatusColors.HEALTHY_FRUIT : '#6b7280'
      return <CircleMarker key={plant.plantId} center={[plant.lat, plant.lon]} radius={selected ? 8 : 5} bubblingMouseEvents={false}
        pathOptions={{ color: selected ? '#145abb' : '#fff', fillColor: color, fillOpacity: 0.88, weight: selected ? 3 : 1 }}
        eventHandlers={chosen ? { click: () => onSelect({ kind: 'finding', id: chosen.findingId }) } : undefined}>
        <Tooltip>Trụ hàng {plant.row}, cột {plant.col}{findings?.length ? ` · ${findings.length} phát hiện` : ''}</Tooltip>
      </CircleMarker>
    }}>
      {zones.map(({ zone, rings }) => <Polygon key={zone.sourceProposalId} positions={rings} bubblingMouseEvents={false}
        pathOptions={zone === activeZone?.zone ? { color: '#145abb', weight: 4, fillOpacity: 0.18 }
          : { color: '#ae620e', weight: activeZone ? 1 : 2, opacity: activeZone ? 0.55 : 1, dashArray: activeZone ? '6 4' : undefined, fillOpacity: activeZone ? 0.03 : 0.12 }}
        eventHandlers={{ click: () => onSelect({ kind: 'zone', id: zone.sourceProposalId }) }}>
        <Tooltip>{comboFindingLabel(zone.suspectedClassCode)} · {zone.memberships.length} phát hiện</Tooltip>
      </Polygon>)}
      {selection.kind === 'boundary' && activePoint && nearestPlant ? <Polyline positions={[activePoint, [nearestPlant.lat, nearestPlant.lon]]}
        interactive={false} pathOptions={{ color: '#7c3aed', weight: 2, dashArray: '4 4' }} /> : null}
      {markers.map(item => item.point ? <CircleMarker key={item.id} center={item.point} radius={6} bubblingMouseEvents={false}
        pathOptions={{ color: '#ae620e', fillOpacity: selection.id ? 0.45 : 0.75, opacity: selection.id ? 0.6 : 1, weight: 2 }}
        eventHandlers={{ click: () => onSelect({ kind: 'boundary', id: item.id }) }}>
        <Tooltip>{item.label}</Tooltip>
      </CircleMarker> : null)}
      {zoneMembers.map(item => <CircleMarker key={`member:${item.id}:${item.member}`} center={[item.lat, item.lon]} radius={item.member ? 7 : 6} bubblingMouseEvents={false}
        pathOptions={item.member ? { color: '#fff', fillColor: healthStatusColors.DISEASE, fillOpacity: 0.95, weight: 2 }
          : { color: healthStatusColors.DISEASE, fillColor: '#fff', fillOpacity: 0.6, weight: 2, dashArray: '3 3' }}
        eventHandlers={onToggleZoneMember ? { click: () => onToggleZoneMember(item.id) } : undefined}>
        <Tooltip>{item.label}{item.member ? ' · Thuộc vùng' : ' · Không thuộc vùng'}{onToggleZoneMember ? (item.member ? ' · Bấm để bỏ khỏi vùng' : ' · Bấm để thêm lại vào vùng') : ''}</Tooltip>
      </CircleMarker>)}
      {selection.kind === 'boundary' && nearestPlant ? <CircleMarker key={`nearest:${selection.id}`} center={[nearestPlant.lat, nearestPlant.lon]} radius={11}
        bubblingMouseEvents={false} pathOptions={{ color: '#7c3aed', weight: 3, fill: false }}>
        <Tooltip permanent direction="right" offset={[10, 0]}>Trụ đối chiếu</Tooltip>
      </CircleMarker> : null}
      {activePoint && !activeZone ? <>
        <CircleMarker key={`halo:${selection.kind}:${selection.id}`} center={activePoint} radius={18} interactive={false} className="combo-review-focus-halo"
          pathOptions={{ color: '#145abb', weight: 3, fill: false }} />
        <CircleMarker key={`focus:${selection.kind}:${selection.id}`} center={activePoint} radius={9} interactive={false}
          pathOptions={{ color: '#fff', fillColor: '#145abb', fillOpacity: 1, weight: 3 }} />
      </> : null}
      <FocusSelection focusKey={`${selection.kind}:${selection.id ?? ''}`} point={activePoint} bounds={activeZone ? activeZone.rings.flat() : null} />
    </BaseMapViewer>
  </div>
}
