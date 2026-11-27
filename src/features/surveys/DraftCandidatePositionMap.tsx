import 'leaflet/dist/leaflet.css'
import '../baseMaps/baseMaps.css'
import { useQuery } from '@tanstack/react-query'
import { Alert, Button } from 'antd'
import { divIcon, type LatLng, type Marker as LeafletMarker } from 'leaflet'
import { useState } from 'react'
import { CircleMarker, ImageOverlay, MapContainer, Marker, Polygon, Tooltip, useMapEvents } from 'react-leaflet'
import { MapBaseLayers } from '../../components/MapBaseLayers'
import { readableCode } from '../../components/RecordReference'
import { previewUrl, viewerBounds } from '../baseMaps/workflow'
import { getOrthophotoStatus } from '../missions/missionApi'
import { isWithinOrthophotoBounds } from '../missions/missionWorkflow'
import { getFarmContext } from './farmOperationsApi'
import type { BaseMapDraft, MappingCandidate } from './baseMapTypes'
import { reviewMapPosition, stateToken, validGuid, type ReviewMapPosition } from './baseMapWorkflow'

const positionIcon = divIcon({
  className: 'base-map-edit-marker', html: '<span aria-hidden="true">+</span>', iconSize: [32, 32], iconAnchor: [16, 16],
})

function PickPosition({ pick }: { pick: (position: LatLng) => boolean }) {
  useMapEvents({ click: event => { pick(event.latlng) } })
  return null
}

type Props = {
  token: string
  draft: BaseMapDraft
  candidate: MappingCandidate
  selected: ReviewMapPosition | null
  disabled: boolean
  onPick: (position: ReviewMapPosition) => void
  onReset: () => void
}

export default function DraftCandidatePositionMap({ token, draft, candidate, selected, disabled, onPick, onReset }: Props) {
  const { farmId, sourceMissionId, farmBoundaryVersionId } = draft
  const canReadImage = !!sourceMissionId && validGuid(sourceMissionId)
  const image = useQuery({
    queryKey: ['draft-review-orthophoto', farmId, sourceMissionId],
    queryFn: ({ signal }) => getOrthophotoStatus(token, farmId, sourceMissionId!, signal),
    enabled: canReadImage, retry: false, refetchOnWindowFocus: false,
  })
  const farmContext = useQuery({
    queryKey: ['manager-farm-context', farmId],
    queryFn: ({ signal }) => getFarmContext(token, farmId, signal),
    enabled: !!farmBoundaryVersionId, retry: false, refetchOnWindowFocus: false,
  })
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null)
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const [outsideImage, setOutsideImage] = useState(false)
  const photo = image.data?.status === 'COMPLETED' ? image.data : null
  const photoBounds = photo?.bounds ?? null
  const imageBounds = viewerBounds({ bounds: photoBounds, plants: [], boundaryGeoJson: null })
  const url = imageBounds ? previewUrl(photo?.previewUrl ?? null) : null
  const ready = !!url && loadedUrl === url && failedUrl !== url
  const editing = ready && !disabled
  const saved = reviewMapPosition(candidate.correctedLatitude ?? candidate.latitude, candidate.correctedLongitude ?? candidate.longitude)
  const point = selected ?? saved
  const changed = !!selected && (selected[0] !== saved?.[0] || selected[1] !== saved?.[1])
  const boundary = farmContext.data?.approvedBoundary
  const rings = boundary && boundary.id.toLowerCase() === farmBoundaryVersionId?.toLowerCase()
    ? boundary.geometry?.coordinates.map(ring => ring.map(([lon, lat]): ReviewMapPosition => [lat, lon]))
    : undefined

  function pick(position: LatLng) {
    if (!editing || !photoBounds) return false
    if (!isWithinOrthophotoBounds(position.lat, position.lng, photoBounds)) {
      setOutsideImage(true)
      return false
    }
    const coordinates = reviewMapPosition(position.lat, position.lng)
    if (!coordinates) return false
    setOutsideImage(false)
    onPick(coordinates)
    return true
  }

  if (!point && !imageBounds) return <Alert type="info" showIcon className="workflow-notice" title={image.isFetching ? 'Đang tải ảnh trực giao…' : 'Chưa có tọa độ để mở bản đồ.'} />

  return <section className="draft-position-section" aria-label="Bản đồ chỉnh vị trí trụ">
    <div className="draft-position-toolbar">
      <p className="form-hint">{ready
        ? 'Bấm trên ảnh hoặc kéo ghim cam để đặt vị trí mới. Vòng xanh rỗng là vị trí đã lưu. Rê chuột lên trụ cạnh bên để xem hàng và cột.'
        : image.isFetching || (url && failedUrl !== url)
          ? 'Đang tải ảnh trực giao…'
          : 'Chưa tải được ảnh trực giao. Bạn có thể xem các điểm trụ trên bản đồ.'}</p>
      {ready || changed ? <Button disabled={disabled || !changed} onClick={() => { setOutsideImage(false); onReset() }}>Về vị trí đã lưu</Button> : null}
      {canReadImage && !ready && !image.isFetching && (!url || failedUrl === url) ? <Button onClick={() => {
        setLoadedUrl(null)
        setFailedUrl(null)
        void image.refetch()
      }}>Tải lại ảnh</Button> : null}
    </div>
    {outsideImage ? <Alert className="workflow-notice" type="warning" showIcon title="Chọn vị trí nằm trong ảnh trực giao." /> : null}
    <div className={`base-map-canvas draft-position-canvas${editing ? ' is-selecting-position' : ''}`}>
      <MapContainer {...(point ? { center: point, zoom: 21 } : { bounds: imageBounds! })} maxZoom={22} scrollWheelZoom={false} style={{ width: '100%', height: '100%' }}>
        <MapBaseLayers />
        {url && imageBounds && failedUrl !== url ? <ImageOverlay key={url} url={url} bounds={imageBounds} eventHandlers={{
          load: () => setLoadedUrl(url), error: () => setFailedUrl(url),
        }} /> : null}
        {rings?.length ? <Polygon positions={rings} pathOptions={{ color: '#067454', fillOpacity: 0, weight: 2, dashArray: '5 5' }} interactive={false} /> : null}
        {draft.candidates.filter(item => item.candidateId !== candidate.candidateId && stateToken(item.reviewDecision) !== 'REJECT').map(item => {
          const center = reviewMapPosition(item.correctedLatitude ?? item.latitude, item.correctedLongitude ?? item.longitude)
          if (!center) return null
          return <CircleMarker key={item.candidateId} center={center} radius={5} bubblingMouseEvents={false}
            pathOptions={{ color: '#fff', fillColor: '#08775b', fillOpacity: 1, weight: 1 }}>
            <Tooltip direction="top">{readableCode(item.treeId) ?? 'Trụ nhận diện'} · Hàng {item.correctedRowIndex ?? item.proposedRowIndex ?? '—'}, cột {item.correctedColumnIndex ?? item.proposedColumnIndex ?? '—'}</Tooltip>
          </CircleMarker>
        })}
        {saved ? <CircleMarker center={saved} radius={18} pathOptions={{ color: '#067454', fill: false, weight: 3 }} interactive={false} /> : null}
        {point ? <Marker position={point} icon={positionIcon} draggable={editing} title="Vị trí đang chọn"
          eventHandlers={{ dragend: event => {
            const marker = event.target as LeafletMarker
            if (!pick(marker.getLatLng())) marker.setLatLng(point)
          } }} /> : null}
        {editing ? <PickPosition pick={pick} /> : null}
      </MapContainer>
    </div>
  </section>
}
