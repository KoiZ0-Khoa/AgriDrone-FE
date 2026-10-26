import type { Farm } from '../features/farms/types'

export function farmPageSummary(farms: Pick<Farm, 'areaHectares' | 'boundary'>[]) {
  const knownAreas = farms.flatMap(farm => farm.areaHectares !== null && Number.isFinite(farm.areaHectares) && farm.areaHectares >= 0 ? [farm.areaHectares] : [])
  return {
    area: knownAreas.length ? knownAreas.reduce((sum, area) => sum + area, 0) : null,
    knownAreas: knownAreas.length,
    withBoundary: farms.filter(farm => (farm.boundary?.coordinates?.[0]?.length ?? 0) >= 4).length,
  }
}
