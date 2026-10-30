export type DroneCapability = 'BASELINE_MAPPING' | 'PLANT_HEALTH' | 'HARVEST_READINESS'
export type DroneStatus = 'AVAILABLE' | 'IN_MISSION' | 'MAINTENANCE' | 'INACTIVE' | 'RETIRED'
export type Drone = {
  id: string; code: string; name: string; model: string | null; manufacturer: string | null
  specifications: { capabilities: DroneCapability[] }
  serialNumber: string | null; registrationNumber: string | null
  registrationDate: string | null; registrationExpiryDate: string | null
  weightKg: number | null; status: DroneStatus
  lastMaintenanceAt: string | null; nextMaintenanceAt: string | null
  notes: string | null; createdAt: string; updatedAt: string; version: number
}
export type DroneMaintenanceRecord = {
  id: string; droneId: string; startedAt: string; startedBy: string | null; reason: string | null
  closedAt: string | null; closedBy: string | null; closingStatus: DroneStatus | null; nextMaintenanceAt: string | null
}
export type DroneInput = {
  code: string; name: string; model: string | null; manufacturer: string | null
  capabilities: DroneCapability[]; serialNumber: string | null; registrationNumber: string | null
  registrationDate: string | null; registrationExpiryDate: string | null; weightKg: number | null; notes: string | null
}
