import { apiRequest as request } from '../api/client'

export type Page<T> = { items: T[]; pageNumber: number; pageSize: number; totalCount: number; hasNextPage: boolean }
export type User = { id: string; email: string; fullName: string; phone: string | null; status: number; role?: number }
export type Tenant = { id: string; code: string; name: string; status: number }
export type Membership = { id: string; tenantId: string; role: number; status: number }
export type Profile = { fullName: string; phone: string | null }
export type FarmRole = 'MANAGER' | 'WORKER'
export type FarmScope = 'ALL_ZONES' | 'SELECTED_ZONES'
export type FarmMember = { farmMembershipId: string; farmId: string; userId: string; email: string; fullName: string; tenantRole: string; role: FarmRole; accessScope: FarmScope; zoneIds: string[]; status: 'ACTIVE' | 'INACTIVE'; version: number; joinedAt: string }
export type MyFarmAssignment = { farmMembershipId: string; farm: { id: string; code: string; name: string; address: string | null; areaHectares: number | null }; role: FarmRole; accessScope: FarmScope; zones: { id: string; code: string; name: string; areaHectares: number | null }[]; status: 'ACTIVE' | 'INACTIVE'; version: number; joinedAt: string }
const id = encodeURIComponent
export const getMembers = (token: string, page: number) => request<Page<User>>(`/tenants/current/users?pageNumber=${page}&pageSize=20`, { token })
export const getTenants = (token: string, page: number) => request<Page<Tenant>>(`/api/system/tenants/all?pageNumber=${page}&pageSize=20`, { token })
export const getUsers = (token: string, page: number) => request<Page<User>>(`/api/users?pageNumber=${page}&pageSize=20`, { token })
export const getMemberships = (token: string, userId: string, page: number) => request<Page<Membership>>(`/api/system/users/${id(userId)}/tenants?pageNumber=${page}&pageSize=20`, { token })
export const updateProfile = (token: string, body: { name: string; phone: string }) => request<Profile>('/current/profile', { method: 'PUT', token, body })
export const changePassword = (token: string, body: { oldPassword: string; newPassword: string }) => request('/current/change-password', { method: 'PUT', token, body })
export const updateFarm = (token: string, farmId: string, body: FarmUpdate) => request(`/api/farms/${id(farmId)}`, { method: 'PUT', token, body })
export const changeMemberRole = (token: string, userId: string, role: 'MEMBER' | 'TENANT_ADMIN') => request<void>(`/api/tenants/current/members/${id(userId)}/role`, { method: 'PUT', token, body: { role } })
export const changeMemberStatus = (token: string, userId: string, status: 'ACTIVE' | 'INACTIVE') => request<void>(`/api/tenants/current/members/${id(userId)}/status`, { method: 'PUT', token, body: { status } })
export const transferOwnership = (token: string, newOwnerUserId: string) => request<void>('/api/tenants/current/transfer-ownership', { method: 'POST', token, body: { newOwnerUserId } })
export const inviteAdmin = (token: string, email: string) => request('/current/invitations/tenant-admin', { method: 'POST', token, body: { email } })
export const inviteMember = (token: string, email: string) => request('/api/tenants/current/invitations/member', { method: 'POST', token, body: { email } })
export function getFarmMembers(token: string, farmId: string, page: number, role = '', status = '', signal?: AbortSignal) {
  const params = new URLSearchParams({ pageNumber: String(page), pageSize: '20' })
  if (role) params.set('role', role)
  if (status) params.set('status', status)
  return request<Page<FarmMember>>(`/api/farms/${id(farmId)}/members?${params}`, { token, signal })
}
export function getMyFarmAssignments(token: string, page: number, role = '', signal?: AbortSignal) {
  const params = new URLSearchParams({ pageNumber: String(page), pageSize: '20' })
  if (role) params.set('role', role)
  return request<Page<MyFarmAssignment>>(`/api/users/me/farm-assignments?${params}`, { token, signal })
}
export const revokeFarmAssignment = (token: string, farmId: string, userId: string, body: { expectedVersion: number; reason: string | null }) => request<void>(`/api/farms/${id(farmId)}/members/${id(userId)}/assignment`, { method: 'DELETE', token, body })
export type InvitationPreview = { maskedEmail: string; tenantName: string; role: number; expiresAt: string; requiresAccountCreation: boolean }
export const previewInvitation = (token: string, signal?: AbortSignal) => request<InvitationPreview>('/api/auth/invitations/preview', { method: 'POST', body: { token }, signal })
export const acceptInvitation = (body: { token: string; password: string | null; fullName: string | null; phone: string | null }) => request('/invitations/accept', { method: 'POST', body })
export const createTenant = (token: string, body: { tenantCode: string; tenantName: string }) => request('/api/system/tenants', { method: 'POST', token, body })
export const setTenantActive = (token: string, tenantId: string, active: boolean) => request<void>(`/api/system/tenants/${id(tenantId)}/${active ? 'activate' : 'deactivate'}`, { method: 'PUT', token })
export const provisionOwner = (token: string, tenantId: string, email: string) => request(`/api/system/tenants/${id(tenantId)}/owner-provisionings`, { method: 'POST', token, body: { email } })
export const setMembershipActive = (token: string, membershipId: string, active: boolean) => request<void>(`/api/system/tenant-memberships/${id(membershipId)}/${active ? 'activate' : 'deactivate'}`, { method: 'PUT', token })
export type FarmUpdate = { name: string; address: string | null; areaHectares: number | null; boundary: { type: 'Polygon'; coordinates: number[][][] } | null; centerPoint: { type: 'Point'; coordinates: [number, number] } | null; expectedVersion: number }
