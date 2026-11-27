import { ApiError, apiRequest, apiRequestFile } from '../../api/client'
import type { GeoJsonPolygonV3 } from './v3Types'

export type PublishedSurveySummary = {
  orderId: string; publicationId: string; farmId: string; serviceCode: string; mapVersionId: string
  baselineMapVersionId: string; publishedAt: string; claimDeadlineExclusiveUtc: string
}
export type SurveyPole = {
  plantProfileId: string; plantCode: string; longitude: number; latitude: number; row: number | null; column: number | null
}
export type PublishedSurveyResult = {
  summary: PublishedSurveySummary; verifiedPoleCount: number; boundaryGeoJson: string | null; poles: SurveyPole[]
  healthAssessmentStatus: string; limitationNotice: string | null; imageIds: string[]
  findings: { findingId: string; plantProfileId: string; position: { type: 'Point'; coordinates: number[] }
    observedAt: string; suspectedClassCode: string; confidence: number; uncertainty: string; limitations: string[] }[]
  zones: { sourceProposalId: string; suspectedClassCode: string; geometry: GeoJsonPolygonV3; findingIds: string[]
    guidanceId: string | null; guidanceVersion: number | null }[]
}
export type PublishedSurveyComparison = {
  from: PublishedSurveySummary; to: PublishedSurveySummary; addedPoles: SurveyPole[]; missingPoles: SurveyPole[]
  changedPoles: { from: SurveyPole; to: SurveyPole }[]
  healthChanges: { plantProfileId: string; fromSuspectedClasses: string[]; toSuspectedClasses: string[] }[]
}

const owner = '/api/v3/tenant-owner'
const resultPath = (orderId: string) => `${owner}/survey-orders/${encodeURIComponent(orderId)}/published-result`
const historyPath = (farmId: string) => `${owner}/farms/${encodeURIComponent(farmId)}/survey-results`

export async function getPublishedSurveyResult(token: string, orderId: string, signal?: AbortSignal) {
  try {
    const result = await apiRequest<PublishedSurveyResult>(resultPath(orderId), { token, signal, cache: 'no-store' })
    if (result.summary.orderId.toLowerCase() !== orderId.toLowerCase()) throw new Error('Kết quả khảo sát không khớp đơn đã chọn.')
    return result
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
}
export async function getPublishedSurveyHistory(token: string, farmId: string, signal?: AbortSignal) {
  const results = await apiRequest<PublishedSurveySummary[]>(historyPath(farmId), { token, signal, cache: 'no-store' })
  if (results.some(result => result.farmId.toLowerCase() !== farmId.toLowerCase())) throw new Error('Lịch sử kết quả không khớp nông trại.')
  return results
}
export async function comparePublishedSurveys(token: string, farmId: string, fromOrderId: string, toOrderId: string, signal?: AbortSignal) {
  const params = new URLSearchParams({ fromOrderId, toOrderId })
  const comparison = await apiRequest<PublishedSurveyComparison>(`${historyPath(farmId)}/compare?${params}`, { token, signal, cache: 'no-store' })
  if (comparison.from.orderId.toLowerCase() !== fromOrderId.toLowerCase() || comparison.to.orderId.toLowerCase() !== toOrderId.toLowerCase() ||
      [comparison.from.farmId, comparison.to.farmId].some(id => id.toLowerCase() !== farmId.toLowerCase())) {
    throw new Error('Kết quả so sánh không khớp các đợt khảo sát đã chọn.')
  }
  return comparison
}
export async function getPublishedSurveyImage(token: string, orderId: string, imageId: string, signal?: AbortSignal) {
  const { blob } = await apiRequestFile(`${resultPath(orderId)}/images/${encodeURIComponent(imageId)}`, { token, signal, fallbackFileName: 'survey-image' })
  if (!blob.type.startsWith('image/')) throw new Error('Máy chủ chưa trả ảnh khảo sát hợp lệ.')
  return blob
}
