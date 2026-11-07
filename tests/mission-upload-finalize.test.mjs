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

test('readiness and finalize hit the missionId-first upload route', async () => {
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({ path: new URL(url).pathname, method: options.method ?? 'GET', body: options.body ? JSON.parse(options.body) : undefined })
    return calls.length === 1
      ? Response.json({ missionId: 'mission-1', missionVersion: 5, status: 'Uploading', canFinalize: false, rawImageCount: 3, rawVideoCount: 0, telemetryPointCount: 0, hasActiveUploadSessions: false, blockers: ['MissionUpload.TelemetryMissing'] })
      : Response.json({ missionId: 'mission-1', status: 'ReadyForProcessing', mediaCount: 3, telemetryPointCount: 120, missionVersion: 6 })
  }
  const readiness = await api.getUploadReadiness('manager', 'farm-1', 'mission-1')
  assert.equal(readiness.canFinalize, false)
  assert.deepEqual(readiness.blockers, ['MissionUpload.TelemetryMissing'])
  const finalized = await api.finalizeMissionUpload('manager', 'farm-1', 'mission-1', 5)
  assert.equal(finalized.status, 'ReadyForProcessing')
  assert.deepEqual(calls, [
    { path: '/api/missions/mission-1/farms/farm-1/upload/readiness', method: 'GET', body: undefined },
    { path: '/api/missions/mission-1/farms/farm-1/upload/finalize', method: 'POST', body: { expectedMissionVersion: 5 } },
  ])
})

test('resetMissionUpload POSTs expectedMissionVersion and resetTelemetry to the missionId-first upload/reset route', async () => {
  let captured
  globalThis.fetch = async (url, options) => {
    captured = { path: new URL(url).pathname, method: options.method, body: JSON.parse(options.body) }
    return Response.json({ missionId: 'mission-1', status: 'Uploading', deletedMediaCount: 4, telemetryReset: true, missionVersion: 7 })
  }
  const result = await api.resetMissionUpload('manager', 'farm-1', 'mission-1', 6, true)
  assert.equal(captured.path, '/api/missions/mission-1/farms/farm-1/upload/reset')
  assert.equal(captured.method, 'POST')
  assert.deepEqual(captured.body, { expectedMissionVersion: 6, resetTelemetry: true })
  assert.deepEqual(result, { missionId: 'mission-1', status: 'Uploading', deletedMediaCount: 4, telemetryReset: true, missionVersion: 7 })
})

test('MissionUpload reset error codes translate to actionable Vietnamese messages', async () => {
  const { ApiError } = await import(clientUrl)
  assert.match(workflow.missionError(new ApiError(409, 'x', 'MissionUpload.CannotResetInCurrentStatus')), /Chỉ reset được khi/)
  assert.match(workflow.missionError(new ApiError(409, 'x', 'MissionUpload.MissionNotOrderBound')), /không gắn đơn khảo sát/)
})

test('uploadBlockerLabel translates known blocker codes and falls back to the raw code otherwise', () => {
  assert.match(workflow.uploadBlockerLabel('MissionUpload.TelemetryMissing'), /telemetry/)
  assert.match(workflow.uploadBlockerLabel('MissionUpload.RequiredMediaMissing'), /Thiếu ảnh/)
  assert.equal(workflow.uploadBlockerLabel('MissionUpload.SomeFutureCode'), 'MissionUpload.SomeFutureCode')
})

test('toScreamingSnakeCase normalizes the Finalize response PascalCase status so later equality checks still match', () => {
  assert.equal(workflow.toScreamingSnakeCase('ReadyForProcessing'), 'READY_FOR_PROCESSING')
  assert.equal(workflow.toScreamingSnakeCase('Uploading'), 'UPLOADING')
})
