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

test('process-metashape and process-odm hit distinct missionId-first routes with the same optional options body', async () => {
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({ path: new URL(url).pathname, method: options.method, body: JSON.parse(options.body) })
    return Response.json({ missionId: 'mission-1', taskId: 'task-1', status: 'QUEUED', message: 'submitted' })
  }
  await api.processMetashape('manager', 'farm-1', 'mission-1')
  await api.processOdm('manager', 'farm-1', 'mission-1', { cameraType: 'equidistant_fisheye' })
  assert.deepEqual(calls, [
    { path: '/api/missions/mission-1/farms/farm-1/process-metashape', method: 'POST', body: {} },
    { path: '/api/missions/mission-1/farms/farm-1/process-odm', method: 'POST', body: { cameraType: 'equidistant_fisheye' } },
  ])
})

test('orthophoto-status is a GET to the missionId-first route', async () => {
  globalThis.fetch = async url => {
    assert.equal(new URL(url).pathname, '/api/missions/mission-1/farms/farm-1/orthophoto-status')
    return Response.json({ missionId: 'mission-1', taskId: 'task-1', status: 'COMPLETED', progress: 100, processingTimeMs: 1000, previewUrl: 'https://x/preview.jpg', tifUrl: 'https://x/ortho.tif', bounds: { minLat: 1, maxLat: 2, minLon: 3, maxLon: 4 }, corners: null, errorMessage: null })
  }
  const result = await api.getOrthophotoStatus('manager', 'farm-1', 'mission-1')
  assert.equal(result.status, 'COMPLETED')
  assert.equal(result.bounds.minLat, 1)
})

test('orthophoto status labels/terminal check use the task-level vocabulary, not Mission status casing', () => {
  assert.equal(workflow.orthophotoStatusLabel('NOT_STARTED'), 'Chưa bắt đầu')
  assert.equal(workflow.orthophotoStatusLabel('COMPLETED'), 'Đã hoàn tất')
  assert.equal(workflow.orthophotoStatusLabel('SOME_FUTURE_STAGE'), 'SOME_FUTURE_STAGE')
  assert.equal(workflow.isOrthophotoTerminal('COMPLETED'), true)
  assert.equal(workflow.isOrthophotoTerminal('ERROR'), true)
  assert.equal(workflow.isOrthophotoTerminal('QUEUED'), false)
  assert.equal(workflow.isOrthophotoTerminal('NOT_STARTED'), false)
})

test('orthophoto/process-metashape error codes translate to actionable Vietnamese messages', async () => {
  const { ApiError } = await import(clientUrl)
  assert.match(workflow.missionError(new ApiError(403, 'x', 'OrthophotoStatus.FarmAccessDenied')), /không được phân công/)
  assert.match(workflow.missionError(new ApiError(400, 'x', 'ProcessMetashape.NoImages')), /chưa có ảnh gốc/)
})
