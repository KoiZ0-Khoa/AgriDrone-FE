import 'leaflet/dist/leaflet.css'
import { Fragment } from 'react'
import { CircleMarker, MapContainer, Polyline, Popup } from 'react-leaflet'
import { MapBaseLayers } from '../../components/MapBaseLayers'
import { readableCode } from '../../components/RecordReference'
import type { GeoCoordinate, MapComparison } from './types'
import { changeLabel, mapState } from './workflow'

const validPoint = (p: GeoCoordinate | null): p is GeoCoordinate => !!p && Number.isFinite(p.lat) && Number.isFinite(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180
export function MapChangesViewer({ comparison }: { comparison: MapComparison }) {
  const changes = comparison.changes
  const points = changes.flatMap(item => [item.oldPosition, item.newPosition]).filter(validPoint)
  if (!points.length) return null
  const bounds: [[number, number], [number, number]] = [[Math.min(...points.map(p => p.lat)) - 0.00002, Math.min(...points.map(p => p.lon)) - 0.00002], [Math.max(...points.map(p => p.lat)) + 0.00002, Math.max(...points.map(p => p.lon)) + 0.00002]]
  return <>
    <p className="form-hint">Điểm rỗng: vị trí trước · Điểm đặc: vị trí sau · Đường nối: trụ đã dời. Bấm điểm để xem chi tiết.</p>
    <div className="base-map-canvas"><MapContainer bounds={bounds} maxZoom={22} style={{ height: '100%', width: '100%' }}>
      <MapBaseLayers />
      {changes.map((item, index) => {
        const old = validPoint(item.oldPosition) ? item.oldPosition : null, next = validPoint(item.newPosition) ? item.newPosition : null
        const color = ({ CREATED: '#0c8c5e', NEWPLANT: '#0c8c5e', REMOVED: '#b42318', REMOVEDPLANT: '#b42318', RELOCATED: '#b76a08', REPLACED: '#6750a4' }[mapState(item.changeType)] ?? '#315b7b')
        const label = readableCode(item.plantCode) ?? `Hàng ${item.row} · Cột ${item.col}`
        const info = <><strong>{label}</strong><p>{changeLabel(item.changeType)}</p>{item.notes ? <p>{item.notes}</p> : null}</>
        return <Fragment key={index}>
          {old && next ? <Polyline positions={[[old.lat, old.lon], [next.lat, next.lon]]} pathOptions={{ color, weight: 2, dashArray: '5 4' }} /> : null}
          {old ? <CircleMarker center={[old.lat, old.lon]} radius={7} pathOptions={{ color, fillOpacity: 0.05, weight: 2 }}><Popup>{info}<p>Vị trí trước</p></Popup></CircleMarker> : null}
          {next ? <CircleMarker center={[next.lat, next.lon]} radius={5} pathOptions={{ color, fillOpacity: 0.9 }}><Popup>{info}<p>Vị trí sau</p></Popup></CircleMarker> : null}
        </Fragment>
      })}
    </MapContainer></div>
  </>
}
