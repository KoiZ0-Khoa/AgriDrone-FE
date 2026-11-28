import type { GeoJsonPolygon } from '../farms/types'

export type ZoneVertex = [longitude: number, latitude: number]

export function polygonVertices(polygon: GeoJsonPolygon): ZoneVertex[][] {
  return polygon.coordinates.map(ring => {
    const vertices = ring.map(([lon, lat]): ZoneVertex => [lon, lat])
    const first = vertices[0], last = vertices.at(-1)
    return first && last && first[0] === last[0] && first[1] === last[1] ? vertices.slice(0, -1) : vertices
  })
}

export function zonePolygon(rings: ZoneVertex[][]): GeoJsonPolygon | null {
  if (!rings.length || rings.some(ring =>
    new Set(ring.map(point => point.join(','))).size < 3
    || ring.some(([lon, lat]) => !Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lon) > 180 || Math.abs(lat) > 90))) return null
  return { type: 'Polygon', coordinates: rings.map(ring => [...ring, ring[0]]) }
}

function ringLocation(ring: number[][], lon: number, lat: number): 'edge' | 'inside' | 'outside' {
  let inside = false
  for (let i = 1; i < ring.length; i++) {
    const [x1, y1] = ring[i - 1], [x2, y2] = ring[i]
    const cross = (lon - x1) * (y2 - y1) - (lat - y1) * (x2 - x1)
    if (Math.abs(cross) <= 1e-13 && lon >= Math.min(x1, x2) && lon <= Math.max(x1, x2) && lat >= Math.min(y1, y2) && lat <= Math.max(y1, y2)) return 'edge'
    if ((y1 > lat) !== (y2 > lat) && lon < x1 + (lat - y1) * (x2 - x1) / (y2 - y1)) inside = !inside
  }
  return inside ? 'inside' : 'outside'
}

export function zoneCoversPoint(polygon: GeoJsonPolygon, lon: number, lat: number) {
  const [outside, ...holes] = polygon.coordinates
  return !!outside && Number.isFinite(lon) && Number.isFinite(lat) && ringLocation(outside, lon, lat) !== 'outside'
    && holes.every(ring => ringLocation(ring, lon, lat) !== 'inside')
}
