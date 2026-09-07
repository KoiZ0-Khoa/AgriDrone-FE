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
