import { apiRequest } from '../../api/client'
import type { GeoJsonPolygon } from '../farms/types'
import type {
  FlaggedObservationsResult, MergeDiseaseZonesResult, ResolveFlagBody, ResolveFlagResult, ReviewObservationBody, ReviewObservationResult,
  UpdateZoneBoundaryResult, UpdateZoneMembershipsBody, UpdateZoneMembershipsResult,
} from './plantHealthReviewTypes'

const root = (farmId: string) => `/api/system-manager/farms/${encodeURIComponent(farmId)}/plant-health`
const sameId = (a: string | null | undefined, b: string) => typeof a === 'string' && a.toLowerCase() === b.toLowerCase()

// UC-28 (2.5)
export async function reviewPlantObservation(token: string, farmId: string, observationId: string, body: ReviewObservationBody) {
  const payload: ReviewObservationBody = { decision: body.decision, reason: body.reason.trim() }
  if (body.decision === 'CONFIRMED' && body.correctedConditionCode?.trim()) payload.correctedConditionCode = body.correctedConditionCode.trim()
  const data = await apiRequest<ReviewObservationResult>(`${root(farmId)}/observations/${encodeURIComponent(observationId)}/review`, { method: 'PUT', token, body: payload })
  if (!sameId(data.observationId, observationId)) throw new Error('Phản hồi duyệt không khớp vết nhận diện đã chọn.')
  return data
}

// UC-29 (2.6)
export async function getFlaggedObservations(token: string, farmId: string, signal?: AbortSignal) {
  const data = await apiRequest<FlaggedObservationsResult>(`${root(farmId)}/flagged-observations`, { token, signal })
  if (!sameId(data.farmId, farmId)) throw new Error('Danh sách vết lệch không khớp nông trại.')
  return data
}

// UC-29 (2.7). Chỉ gửi đúng các trường của action đã chọn.
export async function resolveFlaggedObservation(token: string, farmId: string, observationId: string, body: ResolveFlagBody) {
  const reason = body.reason.trim()
  const payload = body.action === 'SNAP' ? { action: body.action, targetPlantId: body.targetPlantId, reason }
    : body.action === 'CREATE_NEW_PLANT' ? {
      action: body.action, reason,
      ...(body.newPlantCode?.trim() ? { newPlantCode: body.newPlantCode.trim() } : {}),
      ...(body.zoneId ? { zoneId: body.zoneId } : {}),
    }
    : { action: body.action, reason }
  const data = await apiRequest<ResolveFlagResult>(`${root(farmId)}/observations/${encodeURIComponent(observationId)}/resolve-flag`, { method: 'POST', token, body: payload })
  if (!sameId(data.observationId, observationId)) throw new Error('Phản hồi xử lý không khớp vết lệch đã chọn.')
  return data
}

// UC-30a (2.9)
export async function mergeDiseaseZones(token: string, farmId: string, zoneIds: string[], mergedGeometry: GeoJsonPolygon) {
  if (new Set(zoneIds.map(id => id.toLowerCase())).size < 2) throw new Error('Chọn ít nhất 2 vùng bệnh khác nhau để gộp.')
  return apiRequest<MergeDiseaseZonesResult>(`${root(farmId)}/disease-zones/merge`, { method: 'POST', token, body: { zoneIds, mergedGeometry: closePolygon(mergedGeometry) } })
}

// UC-30b (2.10)
export async function updateDiseaseZoneBoundary(token: string, farmId: string, zoneId: string, newGeometry: GeoJsonPolygon) {
  const data = await apiRequest<UpdateZoneBoundaryResult>(`${root(farmId)}/disease-zones/${encodeURIComponent(zoneId)}/boundary`, { method: 'PUT', token, body: { newGeometry: closePolygon(newGeometry) } })
  if (!sameId(data.zoneId, zoneId)) throw new Error('Phản hồi chỉnh viền không khớp vùng bệnh đã chọn.')
  return data
}

// UC-30c (2.11). Cả 2 mảng rỗng thì BE không đổi gì — chặn ở FE để không vô tình gửi request vô nghĩa.
export async function updateDiseaseZoneMemberships(token: string, farmId: string, zoneId: string, body: UpdateZoneMembershipsBody) {
  if (body.addPlantIds.length === 0 && body.removePlantIds.length === 0) throw new Error('Chưa chọn cây nào để thêm hoặc bớt.')
  const data = await apiRequest<UpdateZoneMembershipsResult>(`${root(farmId)}/disease-zones/${encodeURIComponent(zoneId)}/memberships`, { method: 'PATCH', token, body: { addPlantIds: body.addPlantIds, removePlantIds: body.removePlantIds } })
  if (!sameId(data.zoneId, zoneId)) throw new Error('Phản hồi cập nhật thành viên không khớp vùng bệnh đã chọn.')
  return data
}

// GeoJSON Polygon: [lon, lat], vòng ngoài phải khép kín (điểm đầu = điểm cuối), tối thiểu 3 đỉnh khác nhau.
export function closePolygon(polygon: GeoJsonPolygon): GeoJsonPolygon {
  const ring = polygon.coordinates[0] ?? []
  const first = ring[0]
  const last = ring[ring.length - 1]
  const closed = first && last && (first[0] !== last[0] || first[1] !== last[1]) ? [...ring, first] : ring
  if (closed.length < 4) throw new Error('Vùng bệnh cần ít nhất 3 điểm.')
  return { type: 'Polygon', coordinates: [closed, ...polygon.coordinates.slice(1)] }
}
