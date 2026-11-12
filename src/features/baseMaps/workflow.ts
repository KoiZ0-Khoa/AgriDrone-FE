import { ApiError } from '../../api/client'
import type { GeoJsonPolygon } from '../farms/types'
import type { GeoCoordinate, MapPlant, MapVersionDetail } from './types'
import type { CandidateReviewBody, MappingCandidate } from '../surveys/baseMapTypes'

export const mapState = (value: string) => value.replace(/_/g, '').toUpperCase()
export const isReleasedMap = (status: string) => ['PUBLISHED', 'SUPERSEDED'].includes(mapState(status))
export const mapStatusLabel = (status: string) => ({ DRAFT: 'Bản nháp', PUBLISHED: 'Đã phát hành', SUPERSEDED: 'Phiên bản cũ' }[mapState(status)] ?? status)
export const changeLabel = (value: string) => ({ CREATED: 'Thêm trụ', NEWPLANT: 'Thêm trụ', REMOVED: 'Loại bỏ trụ', REMOVEDPLANT: 'Loại bỏ trụ', RELOCATED: 'Dời trụ', MAPPINGDIFFERENCE: 'Điều chỉnh vị trí', REPLACED: 'Thay trụ', INITIALMAPPING: 'Lập bản đồ ban đầu' }[mapState(value)] ?? value)
export const lifecycleLabel = (value: string) => ({ ACTIVE: 'Đang sử dụng', REMOVED: 'Đã loại bỏ', REPLACED: 'Đã thay thế', MISSING: 'Chưa tìm thấy' }[mapState(value)] ?? value)
export const isPaymentLocked = (error: unknown) => error instanceof ApiError && error.status === 409 && !!error.code?.endsWith('.PaymentRequired')
export function previewUrl(value: string | null): string | null {
  if (!value) return null
  try { const url = new URL(value, window.location.origin); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null } catch { return null }
}
export function mapBoundary(value: string | null): GeoJsonPolygon | null {
  try {
    const data = JSON.parse(value ?? 'null')
    if (data?.type !== 'Polygon' || !Array.isArray(data.coordinates) || !data.coordinates.length) return null
    if (!data.coordinates.every((ring: unknown) => Array.isArray(ring) && ring.length >= 4 && ring.every((point: unknown) => Array.isArray(point) && point.length >= 2 && Number.isFinite(point[0]) && Number.isFinite(point[1]) && Math.abs(point[0]) <= 180 && Math.abs(point[1]) <= 90))) return null
    return data
  } catch { return null }
}
export function viewerBounds(map: MapVersionDetail): [[number, number], [number, number]] | null {
  const b = map.bounds
  if (b && [b.minLat, b.maxLat, b.minLon, b.maxLon].every(Number.isFinite) && b.minLat < b.maxLat && b.minLon < b.maxLon && b.minLat >= -90 && b.maxLat <= 90 && b.minLon >= -180 && b.maxLon <= 180) return [[b.minLat, b.minLon], [b.maxLat, b.maxLon]]
  const points = map.plants.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180).map(p => [p.lat, p.lon])
  for (const ring of mapBoundary(map.boundaryGeoJson)?.coordinates ?? []) for (const [lon, lat] of ring) points.push([lat, lon])
  if (!points.length) return null
  return [[Math.min(...points.map(p => p[0])) - 0.00002, Math.min(...points.map(p => p[1])) - 0.00002], [Math.max(...points.map(p => p[0])) + 0.00002, Math.max(...points.map(p => p[1])) + 0.00002]]
}

function insideRing(lon: number, lat: number, ring: number[][]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j]
    const cross = (lon - xi) * (yj - yi) - (lat - yi) * (xj - xi)
    if (Math.abs(cross) < 1e-12 && lon >= Math.min(xi, xj) && lon <= Math.max(xi, xj) && lat >= Math.min(yi, yj) && lat <= Math.max(yi, yj)) return true
    if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
