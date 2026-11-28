import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'

// Thu gọn viền vùng bệnh theo các cây còn lại.
const source = ts.transpileModule(readFileSync(new URL('../src/features/surveys/zoneGeometry.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023 } }).outputText
const geo = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)

const square = (lon, lat, d) => ({ type: 'Polygon', coordinates: [[[lon - d, lat - d], [lon + d, lat - d], [lon + d, lat + d], [lon - d, lat + d], [lon - d, lat - d]]] })
const meters = m => m / 111_195

test('viền thu gọn phủ mọi cây và nhỏ hơn khung chữ nhật cũ', () => {
  const points = [[106.7, 10.8], [106.7 + meters(10), 10.8 + meters(10)], [106.7 + meters(20), 10.8]]
  const polygon = geo.shrinkZoneToPoints(points, square(106.7, 10.8, meters(500)))
  assert.ok(polygon)
  for (const [lon, lat] of points) assert.ok(geo.zoneCoversPoint(polygon, lon, lat))
  assert.ok(!geo.zoneCoversPoint(polygon, 106.7 + meters(30), 10.8), 'cây cách 10 m ngoài cùng không còn trong vùng')
  assert.ok(!geo.zoneCoversPoint(polygon, 106.7, 10.8 + meters(12)), 'góc trống của khung chữ nhật bị cắt bỏ')
  assert.ok(geo.zoneCoversPoint(polygon, 106.7 - meters(1.4), 10.8), 'giữ khoảng nới 1,5 m quanh cây')
  assert.ok(!geo.zoneCoversPoint(polygon, 106.7 - meters(2.5), 10.8), 'không nới quá xa')
})

test('một cây vẫn tạo được vùng hợp lệ', () => {
  const polygon = geo.shrinkZoneToPoints([[106.7, 10.8]], null)
  assert.ok(polygon)
  assert.ok(geo.zoneCoversPoint(polygon, 106.7, 10.8))
  assert.deepEqual(polygon.coordinates[0][0], polygon.coordinates[0].at(-1))
})

test('giảm khoảng nới khi cây sát ranh vườn', () => {
  const boundary = square(106.7, 10.8, meters(1.5))
  const polygon = geo.shrinkZoneToPoints([[106.7, 10.8]], boundary)
  assert.ok(polygon)
  for (const [lon, lat] of polygon.coordinates[0]) assert.ok(geo.zoneCoversPoint(boundary, lon, lat))
  assert.equal(geo.shrinkZoneToPoints([[106.7 + meters(1.5), 10.8]], boundary), null)
})
