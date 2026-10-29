import { apiRequest } from '../../api/client'
import type { AvailableDrone, Drone, DroneMaintenanceEntry, DroneStatus, MissionPurpose } from './types'

const id = encodeURIComponent
const base = '/api/system/drones'

export const getDrones = (token: string, signal?: AbortSignal) => apiRequest<Drone[]>(base, { token, signal })

export const getDroneMaintenanceHistory = (token: string, droneId: string, signal?: AbortSignal) =>
  apiRequest<DroneMaintenanceEntry[]>(`${base}/${id(droneId)}/maintenance-history`, { token, signal })

export const registerDrone = (
  token: string,
  body: {
    code: string; name: string; model: string | null; manufacturer: string | null; specifications: unknown
    serialNumber: string | null; registrationNumber: string | null; registrationDate: string | null
    registrationExpiryDate: string | null; weightKg: number | null; notes: string | null
  },
) => apiRequest<Drone>(base, { method: 'POST', token, body })

export const updateDrone = (
  token: string,
  droneId: string,
  body: {
    expectedVersion: number; name: string; model: string | null; manufacturer: string | null; specifications: unknown
    serialNumber: string | null; registrationNumber: string | null; registrationDate: string | null
    registrationExpiryDate: string | null; weightKg: number | null; notes: string | null
  },
) => apiRequest<Drone>(`${base}/${id(droneId)}`, { method: 'PUT', token, body })

export const changeDroneStatus = (
  token: string,
  droneId: string,
  body: { status: DroneStatus; nextMaintenanceAt: string | null; expectedVersion: number; reason: string | null },
) => apiRequest<Drone>(`${base}/${id(droneId)}/status`, { method: 'PATCH', token, body })

export function getAvailableDrones(
  token: string,
  farmId: string,
  startAt: string,
  endAt: string,
  purpose?: MissionPurpose,
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({ startAt, endAt })
  if (purpose) params.set('purpose', purpose)
  return apiRequest<AvailableDrone[]>(`/api/system-manager/farms/${id(farmId)}/drones/available?${params}`, { token, signal })
}
