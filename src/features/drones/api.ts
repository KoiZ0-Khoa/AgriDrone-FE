import { apiRequest } from '../../api/client'
import type { Drone, DroneInput, DroneMaintenanceRecord, DroneStatus } from './types'

const id = encodeURIComponent
const base = '/api/system/drones'
const specifications = (capabilities: DroneInput['capabilities']) => ({ capabilities })

export const getDrones = (token: string, signal?: AbortSignal) => apiRequest<Drone[]>(base, { token, signal })
export const getMaintenanceHistory = (token: string, droneId: string, signal?: AbortSignal) =>
  apiRequest<DroneMaintenanceRecord[]>(`${base}/${id(droneId)}/maintenance-history`, { token, signal })
export const registerDrone = (token: string, input: DroneInput) => apiRequest<Drone>(base, {
  method: 'POST', token, body: {
    code: input.code, name: input.name, model: input.model, manufacturer: input.manufacturer,
    specifications: specifications(input.capabilities), serialNumber: input.serialNumber, registrationNumber: input.registrationNumber,
    registrationDate: input.registrationDate, registrationExpiryDate: input.registrationExpiryDate, weightKg: input.weightKg, notes: input.notes,
  },
})
export const updateDrone = (token: string, droneId: string, input: DroneInput & { expectedVersion: number }) => apiRequest<Drone>(`${base}/${id(droneId)}`, {
  method: 'PUT', token, body: {
    expectedVersion: input.expectedVersion, name: input.name, model: input.model, manufacturer: input.manufacturer,
    specifications: specifications(input.capabilities), serialNumber: input.serialNumber, registrationNumber: input.registrationNumber,
    registrationDate: input.registrationDate, registrationExpiryDate: input.registrationExpiryDate, weightKg: input.weightKg, notes: input.notes,
  },
})
export const changeDroneStatus = (token: string, droneId: string, body: { status: DroneStatus; nextMaintenanceAt: string | null; expectedVersion: number; reason: string | null }) =>
  apiRequest(`${base}/${id(droneId)}/status`, { method: 'PATCH', token, body })
