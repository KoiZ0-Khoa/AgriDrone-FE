import { readFileSync } from 'node:fs'
import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'

const compile = file => ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023 } }).outputText
const dataUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
const clientUrl = dataUrl(compile('../src/api/client.ts').replace('import.meta.env.VITE_API_BASE_URL', "'http://test.local'"))
const api = await import(dataUrl(compile('../src/features/missions/missionApi.ts').replace("'../../api/client'", JSON.stringify(clientUrl))))
const workflow = await import(dataUrl(compile('../src/features/missions/missionWorkflow.ts').replace("'../../api/client'", JSON.stringify(clientUrl))))
const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })

test('closedBoundaryPolygon auto-closes the ring (first point repeated at the end) and requires at least 3 points', () => {
  const points = [[106.1, 10.1], [106.2, 10.1], [106.2, 10.2]]
  const polygon = workflow.closedBoundaryPolygon(points)
  assert.equal(polygon.type, 'Polygon')
  assert.equal(polygon.coordinates[0].length, 4)
  assert.deepEqual(polygon.coordinates[0][3], points[0])
  assert.throws(() => workflow.closedBoundaryPolygon([[106.1, 10.1], [106.2, 10.1]]))
})

test('estimateAreaHectares returns 0 under 3 points and a positive area for a real quadrilateral', () => {
  assert.equal(workflow.estimateAreaHectares([]), 0)
  assert.equal(workflow.estimateAreaHectares([[106.1, 10.1], [106.2, 10.1]]), 0)
  // Roughly a 100m x 100m square near the equator-ish latitude used in the UC04 sample data.
  const square = [[106.49, 10.46], [106.4909, 10.46], [106.4909, 10.4609], [106.49, 10.4609]]
  const area = workflow.estimateAreaHectares(square)
  assert.ok(area > 0.5 && area < 2, `expected a plausible small-plot area in hectares, got ${area}`)
})

test('sliceMissionTiles posts to the missionId-first process route with default tileSize/overlap/dualScale', async () => {
  let captured
  globalThis.fetch = async (url, options) => { captured = { url: url.toString(), body: JSON.parse(options.body) }; return Response.json({ missionId: 'mission-1', totalTiles: 10, totalTiles640: 6, totalTiles1280: 4, dualScale: true, tiles: [] }) }
  const polygon = { type: 'Polygon', coordinates: [[[106.1, 10.1], [106.2, 10.1], [106.2, 10.2], [106.1, 10.1]]] }
  const result = await api.sliceMissionTiles('manager', 'farm-1', 'mission-1', polygon)
  assert.equal(captured.url, 'http://test.local/api/missions/mission-1/farms/farm-1/tiling-slice')
  assert.deepEqual(captured.body, { tileSize: 640, overlap: 64, dualScale: true, polygonGeoJson: polygon })
  assert.equal(result.totalTiles, 10)
})
