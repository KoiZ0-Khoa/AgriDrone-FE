import { ApiError, apiRequest } from '../../api/client'
import type { GeoJsonPolygon } from '../farms/types'

export type DiseaseDetectOptions = { confidenceThreshold: number; matchingToleranceMeters: number; zoneRadiusMeters: number; minDiseasedTrees: number; polygonGeoJson?: GeoJsonPolygon }
export type DiseaseDetectResult = {
  missionId: string; modelName: string; totalImagesScanned: number; totalDetections: number; diseaseSummary: Record<string, number>; csvDownloadUrl: string | null
  detections: { id: string; classId: number; className: string; lat: number; lon: number; confidence: number; bboxX: number; bboxY: number; bboxW: number; bboxH: number; imageName: string; cropImageUrl: string | null; annotatedImageUrl: string | null }[]
  annotatedImageUrls: string[] | null
  jobId?: string | null
  sourceRevision?: number | null
}
export type MissionDiseaseJob = {
  jobId: string; missionId: string; status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED'
  createdAt: string; startedAt: string | null; completedAt: string | null
  result: DiseaseDetectResult | null; error: string | null
}
export type HealthHandoffResult = { missionId: string; messageId: string; status: string; handoffId?: string }

const diseasePath = (farmId: string, missionId: string) =>
  `/api/missions/${encodeURIComponent(missionId)}/farms/${encodeURIComponent(farmId)}/disease-detect`

export const isDiseaseJobActive = (job: MissionDiseaseJob | null | undefined) => job?.status === 'QUEUED' || job?.status === 'RUNNING'

function verifyDiseaseJob(job: MissionDiseaseJob, missionId: string, jobId?: string) {
  if (job?.missionId?.toLowerCase() !== missionId.toLowerCase() || (jobId && job?.jobId?.toLowerCase() !== jobId.toLowerCase())) {
    throw new Error('Phản hồi nhận diện không khớp nhiệm vụ hoặc lượt chạy.')
  }
  if (!job.jobId || !['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED'].includes(job.status)) {
    throw new Error('Máy chủ chưa trả trạng thái hợp lệ cho lượt nhận diện bệnh.')
  }
  if (job.status === 'COMPLETED') {
    const result = job.result
    if (result?.missionId?.toLowerCase() !== missionId.toLowerCase() || !Array.isArray(result.detections) ||
        !result.diseaseSummary || typeof result.diseaseSummary !== 'object' || Array.isArray(result.diseaseSummary)) {
      throw new Error('Máy chủ chưa trả kết quả hợp lệ cho lượt nhận diện bệnh đã hoàn tất.')
    }
  }
  return job
}

export async function detectMissionDiseases(token: string, farmId: string, missionId: string, body: Partial<DiseaseDetectOptions>) {
  const job = await apiRequest<MissionDiseaseJob>(diseasePath(farmId, missionId), { method: 'POST', token, body })
  return verifyDiseaseJob(job, missionId)
}

export async function getMissionDiseaseJob(token: string, farmId: string, missionId: string, jobId: string | undefined, signal?: AbortSignal) {
  const segment = jobId ? encodeURIComponent(jobId) : 'latest'
  try {
    const job = await apiRequest<MissionDiseaseJob>(`${diseasePath(farmId, missionId)}/jobs/${segment}`, { token, signal, cache: 'no-store' })
    return verifyDiseaseJob(job, missionId, jobId)
  } catch (error) {
    if (!jobId && error instanceof ApiError && error.status === 404 && error.code === 'Disease.JobNotFound') return null
    throw error
  }
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
