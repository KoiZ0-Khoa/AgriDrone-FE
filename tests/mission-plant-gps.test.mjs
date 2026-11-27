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
const metadata = { modelVersionId: '3fa85f64-5717-4562-b3fc-2c963f66afa6', sourceVersion: 1, gridBearingDeg: 0, rowSpacingM: 3, plantSpacingM: 2.5, algorithmVersion: 'grid-test-1', startedAt: '2026-11-25T13:00:00.000Z' }
const processing = { ...metadata, clientOperationId: '14ceef0a-d47e-4239-a366-a662596ec505' }

test('parsePlantGpsImport validates the pasted trees and processing metadata', () => {
  const parse = (trees, processing = metadata) => workflow.parsePlantGpsImport(JSON.stringify({ trees, processing }))
  assert.deepEqual(parse([sampleTree]), { trees: [sampleTree], processing: metadata })
  assert.throws(() => workflow.parsePlantGpsImport('not json'), /JSON hợp lệ/)
  assert.throws(() => workflow.parsePlantGpsImport(JSON.stringify([sampleTree])), /processing/)
  assert.throws(() => parse([]), /1 đến 10.000/)
  assert.throws(() => parse([{ ...sampleTree, treeId: '' }]), /mã/)
  assert.throws(() => parse([sampleTree, sampleTree]), /trùng/)
  assert.throws(() => parse([{ ...sampleTree, row: 0 }]), /row\/col/)
  assert.throws(() => parse([{ ...sampleTree, latitude: 200 }]), /tọa độ/)
  assert.throws(() => parse([{ ...sampleTree, confidence: 2 }]), /confidence/)
  assert.throws(() => parse([{ ...sampleTree, status: 'UNKNOWN' }]), /DETECTED hoặc MISSING/)
  assert.throws(() => parse([{ ...sampleTree, source: '' }]), /nguồn/)
  assert.throws(() => parse([sampleTree], { ...metadata, modelVersionId: 'best.pt' }), /modelVersionId/)
  assert.throws(() => parse([sampleTree], { ...metadata, startedAt: '2026-11-25T20:00:00+07:00' }), /UTC/)
})

test('GPS processing accepts the UTC offset returned by .NET YOLO jobs and preserves fractional seconds', () => {
  const startedAt = '2026-11-27T05:35:27.1234567'
  assert.equal(workflow.validateMappingProcessing({ ...metadata, startedAt: startedAt + '+00:00' }).startedAt, startedAt + 'Z')
  assert.equal(workflow.validateMappingProcessing({ ...metadata, startedAt: startedAt + 'Z' }).startedAt, startedAt + 'Z')
  assert.throws(() => workflow.validateMappingProcessing({ ...metadata, startedAt }), /UTC/)
})

test('plant GPS GET/POST hit the mission-scoped route and replace sends trees and processing', async () => {
  const calls = []
  globalThis.fetch = async (url, options) => {
    const parsed = new URL(url)
    calls.push({ path: parsed.pathname, method: options.method ?? 'GET', body: options.body ? JSON.parse(options.body) : undefined })
    return options?.method === 'POST'
      ? Response.json({ missionId: 'mission-1', savedCount: 1, processingJobId: 'job-1', boundaryPointCount: 0, boundaryId: null, boundaryVersionNumber: null, boundaryStatus: null })
      : Response.json({ missionId: 'mission-1', savedCount: 1, trees: [sampleTree] })
  }
  const current = await api.getMissionPlantGps('manager', 'farm-1', 'mission-1')
  assert.equal(current.trees[0].treeId, 'TREE-001')
  const saved = await api.replaceMissionPlantGps('manager', 'farm-1', 'mission-1', [sampleTree], processing)
  assert.equal(saved.savedCount, 1)
  assert.equal(saved.processingJobId, 'job-1')
  assert.deepEqual(calls, [
    { path: '/api/system-manager/farms/farm-1/missions/mission-1/plant-gps', method: 'GET', body: undefined },
    { path: '/api/system-manager/farms/farm-1/missions/mission-1/plant-gps', method: 'POST', body: { trees: [sampleTree], processing } },
  ])
})

test('404 (Mission has no plant-gps slot) is recognized as isNotFound, not a hard error', async () => {
  const { ApiError } = await import(clientUrl)
  assert.equal(workflow.isNotFound(new ApiError(404, 'x')), true)
  assert.equal(workflow.isNotFound(new ApiError(403, 'x')), false)
  assert.match(workflow.missionError(new ApiError(404, 'x')), /Không tìm thấy/)
})

test('replaceMissionPlantGps sends boundary alongside trees when provided (sets/updates the farm boundary in the same request), and omits it when not given or empty', async () => {
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push(JSON.parse(options.body))
    return Response.json({ missionId: 'mission-1', savedCount: 1, processingJobId: 'job-1', boundaryPointCount: 4, boundaryId: 'boundary-1', boundaryVersionNumber: 1, boundaryStatus: 'Approved' })
  }
  const boundary = [{ longitude: 106.49, latitude: 10.46 }, { longitude: 106.50, latitude: 10.46 }, { longitude: 106.50, latitude: 10.47 }]
  const saved = await api.replaceMissionPlantGps('manager', 'farm-1', 'mission-1', [sampleTree], processing, boundary)
  assert.equal(saved.boundaryId, 'boundary-1')
  assert.deepEqual(calls[0], { trees: [sampleTree], processing, boundary })
  await api.replaceMissionPlantGps('manager', 'farm-1', 'mission-1', [sampleTree], processing)
  assert.deepEqual(calls[1], { trees: [sampleTree], processing })
  await api.replaceMissionPlantGps('manager', 'farm-1', 'mission-1', [sampleTree], processing, [])
  assert.deepEqual(calls[2], { trees: [sampleTree], processing })
})

test('boundary-related error codes from replacing plant GPS with a boundary translate to actionable Vietnamese messages', async () => {
  const { ApiError } = await import(clientUrl)
  assert.match(workflow.missionError(new ApiError(400, 'x', 'FarmZone.BoundaryOutsideFarm')), /không bao trọn/)
  assert.match(workflow.missionError(new ApiError(409, 'x', 'FarmBoundary.ConcurrentModification')), /vừa được cập nhật bởi thao tác khác/)
  assert.match(workflow.missionError(new ApiError(409, 'x', 'FarmBoundary.UnmappedRequiresCaptureSession')), /capture session/)
})
