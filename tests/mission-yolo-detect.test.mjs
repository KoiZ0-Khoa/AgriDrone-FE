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

test('detectMissionTrees posts options as-is (including an optional anchor and polygon) to the missionId-first route', async () => {
  let captured
  globalThis.fetch = async (url, options) => {
    captured = { url: url.toString(), method: options.method, body: JSON.parse(options.body) }
    return Response.json({
      missionId: 'mission-1', modelName: 'best.pt', totalTilesScanned: 45, totalRawDetections: 120, totalUniqueTrees: 70, totalMissingTrees: 5,
      suggestedRowSpacing: 2.81, suggestedColSpacing: 2.68, maxRow: 5, maxCol: 14, csvDownloadUrl: '/csv',
      activeTrees: [{ id: 'tree_r1_c1', row: 1, col: 1, lat: 10.46, lon: 106.49, confidence: 0.94, status: 'DETECTED', source: 'YOLO', isAnchor: true }],
      missingTrees: [],
    })
  }
  const polygon = { type: 'Polygon', coordinates: [[[106.1, 10.1], [106.2, 10.1], [106.2, 10.2], [106.1, 10.1]]] }
  const result = await api.detectMissionTrees('manager', 'farm-1', 'mission-1', { confidenceThreshold: 0.3, rowSpacing: 2.8, colSpacing: 2.5, anchorLat: 10.46, anchorLon: 106.49, polygonGeoJson: polygon })
  assert.equal(captured.url, 'http://test.local/api/missions/mission-1/farms/farm-1/yolo-detect')
  assert.equal(captured.method, 'POST')
  assert.deepEqual(captured.body, { confidenceThreshold: 0.3, rowSpacing: 2.8, colSpacing: 2.5, anchorLat: 10.46, anchorLon: 106.49, polygonGeoJson: polygon })
  assert.equal(result.totalUniqueTrees, 70)
  assert.equal(result.activeTrees[0].isAnchor, true)
})

test('detectMissionTrees sends an empty body when called with no options (BE applies its own defaults)', async () => {
  let captured
  globalThis.fetch = async (url, options) => { captured = JSON.parse(options.body); return Response.json({ missionId: 'mission-1', modelName: 'best.pt', totalTilesScanned: 0, totalRawDetections: 0, totalUniqueTrees: 0, totalMissingTrees: 0, suggestedRowSpacing: null, suggestedColSpacing: null, maxRow: 0, maxCol: 0, csvDownloadUrl: null, activeTrees: [], missingTrees: [] }) }
  await api.detectMissionTrees('manager', 'farm-1', 'mission-1')
  assert.deepEqual(captured, {})
})

test('DetectTrees error codes translate to actionable Vietnamese messages', async () => {
  const { ApiError } = await import(clientUrl)
  assert.match(workflow.missionError(new ApiError(403, 'x', 'DetectTrees.FarmAccessDenied')), /không được phân công/)
})
