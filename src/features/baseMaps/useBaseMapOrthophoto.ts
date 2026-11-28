import { useQuery } from '@tanstack/react-query'
import { getOrthophotoStatus } from '../missions/missionApi'
import type { MapVersionDetail } from './types'

export function useBaseMapOrthophoto(token: string, scopeKey: string, map: MapVersionDetail | undefined, enabled = true) {
  const image = useQuery({
    queryKey: ['base-map-orthophoto', scopeKey, map?.farmId, map?.sourceMissionId],
    queryFn: ({ signal }) => getOrthophotoStatus(token, map!.farmId, map!.sourceMissionId!, signal),
    enabled: enabled && !!map?.sourceMissionId, retry: false,
  })
  const shownMap = map && image.data?.status === 'COMPLETED' && image.data.previewUrl
    ? { ...map, previewUrl: image.data.previewUrl, bounds: image.data.bounds ?? map.bounds } : map
  return { shownMap, image }
}
