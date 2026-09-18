export type GeneralStatus = 'Active' | 'Inactive' | 0 | 1

export type GeoJsonPoint = {
  type: 'Point'
  coordinates: [number, number]
}

export type GeoJsonPolygon = {
  type: 'Polygon'
  coordinates: number[][][]
}

export type Farm = {
  id: string
  tenantId: string
  code: string
  name: string
  address: string | null
  boundary: GeoJsonPolygon | null
  centerPoint: GeoJsonPoint | null
  areaHectares: number | null
  status: GeneralStatus
  createdAt: string
  createdBy: string
}

export type PagedResult<T> = {
  items: T[]
  pageNumber: number
  pageSize: number
  totalCount: number
  totalPages: number
  hasPreviousPage: boolean
  hasNextPage: boolean
}

export type FarmDetail = Farm & { version: number; updatedAt: string | null }
export type ArchivedFarm = Farm & { version: number; updatedAt: string; archivedAt: string }
export type ArchiveRequest = { expectedVersion: number; reason: string }
export type UpdateZoneRequest = { name: string; areaHectares: number | null; boundary: GeoJsonPolygon | null; expectedVersion: number }
export type UpdateZoneResponse = Omit<Zone, 'createdAt' | 'createdBy'> & { updatedAt: string }

export type CreateFarmRequest = {
  code: string
  name: string
  address: string | null
  boundary: GeoJsonPolygon | null
  centerPoint: GeoJsonPoint | null
  areaHectares: number | null
}

export type CreateFarmResponse = Omit<Farm, 'id'> & { farmId: string }

export type Zone = {
  zoneId: string
  farmId: string
  code: string
  name: string
  boundary: GeoJsonPolygon | null
  areaHectares: number | null
  status: GeneralStatus
  version: number
  createdAt: string
  createdBy?: string
  updatedAt?: string
}

export type CreateZoneRequest = {
  code: string
  name: string
  boundary: GeoJsonPolygon | null
  areaHectares: number | null
}

export type TenantUser = {
  id: string
  email: string
  fullName: string
  status: 0 | 1 | 2 | 'Active' | 'Inactive' | 'Locked'
  role: 0 | 1 | 2 | 'Owner' | 'TenantAdmin' | 'Member'
}

export type FarmAssignment = {
  farmMembershipId: string
  tenantId: string
  farmId: string
  userId: string
  role: 'MANAGER' | 'WORKER'
  accessScope: 'ALL_ZONES' | 'SELECTED_ZONES'
  zoneIds: string[]
  status: 'ACTIVE' | 'INACTIVE'
  version: number
  joinedAt: string
}

export type AssignFarmMemberRequest = {
  role: 'MANAGER' | 'WORKER'
  accessScope: 'ALL_ZONES' | 'SELECTED_ZONES'
  zoneIds: string[]
  expectedVersion: number | null
  reason: string | null
}
