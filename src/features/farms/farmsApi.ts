import { apiRequest } from '../../api/client'
import type {
  CreateFarmRequest,
  CreateFarmResponse,
  CreateZoneRequest,
  Farm,
  FarmDetail,
  ArchivedFarm,
  ArchiveRequest,
  UpdateZoneRequest,
  UpdateZoneResponse,
  PagedResult,
  Zone,
} from './types'

export function getFarms(token: string, pageNumber = 1, pageSize = 20) {
  const params = new URLSearchParams({
    pageNumber: String(pageNumber),
    pageSize: String(pageSize),
  })

  return apiRequest<PagedResult<Farm>>(`/api/farms?${params}`, { token })
}

export function getFarm(token: string, farmId: string) {
  return apiRequest<FarmDetail>(`/api/farms/${encodeURIComponent(farmId)}`, { token })
}

export function getArchivedFarms(token: string, pageNumber = 1, signal?: AbortSignal) {
  const params = new URLSearchParams({ pageNumber: String(pageNumber), pageSize: '20' })
  return apiRequest<PagedResult<ArchivedFarm>>(`/api/farms/archived?${params}`, { token, signal })
}

export function getArchivedFarm(token: string, farmId: string, signal?: AbortSignal) {
  return apiRequest<ArchivedFarm>(`/api/farms/${encodeURIComponent(farmId)}/archived`, { token, signal })
}

export function restoreFarm(token: string, farmId: string, body: { expectedVersion: number }) {
  return apiRequest<void>(`/api/farms/${encodeURIComponent(farmId)}/restore`, { method: 'PUT', token, body })
}

export function createFarm(token: string, request: CreateFarmRequest) {
  return apiRequest<CreateFarmResponse>('/api/farms', {
    method: 'POST',
    token,
    body: request,
  })
}

export function getZones(token: string, farmId: string) {
  return apiRequest<Zone[]>(`/api/farms/${encodeURIComponent(farmId)}/zones`, { token })
}

export function getZone(token: string, farmId: string, zoneId: string) {
  return apiRequest<Zone>(
    `/api/farms/${encodeURIComponent(farmId)}/zones/${encodeURIComponent(zoneId)}`,
    { token },
  )
}

export function createZone(token: string, farmId: string, request: CreateZoneRequest) {
  return apiRequest<Zone>(`/api/farms/${encodeURIComponent(farmId)}/zones`, {
    method: 'POST',
    token,
    body: request,
  })
}

export function updateZone(token: string, farmId: string, zoneId: string, body: UpdateZoneRequest) {
  return apiRequest<UpdateZoneResponse>(`/api/farms/${encodeURIComponent(farmId)}/zones/${encodeURIComponent(zoneId)}`, { method: 'PUT', token, body })
}

export function archiveZone(token: string, farmId: string, zoneId: string, body: ArchiveRequest) {
  return apiRequest<void>(`/api/farms/${encodeURIComponent(farmId)}/zones/${encodeURIComponent(zoneId)}/archive`, { method: 'PUT', token, body })
}

export function archiveFarm(token: string, farmId: string, body: ArchiveRequest) {
  return apiRequest<void>(`/api/farms/${encodeURIComponent(farmId)}/archive`, { method: 'PUT', token, body })
}
