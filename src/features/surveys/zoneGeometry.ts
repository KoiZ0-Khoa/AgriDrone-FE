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

const METERS_PER_LAT_DEGREE = 111_195
const SHRINK_BUFFERS_M = [1.5, 1, 0.5, 0.2, 0.05]

function convexHull(points: ZoneVertex[]): ZoneVertex[] {
  const sorted = [...new Map(points.map(point => [point.join(','), point])).values()].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  if (sorted.length < 3) return sorted
  const cross = (o: ZoneVertex, a: ZoneVertex, b: ZoneVertex) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const half = (list: ZoneVertex[]) => list.reduce<ZoneVertex[]>((hull, point) => {
    while (hull.length >= 2 && cross(hull[hull.length - 2], hull[hull.length - 1], point) <= 0) hull.pop()
    hull.push(point)
    return hull
  }, [])
  const lower = half(sorted), upper = half([...sorted].reverse())
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

// Đa giác bao lồi quanh các điểm, nới ra mỗi điểm một vòng 12 đỉnh bán kính bufferMeters.
export function hullAroundPoints(points: ZoneVertex[], bufferMeters: number): GeoJsonPolygon | null {
  const valid = points.filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat) && Math.abs(lon) <= 180 && Math.abs(lat) <= 90)
  if (!valid.length || !(bufferMeters > 0)) return null
  const latBuffer = bufferMeters / METERS_PER_LAT_DEGREE
  const lonBuffer = latBuffer / Math.max(1e-6, Math.cos(Math.max(...valid.map(([, lat]) => Math.abs(lat))) * Math.PI / 180))
  // Bán kính đỉnh lớn hơn bán kính chuẩn một chút để cạnh của đa giác 12 cạnh vẫn cách điểm ít nhất bufferMeters.
  const scale = 1 / Math.cos(Math.PI / 12)
  const ring = convexHull(valid.flatMap(([lon, lat]) => Array.from({ length: 12 }, (_, index): ZoneVertex => {
    const angle = index * Math.PI / 6
    return [lon + Math.cos(angle) * lonBuffer * scale, lat + Math.sin(angle) * latBuffer * scale]
  })))
  return zonePolygon([ring])
}

function polygonInside(polygon: GeoJsonPolygon, boundary: GeoJsonPolygon) {
  const [ring] = polygonVertices(polygon)
  return ring.every((point, index) => {
    const next = ring[(index + 1) % ring.length]
    const samples: ZoneVertex[] = [point, ...[0.25, 0.5, 0.75].map((t): ZoneVertex => [point[0] + (next[0] - point[0]) * t, point[1] + (next[1] - point[1]) * t])]
    return samples.every(([lon, lat]) => zoneCoversPoint(boundary, lon, lat))
  })
}

// Thu gọn viền vùng theo các cây còn lại: thử nới 1,5 m như lúc BE tạo vùng (combo-v2), nhỏ dần nếu tràn ra ngoài ranh vườn.
export function shrinkZoneToPoints(points: ZoneVertex[], boundary: GeoJsonPolygon | null): GeoJsonPolygon | null {
  for (const buffer of SHRINK_BUFFERS_M) {
    const polygon = hullAroundPoints(points, buffer)
    if (polygon && (!boundary || polygonInside(polygon, boundary))) return polygon
  }
  return null
}
