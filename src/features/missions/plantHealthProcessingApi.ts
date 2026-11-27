import { apiRequest } from '../../api/client'
import type { GeoJsonPolygon } from '../farms/types'

export type DiseaseDetectOptions = { confidenceThreshold: number; matchingToleranceMeters: number; zoneRadiusMeters: number; minDiseasedTrees: number; polygonGeoJson?: GeoJsonPolygon }
export type DiseaseDetectResult = {
  missionId: string; modelName: string; totalImagesScanned: number; totalDetections: number; diseaseSummary: Record<string, number>; csvDownloadUrl: string | null
  detections: { id: string; classId: number; className: string; lat: number; lon: number; confidence: number; bboxX: number; bboxY: number; bboxW: number; bboxH: number; imageName: string; cropImageUrl: string | null; annotatedImageUrl: string | null }[]
  annotatedImageUrls: string[] | null
  jobId?: string | null
  sourceRevision?: number | null
}
export type HealthHandoffResult = { missionId: string; messageId: string; status: string }
export async function detectMissionDiseases(token: string, farmId: string, missionId: string, body: Partial<DiseaseDetectOptions>) {
  const data = await apiRequest<DiseaseDetectResult>(`/api/missions/${encodeURIComponent(missionId)}/farms/${encodeURIComponent(farmId)}/disease-detect`, { method: 'POST', token, body })
  if (data.missionId.toLowerCase() !== missionId.toLowerCase()) throw new Error('Kết quả nhận diện không khớp nhiệm vụ bay.')
  return data
}
export async function publishMissionPlantHealth(token: string, farmId: string, missionId: string, key: string) {
  const data = await apiRequest<HealthHandoffResult>(`/api/system-manager/farms/${encodeURIComponent(farmId)}/missions/${encodeURIComponent(missionId)}/plant-health/publish`, { method: 'POST', token, headers: { 'Idempotency-Key': key } })
  if (data.missionId.toLowerCase() !== missionId.toLowerCase() || data.messageId.toLowerCase() !== key.toLowerCase()) throw new Error('Phản hồi gửi kết quả không khớp nhiệm vụ hoặc mã thao tác.')
  return data
}

export async function publishMissionComboAnalysis(token: string, farmId: string, missionId: string, key: string, body: { jobId: string; sourceRevision: number }) {
  const data = await apiRequest<HealthHandoffResult>(
    `/api/v3/farms/${encodeURIComponent(farmId)}/missions/${encodeURIComponent(missionId)}/combo-analysis/handoffs`,
    { method: 'POST', token, body, headers: { 'Idempotency-Key': key } },
  )
  if (data.missionId.toLowerCase() !== missionId.toLowerCase() || data.messageId.toLowerCase() !== key.toLowerCase() || data.status !== 'QUEUED') {
    throw new Error('Phản hồi chưa xác nhận đã nhận kết quả COMBO cho nhiệm vụ này.')
  }
  return data
}
