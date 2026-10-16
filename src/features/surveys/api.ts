import { apiRequest } from '../../api/client'
import type { Approval, AssignedFarm, ExistingFarmIntake, Manager, NewFarmIntake, Page, PriceHistory, PublicIntake, PublicService, RequestDetail, RequestReceipt, ReviewDecision, SurveyRequest, SurveyService } from './types'

const id = encodeURIComponent
const adminServices = '/api/system-admin/survey-services'
const adminRequests = '/api/system-admin/survey-requests'
export function getManagers(token: string, page = 1, filters: { status?: string; availability?: string; qualificationStatus?: string } = {}, signal?: AbortSignal) {
  const params = new URLSearchParams({ pageNumber: String(page), pageSize: '20' })
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value)
  return apiRequest<Page<Manager>>(`/api/system/managers?${params}`, { token, signal })
}
export const getManager = (token: string, profileId: string, signal?: AbortSignal) => apiRequest<Manager>(`/api/system/managers/${id(profileId)}`, { token, signal })
export const inviteManager = (token: string, email: string) => apiRequest('/api/system/managers/invitations', { method: 'POST', token, body: { email } })
export const createManager = (token: string, userId: string) => apiRequest<Manager>('/api/system/managers', { method: 'POST', token, body: { userId } })
export const changeManagerState = (token: string, profileId: string, state: 'activate' | 'suspend', body: { reason: string; expectedVersion: number }) => apiRequest<Manager>(`/api/system/managers/${id(profileId)}/${state}`, { method: 'PUT', token, body })
export const changeManagerAvailability = (token: string, profileId: string, body: { availability: Manager['availability']; reason: string; expectedVersion: number }) => apiRequest<Manager>(`/api/system/managers/${id(profileId)}/availability`, { method: 'PUT', token, body })
export const changeManagerQualification = (token: string, profileId: string, body: { status: Manager['qualificationStatus']; expiresAt: string | null; reason: string; expectedVersion: number }) => apiRequest<Manager>(`/api/system/managers/${id(profileId)}/qualification`, { method: 'PUT', token, body })
export const getServices = (token: string, signal?: AbortSignal) => apiRequest<SurveyService[]>(adminServices, { token, signal })
export const getPublicServices = (signal?: AbortSignal) => apiRequest<PublicService[]>('/api/public/survey-services', { signal })
export const getPriceHistory = (token: string, serviceId: string, signal?: AbortSignal) => apiRequest<PriceHistory[]>(`${adminServices}/${id(serviceId)}/prices`, { token, signal })
export const updateService = (token: string, serviceId: string, body: { name: string; description: string; expectedVersion: number }) => apiRequest(`${adminServices}/${id(serviceId)}`, { method: 'PUT', token, body })
export const changeServiceState = (token: string, serviceId: string, state: 'activate' | 'experimental' | 'retire', body: { reason: string; expectedVersion: number }) => apiRequest(`${adminServices}/${id(serviceId)}/${state}`, { method: 'POST', token, body })
export const createServicePrice = (token: string, serviceId: string, body: { amountPerPole: number; currency: 'VND'; expectedServiceVersion: number }) => apiRequest(`${adminServices}/${id(serviceId)}/prices`, { method: 'POST', token, body })
export function getRequests(token: string, page = 1, filters: { status?: string; kind?: string } = {}, signal?: AbortSignal) {
  const params = new URLSearchParams({ pageNumber: String(page), pageSize: '20' })
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value)
  return apiRequest<Page<SurveyRequest>>(`${adminRequests}?${params}`, { token, signal })
}
export const getRequest = (token: string, requestId: string, signal?: AbortSignal) => apiRequest<RequestDetail>(`${adminRequests}/${id(requestId)}`, { token, signal })
export const startReview = (token: string, requestId: string, expectedVersion: number) => apiRequest(`${adminRequests}/${id(requestId)}/start-review`, { method: 'POST', token, body: { expectedVersion } })
export const rejectRequest = (token: string, requestId: string, body: ReviewDecision) => apiRequest(`${adminRequests}/${id(requestId)}/reject`, { method: 'POST', token, body })
export const approveRequest = (token: string, requestId: string, body: ReviewDecision & { selectedSystemManagerProfileId: string | null }, key: string) => apiRequest<Approval>(`${adminRequests}/${id(requestId)}/approve`, { method: 'POST', token, headers: { 'Idempotency-Key': key }, body })
export const submitPublicRequest = (body: PublicIntake, key: string) => apiRequest<RequestReceipt>('/api/public/survey-requests', { method: 'POST', credentials: 'include', headers: { 'Idempotency-Key': key }, body })
export const submitNewFarmRequest = (token: string, body: NewFarmIntake, key: string) => apiRequest<RequestReceipt>('/api/tenant-owner/survey-requests/new-farm', { method: 'POST', token, headers: { 'Idempotency-Key': key }, body })
export const submitExistingFarmRequest = (token: string, farmId: string, body: ExistingFarmIntake, key: string) => apiRequest<RequestReceipt>(`/api/tenant-owner/farms/${id(farmId)}/survey-requests`, { method: 'POST', token, headers: { 'Idempotency-Key': key }, body })
export const getAssignedFarms = (token: string, signal?: AbortSignal) => apiRequest<AssignedFarm[]>('/api/system-manager/farms', { token, signal })
