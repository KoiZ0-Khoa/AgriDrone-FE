import type { OrthophotoBounds } from '../missions/missionTypes'

export type PlantHealthStatus = 'NORMAL' | 'HEALTHY_FRUIT' | 'DISEASE'
export type DiseaseZoneStatus = 'PROPOSED' | 'REVIEWED' | 'REJECTED'

export type PlantHealthObservation = {
  id: string; missionId: string; className: string; classNameVi: string
  confidence: number; gpsDistanceM: number; imageName: string
  cropImageUrl: string | null; annotatedImageUrl: string | null; detectionId: string
}
export type FarmHealthPlant = {
  id: string; plantCode: string; row: number; col: number; lat: number; lon: number
  lifecycleStatus: string; healthStatus: PlantHealthStatus; observations: PlantHealthObservation[]
}
export type DiseaseZoneTree = { plantId: string; plantCode: string; row: number; col: number; lat: number; lon: number }
export type DiseaseZone = {
  id: string; zoneKey: string; status: DiseaseZoneStatus; alertType: string
  diseaseName: string; diseaseNameVi: string; totalTrees: number
  centerLat: number; centerLon: number; radiusMeters: number
  geometryGeoJson: string; diseaseBreakdown: Record<string, number>; trees: DiseaseZoneTree[]
}
export type FarmHealthBaseMap = {
  sourceMissionId: string; status: string; previewUrl: string; bounds: OrthophotoBounds
  gridBearingDeg: number; plantSpacingM: number; rowSpacingM: number
}
export type FarmHealthSummary = {
  totalPlants: number; normalPlants: number; healthyFruitPlants: number; diseasePlants: number
  diseaseBreakdown: Record<string, number>
}
export type FarmPlantHealthMapResult = {
  farmId: string; tenantId: string; boundaryGeoJson: string | null
  baseMap: FarmHealthBaseMap | null
  summary: FarmHealthSummary
  plants: FarmHealthPlant[]
  zones: DiseaseZone[]
}
