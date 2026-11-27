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

const polygon = { type: 'Polygon', coordinates: [[[106.1, 10.1], [106.2, 10.1], [106.2, 10.2], [106.1, 10.1]]] }
const tilingUrl = 'http://test.local/api/missions/mission-1/farms/farm-1/tiling-slice'
const queuedJob = { jobId: 'job-1', missionId: 'mission-1', status: 'QUEUED', polygonGeoJson: polygon, result: null, error: null }
const sliceResult = { isSuccess: true, missionId: 'mission-1', manifestStorageKey: 'tiles/job-1/manifest.json', totalTiles: 10, totalTiles640: 6, totalTiles1280: 4, dualScale: true, tiles: [] }

test('sliceMissionTiles queues work without enabling YOLO on the 202 receipt', async () => {
  let captured
  globalThis.fetch = async (url, options) => {
    captured = { url: url.toString(), method: options.method, body: JSON.parse(options.body) }
    return Response.json(queuedJob, { status: 202 })
  }
  const job = await api.sliceMissionTiles('manager', 'farm-1', 'mission-1', polygon)
  assert.deepEqual(captured, { url: tilingUrl, method: 'POST', body: { tileSize: 640, overlap: 64, dualScale: true, polygonGeoJson: polygon } })
  assert.equal(job.jobId, 'job-1')
  assert.equal(workflow.isMissionTilingActive(job), true)
  assert.equal(workflow.completedMissionTiling(job), null)
})

test('tiling job lookup restores the latest job and follows that exact ID to completion', async () => {
  const completed = { ...queuedJob, status: 'COMPLETED', result: sliceResult }
  const requests = []
  globalThis.fetch = async (url, options) => {
    requests.push({ url: url.toString(), cache: options.cache })
    return Response.json(url.toString().endsWith('/latest') ? { ...queuedJob, status: 'RUNNING' } : completed)
  }
  const latest = await api.getMissionTilingJob('manager', 'farm-1', 'mission-1', undefined)
  assert.equal(workflow.isMissionTilingActive(latest), true)
  assert.equal(workflow.completedMissionTiling(latest), null)
  const job = await api.getMissionTilingJob('manager', 'farm-1', 'mission-1', latest.jobId)
  assert.deepEqual(requests, [
    { url: tilingUrl + '/jobs/latest', cache: 'no-store' },
    { url: tilingUrl + '/jobs/job-1', cache: 'no-store' },
  ])
  assert.equal(workflow.isMissionTilingActive(job), false)
  assert.deepEqual(workflow.completedMissionTiling(job), { jobId: 'job-1', result: sliceResult, polygon })
})

test('only an absent latest job is treated as empty', async () => {
  globalThis.fetch = async () => Response.json({ errorCode: 'Tiling.JobNotFound' }, { status: 404 })
  assert.equal(await api.getMissionTilingJob('manager', 'farm-1', 'mission-1', undefined), null)
  await assert.rejects(api.getMissionTilingJob('manager', 'farm-1', 'mission-1', 'job-1'), { status: 404, code: 'Tiling.JobNotFound' })
  globalThis.fetch = async () => Response.json({}, { status: 404 })
  await assert.rejects(api.getMissionTilingJob('manager', 'farm-1', 'mission-1', undefined), { status: 404 })
})

test('failed jobs and completed jobs missing a manifest cannot run YOLO', () => {
  assert.equal(workflow.completedMissionTiling({ ...queuedJob, status: 'FAILED', error: 'Download failed' }), null)
  assert.equal(workflow.completedMissionTiling({ ...queuedJob, status: 'COMPLETED', result: { ...sliceResult, manifestStorageKey: null } }), null)
})
