import { apiRequest } from '../../api/client'
import type { Approval, AssignedFarm, ExistingFarmIntake, FarmManagerAssignment, Manager, NewFarmIntake, Page, PriceHistory, PublicIntake, RequestDetail, ReviewDecision, SurveyRequest, SurveyService } from './types'
import type { SurveyCatalogueV3, SurveyIntakeCatalogue, SurveyIntakeReceipt } from './types'

const id = encodeURIComponent
const adminServices = '/api/system-admin/survey-services'
const adminRequests = '/api/system-admin/survey-requests'
// Phê duyệt dùng route V3 (cùng body, header Idempotency-Key và response với route cũ). Xem/nhận xét duyệt/từ chối
// chưa có bản V3 riêng và vẫn dùng chung cho yêu cầu V3.
const adminRequestsV3 = '/api/v3/system-admin/survey-requests'
export function getManagers(token: string, page = 1, filters: { status?: string; availability?: string } = {}, signal?: AbortSignal) {
  const params = new URLSearchParams({ pageNumber: String(page), pageSize: '20' })
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value)
  return apiRequest<Page<Manager>>(`/api/system/managers?${params}`, { token, signal })
}
export const getManager = (token: string, profileId: string, signal?: AbortSignal) => apiRequest<Manager>(`/api/system/managers/${id(profileId)}`, { token, signal })
export const inviteManager = (token: string, email: string) => apiRequest('/api/system/managers/invitations', { method: 'POST', token, body: { email } })
export const createManager = (token: string, userId: string) => apiRequest<Manager>('/api/system/managers', { method: 'POST', token, body: { userId } })
export const changeManagerState = (token: string, profileId: string, state: 'activate' | 'suspend', body: { reason: string; expectedVersion: number }) => apiRequest<Manager>(`/api/system/managers/${id(profileId)}/${state}`, { method: 'PUT', token, body })
export const changeManagerAvailability = (token: string, profileId: string, body: { availability: Manager['availability']; reason: string; expectedVersion: number }) => apiRequest<Manager>(`/api/system/managers/${id(profileId)}/availability`, { method: 'PUT', token, body })
export const getServices = (token: string, signal?: AbortSignal) => apiRequest<SurveyService[]>(adminServices, { token, signal })
// Web chỉ nhận yêu cầu khảo sát V3 (MAP / COMBO). Danh mục chưa mở đăng ký (isBookable = false) thì trả danh sách rỗng
// để trang hiện "Chưa có dịch vụ nhận yêu cầu", không còn quay về danh mục cũ.
export async function getSurveyIntakeCatalogue(signal?: AbortSignal): Promise<SurveyIntakeCatalogue> {
  const v3 = await apiRequest<SurveyCatalogueV3>('/api/v3/catalog/survey-services', { signal, cache: 'no-store' })
  if (!v3?.isBookable) return { services: [] }
  return {
    sharedDeposit: v3.sharedDeposit,
    services: v3.services
      .filter(service => service.code === 'MAP' || service.code === 'COMBO')
      .map(service => ({ ...service, name: service.code === 'MAP' ? 'Chỉ bay bản đồ' : 'Combo bản đồ + khảo sát sức khỏe cây' })),
  }
}
export const getPriceHistory = (token: string, serviceId: string, signal?: AbortSignal) => apiRequest<PriceHistory[]>(`${adminServices}/${id(serviceId)}/prices`, { token, signal })
export const updateService = (token: string, serviceId: string, body: { name: string; description: string; expectedVersion: number }) => apiRequest(`${adminServices}/${id(serviceId)}`, { method: 'PUT', token, body })
export const changeServiceState = (token: string, serviceId: string, state: 'activate' | 'experimental' | 'retire', body: { reason: string; expectedVersion: number }) => apiRequest(`${adminServices}/${id(serviceId)}/${state}`, { method: 'POST', token, body })
export function componentServicePriceBody(mapping: string, health: string, expectedServiceVersion: number) {
  const mappingPricePerPole = Number(mapping.trim()), plantHealthPricePerPole = Number(health.trim())
  if (![mapping, health].every(value => /^\d+$/.test(value.trim())) || ![mappingPricePerPole, plantHealthPricePerPole].every(value => Number.isSafeInteger(value) && value > 0) || !Number.isSafeInteger(mappingPricePerPole + plantHealthPricePerPole)) throw new Error('Mỗi đơn giá phải là số nguyên VND lớn hơn 0.')
  if (!Number.isInteger(expectedServiceVersion) || expectedServiceVersion < 1 || expectedServiceVersion > 4294967295) throw new Error('Tải lại dịch vụ để lấy phiên bản hiện tại trước khi đặt giá.')
  return { amountPerPole: mappingPricePerPole + plantHealthPricePerPole, mappingPricePerPole, plantHealthPricePerPole, currency: 'VND' as const, expectedServiceVersion }
}
export const createServicePrice = (token: string, serviceId: string, body: ReturnType<typeof componentServicePriceBody>) => apiRequest(`${adminServices}/${id(serviceId)}/prices`, { method: 'POST', token, body })
export function getRequests(token: string, page = 1, filters: { status?: string; kind?: string } = {}, signal?: AbortSignal) {
  const params = new URLSearchParams({ pageNumber: String(page), pageSize: '20' })
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value)
  return apiRequest<Page<SurveyRequest>>(`${adminRequests}?${params}`, { token, signal })
}
export const getRequest = (token: string, requestId: string, signal?: AbortSignal) => apiRequest<RequestDetail>(`${adminRequests}/${id(requestId)}`, { token, signal })
export const startReview = (token: string, requestId: string, expectedVersion: number) => apiRequest(`${adminRequests}/${id(requestId)}/start-review`, { method: 'POST', token, body: { expectedVersion } })
export const rejectRequest = (token: string, requestId: string, body: ReviewDecision) => apiRequest(`${adminRequests}/${id(requestId)}/reject`, { method: 'POST', token, body })
export const approveRequest = (token: string, requestId: string, body: ReviewDecision & { selectedSystemManagerProfileId: string | null }, key: string) => apiRequest<Approval>(`${adminRequestsV3}/${id(requestId)}/approve`, { method: 'POST', token, headers: { 'Idempotency-Key': key }, body })
export const submitPublicRequestV3 = (body: PublicIntake, key: string) =>
  apiRequest<SurveyIntakeReceipt>('/api/v3/public/survey-requests', { method: 'POST', credentials: 'include', headers: { 'Idempotency-Key': key }, body })
export const submitOwnerRequestV3 = (token: string, body: (ExistingFarmIntake & { farmId: string }) | (NewFarmIntake & { farmId: null }), key: string) =>
  apiRequest<SurveyIntakeReceipt>('/api/v3/tenant-owner/survey-requests', { method: 'POST', token, headers: { 'Idempotency-Key': key }, body })
export const getAssignedFarms = (token: string, signal?: AbortSignal) => apiRequest<AssignedFarm[]>('/api/system-manager/farms', { token, signal })
// A missing assignment version only permits an initial assignment; BE rejects replacements.
export const assignFarmManager = (token: string, farmId: string, body: { systemManagerProfileId: string; reason: string }) => apiRequest<FarmManagerAssignment>(`/api/system/farms/${id(farmId)}/primary-manager`, { method: 'PUT', token, body: { ...body, expectedCurrentAssignmentVersion: null } })
