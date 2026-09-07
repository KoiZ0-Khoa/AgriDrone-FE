import { apiRequest } from '../../api/client'
import type {
  CreateFarmRequest,
  CreateFarmResponse,
  CreateZoneRequest,
  Farm,
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
  return apiRequest<Farm>(`/api/farms/${encodeURIComponent(farmId)}`, { token })
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
