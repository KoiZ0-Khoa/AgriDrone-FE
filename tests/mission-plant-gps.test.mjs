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

const sampleTree = { treeId: 'TREE-001', row: 1, col: 1, latitude: 10.123456, longitude: 105.812345, confidence: 0.98, status: 'DETECTED', source: 'DRONE_DETECTION' }

test('parsePlantGpsTrees accepts a valid tree list and rejects malformed JSON', () => {
  assert.deepEqual(workflow.parsePlantGpsTrees(JSON.stringify([sampleTree])), [sampleTree])
  assert.throws(() => workflow.parsePlantGpsTrees('not json'), /JSON hợp lệ/)
  assert.throws(() => workflow.parsePlantGpsTrees('[]'), /1 đến 10.000/)
  assert.throws(() => workflow.parsePlantGpsTrees(JSON.stringify([{ ...sampleTree, treeId: '' }])), /mã/)
  assert.throws(() => workflow.parsePlantGpsTrees(JSON.stringify([sampleTree, sampleTree])), /trùng/)
  assert.throws(() => workflow.parsePlantGpsTrees(JSON.stringify([{ ...sampleTree, row: 0 }])), /row\/col/)
  assert.throws(() => workflow.parsePlantGpsTrees(JSON.stringify([{ ...sampleTree, latitude: 200 }])), /tọa độ/)
  assert.throws(() => workflow.parsePlantGpsTrees(JSON.stringify([{ ...sampleTree, confidence: 2 }])), /confidence/)
  assert.throws(() => workflow.parsePlantGpsTrees(JSON.stringify([{ ...sampleTree, status: 'UNKNOWN' }])), /DETECTED hoặc MISSING/)
  assert.throws(() => workflow.parsePlantGpsTrees(JSON.stringify([{ ...sampleTree, source: '' }])), /nguồn/)
})

test('plant GPS GET/POST hit the mission-scoped route and replace sends the parsed trees as-is', async () => {
  const calls = []
  globalThis.fetch = async (url, options) => {
    const parsed = new URL(url)
    calls.push({ path: parsed.pathname, method: options.method ?? 'GET', body: options.body ? JSON.parse(options.body) : undefined })
    return options?.method === 'POST'
      ? Response.json({ missionId: 'mission-1', savedCount: 1, boundaryPointCount: 0, boundaryId: null, boundaryVersionNumber: null, boundaryStatus: null })
      : Response.json({ missionId: 'mission-1', savedCount: 1, trees: [sampleTree] })
  }
  const current = await api.getMissionPlantGps('manager', 'farm-1', 'mission-1')
  assert.equal(current.trees[0].treeId, 'TREE-001')
  const saved = await api.replaceMissionPlantGps('manager', 'farm-1', 'mission-1', [sampleTree])
  assert.equal(saved.savedCount, 1)
  assert.deepEqual(calls, [
    { path: '/api/system-manager/farms/farm-1/missions/mission-1/plant-gps', method: 'GET', body: undefined },
    { path: '/api/system-manager/farms/farm-1/missions/mission-1/plant-gps', method: 'POST', body: { trees: [sampleTree] } },
  ])
})

test('404 (Mission has no plant-gps slot) is recognized as isNotFound, not a hard error', async () => {
  const { ApiError } = await import(clientUrl)
  assert.equal(workflow.isNotFound(new ApiError(404, 'x')), true)
  assert.equal(workflow.isNotFound(new ApiError(403, 'x')), false)
  assert.match(workflow.missionError(new ApiError(404, 'x')), /Không tìm thấy/)
})
