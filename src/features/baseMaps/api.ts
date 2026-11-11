import { apiRequest } from '../../api/client'
import type { MapAnalytics, MapComparison, MapVersion, MapVersionDetail, PlantLifecycle } from './types'

const root = (farmId: string) => `/api/farms/${encodeURIComponent(farmId)}/base-maps`
export async function getMapVersions(token: string, farmId: string, includeDraft = false, signal?: AbortSignal) {
  const data = await apiRequest<MapVersion[]>(`${root(farmId)}?${new URLSearchParams({ includeDraft: String(includeDraft) })}`, { token, signal })
  if (data.some(item => item.farmId.toLowerCase() !== farmId.toLowerCase())) throw new Error('Danh sách bản đồ không khớp nông trại.')
  return data
}
export async function getMapVersion(token: string, farmId: string, versionId: string, signal?: AbortSignal) {
  const data = await apiRequest<MapVersionDetail>(`${root(farmId)}/${encodeURIComponent(versionId)}`, { token, signal })
  if (data.farmId.toLowerCase() !== farmId.toLowerCase() || data.versionId.toLowerCase() !== versionId.toLowerCase()) throw new Error('Bản đồ không khớp phiên bản hoặc nông trại đã chọn.')
  return data
}
export async function getPlantLifecycle(token: string, farmId: string, plantId: string, signal?: AbortSignal) {
  const data = await apiRequest<PlantLifecycle>(`/api/farms/${encodeURIComponent(farmId)}/plants/${encodeURIComponent(plantId)}/lifecycle`, { token, signal })
  if (data.farmId.toLowerCase() !== farmId.toLowerCase() || data.plantId.toLowerCase() !== plantId.toLowerCase()) throw new Error('Lịch sử không khớp trụ hoặc nông trại đã chọn.')
  return data
}
export async function compareMapVersions(token: string, farmId: string, fromVersionId: string, toVersionId: string, signal?: AbortSignal) {
  if (fromVersionId.toLowerCase() === toVersionId.toLowerCase()) throw new Error('Chọn hai phiên bản khác nhau để so sánh.')
  const data = await apiRequest<MapComparison>(`${root(farmId)}/compare?${new URLSearchParams({ fromVersionId, toVersionId })}`, { token, signal })
  if (data.farmId.toLowerCase() !== farmId.toLowerCase() || data.fromVersionId.toLowerCase() !== fromVersionId.toLowerCase() || data.toVersionId.toLowerCase() !== toVersionId.toLowerCase()) throw new Error('Kết quả so sánh không khớp hai phiên bản đã chọn.')
  return data
}
export async function getMapAnalytics(token: string, farmId: string, signal?: AbortSignal) {
  const data = await apiRequest<MapAnalytics>(`${root(farmId)}/analytics`, { token, signal })
  if (data.farmId.toLowerCase() !== farmId.toLowerCase()) throw new Error('Thống kê không khớp nông trại.')
  return data
}