export function manualReviewBody(values: { decision: string; longitude?: number | null; latitude?: number | null; row?: number | null; col?: number | null; reason: string }, candidate: MappingCandidate | undefined, boundaryGeoJson: string | null): CandidateReviewBody {
  if (!['CreateNew', 'Relocate', 'Reject'].includes(values.decision)) throw new Error('Chọn thao tác điều chỉnh hợp lệ.')
  const reason = values.reason.trim()
  if (!reason || reason.length > 2000) throw new Error('Nhập lý do từ 1 đến 2.000 ký tự.')
  if (values.decision !== 'CreateNew' && !candidate) throw new Error('Chọn điểm trụ cần điều chỉnh.')
  if (values.decision === 'Reject') return { decision: 'Reject', correctedLongitude: null, correctedLatitude: null, correctedRowIndex: null, correctedColumnIndex: null, correctedMatchedPlantId: candidate!.correctedMatchedPlantId ?? candidate!.proposedMatchedPlantId, reason }
  const { longitude, latitude, row, col } = values
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || Math.abs(longitude!) > 180 || Math.abs(latitude!) > 90) throw new Error('Nhập kinh độ và vĩ độ WGS84 hợp lệ.')
  if (!Number.isSafeInteger(row) || row! < 1 || !Number.isSafeInteger(col) || col! < 1) throw new Error('Hàng và cột phải là số nguyên dương.')
  const boundary = mapBoundary(boundaryGeoJson)
  if (!boundary) throw new Error('Chưa có ranh giới hợp lệ để kiểm tra vị trí trụ.')
  if (!insideRing(longitude!, latitude!, boundary.coordinates[0]) || boundary.coordinates.slice(1).some(ring => insideRing(longitude!, latitude!, ring))) throw new Error('Vị trí trụ phải nằm trong ranh giới nông trại.')
  return { decision: values.decision as 'CreateNew' | 'Relocate', correctedLongitude: longitude!, correctedLatitude: latitude!, correctedRowIndex: row!, correctedColumnIndex: col!, correctedMatchedPlantId: values.decision === 'CreateNew' ? null : candidate!.correctedMatchedPlantId ?? candidate!.proposedMatchedPlantId, reason }
}

export type VisualMapEdit = { decision: 'CreateNew' | 'Relocate' | 'Reject'; plant?: MapPlant; position?: GeoCoordinate }

export function mapEditPointError(map: MapVersionDetail, point: GeoCoordinate): string | null {
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lon) || Math.abs(point.lat) > 90 || Math.abs(point.lon) > 180) return 'Vị trí trụ không hợp lệ.'
  const image = viewerBounds({ ...map, plants: [], boundaryGeoJson: null })
  if (!image) return 'Chưa có tọa độ ảnh trực giao để chọn vị trí.'
  if (point.lat < image[0][0] || point.lat > image[1][0] || point.lon < image[0][1] || point.lon > image[1][1]) return 'Chọn vị trí nằm trên ảnh trực giao.'
  const boundary = mapBoundary(map.boundaryGeoJson)
  if (!boundary) return 'Chưa có ranh giới hợp lệ để kiểm tra vị trí trụ.'
  if (!insideRing(point.lon, point.lat, boundary.coordinates[0]) || boundary.coordinates.slice(1).some(ring => insideRing(point.lon, point.lat, ring))) return 'Vị trí trụ phải nằm trong ranh giới nông trại.'
  return null
}

export function candidateForMapPlant(plant: MapPlant, candidates: MappingCandidate[]): MappingCandidate | undefined {
  const reference = (c: MappingCandidate) => c.correctedMatchedPlantId ?? c.proposedMatchedPlantId
  const linked = candidates.filter(c => reference(c)?.toLowerCase() === plant.plantId.toLowerCase())
  if (linked.length) return linked.length === 1 ? linked[0] : undefined
  // Initial CreateNew candidates may have no plant reference after publication.
  // Require an unambiguous grid AND location match; never use an arbitrary nearby point.
  const matched = candidates.filter(c => !reference(c)
    && (c.correctedRowIndex ?? c.proposedRowIndex) === plant.row
    && (c.correctedColumnIndex ?? c.proposedColumnIndex) === plant.col
    && Math.hypot(((c.correctedLatitude ?? c.latitude) - plant.lat) * 111320,
      ((c.correctedLongitude ?? c.longitude) - plant.lon) * 111320 * Math.cos(plant.lat * Math.PI / 180)) <= 0.5)
  return matched.length === 1 ? matched[0] : undefined
}
