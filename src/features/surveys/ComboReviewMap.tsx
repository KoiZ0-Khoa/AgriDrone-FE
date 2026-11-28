import '../baseMaps/baseMaps.css'
import { latLngBounds, type LatLngTuple } from 'leaflet'
import { useEffect } from 'react'
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

function PanToSelection({ point }: { point: LatLngTuple | null }) {
  const map = useMap()
  const [lat, lon] = point ?? []
  useEffect(() => {
    if (lat !== undefined && lon !== undefined) map.panInside([lat, lon], { padding: [32, 32] })
  }, [map, lat, lon])
  return null
}

type Props = {
  map: MapVersionDetail; batch: ComboPendingBatch; draft: ComboReviewDraft; links: ReturnType<typeof comboReviewPlantLinks>
  selection: ComboReviewSelection; nearestPlant?: Pick<MapPlant, 'lat' | 'lon'>; onSelect: (selection: ComboReviewSelection) => void
}

export default function ComboReviewMap({ map, batch, draft, links, selection, nearestPlant, onSelect }: Props) {
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
        pathOptions={{ color: zone === activeZone?.zone ? '#145abb' : '#ae620e', weight: zone === activeZone?.zone ? 4 : 2, fillOpacity: 0.16 }}
        eventHandlers={{ click: () => onSelect({ kind: 'zone', id: zone.sourceProposalId }) }}>
        <Tooltip>{comboFindingLabel(zone.suspectedClassCode)} · {zone.memberships.length} phát hiện</Tooltip>
      </Polygon>)}
      {selection.kind === 'boundary' && activePoint && nearestPlant ? <Polyline positions={[activePoint, [nearestPlant.lat, nearestPlant.lon]]}
        interactive={false} pathOptions={{ color: '#7c3aed', weight: 2, dashArray: '4 4' }} /> : null}
      {markers.map(item => item.point ? <CircleMarker key={item.id} center={item.point} radius={6} bubblingMouseEvents={false}
        pathOptions={{ color: item.id === selection.id ? '#145abb' : '#ae620e', fillOpacity: 0.75, weight: 2 }}
        eventHandlers={{ click: () => onSelect({ kind: 'boundary', id: item.id }) }}>
        <Tooltip>{item.label}</Tooltip>
      </CircleMarker> : null)}
      <PanToSelection point={activePoint} />
    </BaseMapViewer>
  </div>
}
