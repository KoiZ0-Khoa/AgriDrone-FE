import 'leaflet/dist/leaflet.css'
import { Alert, Button } from 'antd'
import { divIcon, type Map as LeafletMap, type Marker as LeafletMarker } from 'leaflet'
import { useRef, useState, type ReactNode } from 'react'
import { CircleMarker, GeoJSON, ImageOverlay, MapContainer, Marker, Popup, useMapEvents } from 'react-leaflet'
import { MapBaseLayers } from '../../components/MapBaseLayers'
import { readableCode } from '../../components/RecordReference'
import type { GeoCoordinate, MapPlant, MapVersionDetail } from './types'
import { lifecycleLabel, mapBoundary, previewUrl, viewerBounds } from './workflow'

export type MapInteraction = {
  mode?: 'CreateNew' | 'Relocate'; point?: GeoCoordinate; disabled: boolean
  pick: (point: GeoCoordinate) => boolean
  editPlant: (plant: MapPlant, decision: 'Relocate' | 'Reject') => void
}
const editIcon = divIcon({ className: 'base-map-edit-marker', html: '<span aria-hidden="true">+</span>', iconSize: [32, 32], iconAnchor: [16, 16] })
function PickMapPoint({ interaction }: { interaction: MapInteraction }) {
  useMapEvents({ click: event => { if (!interaction.disabled) interaction.pick({ lat: event.latlng.lat, lon: event.latlng.lng }) } })
  return null
}

export function BaseMapViewer({ map, selectPlant, interaction, onImageState, renderPlant, plantAnnotation, children }: {
  map: MapVersionDetail; selectPlant?: (plant: MapPlant) => void; interaction?: MapInteraction; onImageState?: (ready: boolean) => void
  renderPlant?: (plant: MapPlant) => ReactNode; plantAnnotation?: (plant: MapPlant) => ReactNode; children?: ReactNode
}) {
  const [failedImage, setFailedImage] = useState<string | null>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  function beginPlantEdit(plant: MapPlant, decision: 'Relocate' | 'Reject') {
    mapRef.current?.stop()
    mapRef.current?.closePopup()
    interaction?.editPlant(plant, decision)
  }
  const bounds = viewerBounds(map), boundary = mapBoundary(map.boundaryGeoJson)
  const imageBounds = viewerBounds({ ...map, plants: [], boundaryGeoJson: null }), image = imageBounds ? previewUrl(map.previewUrl) : null
  const imageFailed = image !== null && failedImage === image
  if (!bounds) return <Alert showIcon type="info" title="Bản đồ chưa có tọa độ để hiển thị" />
  return <>
    {imageFailed ? <Alert showIcon type="warning" title="Chưa tải được ảnh trực giao. Các điểm trụ và ranh giới vẫn hiển thị." /> : null}
    {!image ? <p className="form-hint">Chưa có liên kết ảnh trực giao hợp lệ. Đang hiển thị ranh giới và tọa độ trụ.</p> : null}
    <div className={`base-map-canvas${interaction?.mode && !interaction.disabled ? ' is-selecting-position' : ''}`}><MapContainer ref={mapRef} bounds={bounds} maxZoom={22} style={{ height: '100%', width: '100%' }}>
      <MapBaseLayers />
      {image && imageBounds && !imageFailed ? <ImageOverlay url={image} bounds={imageBounds} eventHandlers={{ load: () => onImageState?.(true), error: () => { setFailedImage(image); onImageState?.(false) } }} /> : null}
      {boundary ? <GeoJSON data={boundary} style={{ color: '#0c8c5e', fillOpacity: 0.03, weight: 2 }} /> : null}
      {map.plants.filter(plant => Number.isFinite(plant.lat) && Number.isFinite(plant.lon) && Math.abs(plant.lat) <= 90 && Math.abs(plant.lon) <= 180).map(plant => {
        if (renderPlant) return renderPlant(plant)
        const annotation = plantAnnotation?.(plant)
        const status = plant.lifecycleStatus.toUpperCase()
        const color = annotation ? '#b42318' : status === 'ACTIVE' ? '#0c8c5e' : '#6b7280'
        return <CircleMarker key={plant.plantId} center={[plant.lat, plant.lon]} radius={annotation ? 7 : 5} bubblingMouseEvents={false} pathOptions={{ color, fillOpacity: 0.85 }}>
          <Popup>
            <strong>{readableCode(plant.plantCode) ?? `Trụ hàng ${plant.row}, cột ${plant.col}`}</strong>
            <p>Hàng {plant.row} · Cột {plant.col}<br />{lifecycleLabel(plant.lifecycleStatus)}</p>
            {annotation}
            <div className="base-map-popup-actions">
              {selectPlant ? <Button onClick={() => selectPlant(plant)}>Lịch sử trụ</Button> : null}
              {interaction && !['REMOVED', 'REPLACED'].includes(status) ? <>
                <Button disabled={interaction.disabled} onClick={() => beginPlantEdit(plant, 'Relocate')}>Dời trên ảnh</Button>
                <Button danger disabled={interaction.disabled} onClick={() => beginPlantEdit(plant, 'Reject')}>Loại bỏ trụ</Button>
              </> : null}
            </div>
          </Popup>
        </CircleMarker>
      })}
      {children}
      {interaction?.mode && image && !imageFailed ? <PickMapPoint interaction={interaction} /> : null}
      {interaction?.mode && interaction.point ? <Marker position={[interaction.point.lat, interaction.point.lon]} icon={editIcon} draggable={!interaction.disabled && !imageFailed} title="Vị trí trụ đang chọn — kéo để điều chỉnh" eventHandlers={{ dragend: event => {
        const marker = event.target as LeafletMarker, point = marker.getLatLng()
        if (!interaction.pick({ lat: point.lat, lon: point.lng }) && interaction.point) marker.setLatLng([interaction.point.lat, interaction.point.lon])
      } }} /> : null}
    </MapContainer></div>
  </>
}
