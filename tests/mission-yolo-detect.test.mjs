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

const yoloUrl = 'http://test.local/api/missions/mission-1/farms/farm-1/yolo-detect'
const queued = { jobId: 'yolo-1', missionId: 'mission-1', tilingJobId: 'job-1', status: 'QUEUED', createdAt: '2026-11-27T05:00:00Z', startedAt: null, completedAt: null, result: null, error: null }
const detection = {
  missionId: 'mission-1', modelName: 'best.pt', totalTilesScanned: 45, totalRawDetections: 1, totalUniqueTrees: 1, totalMissingTrees: 0,
  suggestedRowSpacing: 2.81, suggestedColSpacing: 2.68, detectedBearingDeg: 270.4, maxRow: 1, maxCol: 1, csvDownloadUrl: '/csv',
  activeTrees: [{ id: 'tree_r1_c1', row: 1, col: 1, lat: 10.46, lon: 106.49, confidence: 0.94, status: 'DETECTED', source: 'YOLO', isAnchor: true }],
  missingTrees: [],
}

test('detectMissionTrees posts the completed tiling job ID with the detection options to the missionId-first route', async () => {
  let captured
  globalThis.fetch = async (url, options) => {
    captured = { url: url.toString(), method: options.method, body: JSON.parse(options.body) }
    return Response.json(queued, { status: 202 })
  }
  const polygon = { type: 'Polygon', coordinates: [[[106.1, 10.1], [106.2, 10.1], [106.2, 10.2], [106.1, 10.1]]] }
  const result = await api.detectMissionTrees('manager', 'farm-1', 'mission-1', { tilingJobId: 'job-1', confidenceThreshold: 0.3, rowSpacing: 2.8, colSpacing: 2.5, anchorLat: 10.46, anchorLon: 106.49, polygonGeoJson: polygon })
  assert.equal(captured.url, yoloUrl)
  assert.equal(captured.method, 'POST')
  assert.deepEqual(captured.body, { tilingJobId: 'job-1', confidenceThreshold: 0.3, rowSpacing: 2.8, colSpacing: 2.5, anchorLat: 10.46, anchorLon: 106.49, polygonGeoJson: polygon })
  assert.deepEqual(result, queued)
  assert.equal(workflow.isMissionYoloActive(result), true)
  assert.equal(workflow.completedMissionYolo(result, 'mission-1', 'job-1'), null)
})

test('detectMissionTrees can send just the tiling job ID and use BE detection defaults', async () => {
  let captured
  globalThis.fetch = async (url, options) => { captured = JSON.parse(options.body); return Response.json(queued, { status: 202 }) }
  await api.detectMissionTrees('manager', 'farm-1', 'mission-1', { tilingJobId: 'job-1' })
  assert.deepEqual(captured, { tilingJobId: 'job-1' })
})

test('latest YOLO lookup restores the running job and polls that job to completion', async () => {
  const urls = []
  globalThis.fetch = async (url, options) => {
    urls.push(url.toString())
    assert.equal(options.cache, 'no-store')
    return Response.json(url.toString().endsWith('/latest')
      ? { ...queued, status: 'RUNNING' }
      : { ...queued, status: 'COMPLETED', result: detection })
  }
  const latest = await api.getMissionYoloJob('manager', 'farm-1', 'mission-1', undefined)
  assert.equal(workflow.isMissionYoloActive(latest), true)
  assert.equal(workflow.completedMissionYolo(latest, 'mission-1', 'job-1'), null)
  const job = await api.getMissionYoloJob('manager', 'farm-1', 'mission-1', latest.jobId)
  assert.deepEqual(urls, [yoloUrl + '/jobs/latest', yoloUrl + '/jobs/yolo-1'])
  assert.equal(workflow.isMissionYoloActive(job), false)
  assert.deepEqual(workflow.completedMissionYolo(job, 'mission-1', 'job-1'), detection)
})

test('GPS shows server grid suggestions without presenting defaults as YOLO results', () => {
  assert.deepEqual(workflow.mappingGridSuggestions(detection), { rowSpacingM: 2.81, plantSpacingM: 2.68, gridBearingDeg: 270.4 })
  assert.deepEqual(workflow.mappingGridSuggestions({ ...detection, detectedBearingDeg: undefined }), { rowSpacingM: 2.81, plantSpacingM: 2.68, gridBearingDeg: null })
  assert.deepEqual(workflow.mappingGridSuggestions({ ...detection, detectedBearingDeg: 360, suggestedRowSpacing: -1, suggestedColSpacing: null }), { rowSpacingM: null, plantSpacingM: null, gridBearingDeg: null })
  assert.equal(workflow.mappingGridSuggestions({ ...detection, detectedBearingDeg: 0 }).gridBearingDeg, 0)
})

test('failed, malformed and mismatched results cannot populate the tree map', () => {
  const completed = { ...queued, status: 'COMPLETED', result: detection }
  for (const job of [
    { ...queued, status: 'FAILED' },
    { ...completed, result: null },
    { ...completed, result: { ...detection, activeTrees: undefined } },
    { ...completed, result: { ...detection, missingTrees: undefined } },
    { ...completed, tilingJobId: 'older-tiling-job' },
  ]) assert.equal(workflow.completedMissionYolo(job, 'mission-1', 'job-1'), null)
})

test('only an absent latest YOLO job is treated as empty', async () => {
  globalThis.fetch = async () => Response.json({ errorCode: 'Yolo.JobNotFound' }, { status: 404 })
  assert.equal(await api.getMissionYoloJob('manager', 'farm-1', 'mission-1', undefined), null)
  await assert.rejects(api.getMissionYoloJob('manager', 'farm-1', 'mission-1', 'yolo-1'), { status: 404, code: 'Yolo.JobNotFound' })
  globalThis.fetch = async () => Response.json({}, { status: 404 })
  await assert.rejects(api.getMissionYoloJob('manager', 'farm-1', 'mission-1', undefined), { status: 404 })
})

test('DetectTrees error codes translate to actionable Vietnamese messages', async () => {
  const { ApiError } = await import(clientUrl)
  assert.match(workflow.missionError(new ApiError(403, 'x', 'DetectTrees.FarmAccessDenied')), /không được phân công/)
})
