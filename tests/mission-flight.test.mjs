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

test('start/complete-flight send only expectedMissionVersion to the mission-scoped transition routes', async () => {
  const calls = []
  globalThis.fetch = async (url, options) => {
    const parsed = new URL(url)
    calls.push({ path: parsed.pathname, method: options.method, body: JSON.parse(options.body) })
    return Response.json(calls.length === 1 ? { id: 'mission-1', status: 'IN_FLIGHT', version: 4 } : { id: 'mission-1', status: 'FLIGHT_COMPLETED', version: 5 })
  }
  const started = await api.startMission('manager', 'farm-1', 'mission-1', 3)
  assert.equal(started.status, 'IN_FLIGHT')
  assert.equal(started.version, 4)
  const completed = await api.completeFlightMission('manager', 'farm-1', 'mission-1', started.version)
  assert.equal(completed.status, 'FLIGHT_COMPLETED')
  assert.deepEqual(calls, [
    { path: '/api/system-manager/farms/farm-1/missions/mission-1/start', method: 'POST', body: { expectedMissionVersion: 3 } },
    { path: '/api/system-manager/farms/farm-1/missions/mission-1/complete-flight', method: 'POST', body: { expectedMissionVersion: 4 } },
  ])
})

test('cancel sends expectedMissionVersion + reason; fail-flight sends Idempotency-Key and the full incident payload', async () => {
  const calls = []
  globalThis.fetch = async (url, options) => {
    const parsed = new URL(url)
    calls.push({ path: parsed.pathname, headers: options.headers, body: JSON.parse(options.body) })
    return Response.json({ id: 'mission-1', status: calls.length === 1 ? 'CANCELLED' : 'FLIGHT_FAILED', version: 9 })
  }
  await api.cancelMission('manager', 'farm-1', 'mission-1', 5, 'Thời tiết không phù hợp')
  await api.failFlightMission('manager', 'farm-1', 'mission-1', { expectedMissionVersion: 6, reason: 'Mất tín hiệu', incidentType: 'SIGNAL_LOSS', incidentOutcome: 'Đã hạ cánh an toàn', recoveryDecision: 'RESCHEDULE_REQUIRED', evidenceReference: 'storage://evidence/1' }, 'op-1')
  assert.equal(calls[0].path, '/api/system-manager/farms/farm-1/missions/mission-1/cancel')
  assert.deepEqual(calls[0].body, { expectedMissionVersion: 5, reason: 'Thời tiết không phù hợp' })
  assert.equal(calls[1].path, '/api/system-manager/farms/farm-1/missions/mission-1/fail-flight')
  assert.equal(calls[1].headers['Idempotency-Key'], 'op-1')
  assert.equal(calls[1].body.recoveryDecision, 'RESCHEDULE_REQUIRED')
})

test('reschedule uses expectedVersion (not expectedMissionVersion) and omits replacementDroneId when not given', async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(new URL(url).pathname, '/api/system-manager/farms/farm-1/missions/mission-1/reschedule')
    const body = JSON.parse(options.body)
    assert.equal(body.expectedVersion, 7)
    assert.equal('expectedMissionVersion' in body, false)
    assert.equal('replacementDroneId' in body, false)
    return Response.json({ id: 'mission-1', status: 'SCHEDULED', version: 8 })
  }
  const result = await api.rescheduleMission('manager', 'farm-1', 'mission-1', { expectedVersion: 7, scheduledDate: '2026-11-01' })
  assert.equal(result.version, 8)
})

test('mission operation error codes (Start readiness gates) translate to actionable Vietnamese messages', async () => {
  const { ApiError } = await import(clientUrl)
  assert.match(workflow.missionError(new ApiError(409, 'x', 'MissionOperation.PreflightRequired')), /checklist preflight/)
  assert.match(workflow.missionError(new ApiError(409, 'x', 'MissionOperation.ScheduleWindowClosed')), /khung giờ đã lên lịch/)
  assert.match(workflow.missionError(new ApiError(409, 'x', 'MissionOperation.AppointmentWindowClosed')), /lịch hẹn Owner/)
  assert.match(workflow.missionError(new ApiError(409, 'x', 'MissionOperation.DroneNotOperational')), /không khả dụng/)
  assert.match(workflow.missionError(new ApiError(409, 'x', 'MissionOperation.BaselineNotCompleted')), /bản đồ nền/)
  assert.match(workflow.missionError(new ApiError(409, 'x', 'Mission.InvalidTransition')), /Không thể chuyển/)
})
