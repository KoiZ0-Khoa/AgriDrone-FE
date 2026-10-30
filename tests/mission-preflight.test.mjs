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

test('status/purpose labels normalize both PascalCase (prepare) and SCREAMING_SNAKE_CASE (list/detail) BE casings', () => {
  assert.equal(workflow.missionStatusLabel('Scheduled'), workflow.missionStatusLabel('SCHEDULED'))
  assert.equal(workflow.missionStatusLabel('ReadyForProcessing'), workflow.missionStatusLabel('READY_FOR_PROCESSING'))
  assert.equal(workflow.missionPurposeLabel('BaselineMapping'), workflow.missionPurposeLabel('BASELINE_MAPPING'))
  assert.equal(workflow.missionPurposeLabel(null), 'Chưa xác định')
  assert.equal(workflow.missionStatusLabel('SomeUnknownStatus'), 'SomeUnknownStatus')
})

test('findMissionById pages through the farm mission list and stops at the bound when not found', async () => {
  const calls = []
  globalThis.fetch = async url => {
    const parsed = new URL(url)
    const page = Number(parsed.searchParams.get('pageNumber'))
    calls.push(page)
    assert.equal(parsed.pathname, '/api/system-manager/farms/farm-1/missions')
    return Response.json({ items: [{ id: `mission-${page}` }], hasNextPage: page < 2 })
  }
  assert.equal((await api.findMissionById('manager', 'farm-1', 'mission-2')).id, 'mission-2')
  assert.deepEqual(calls, [1, 2])
  calls.length = 0
  assert.equal(await api.findMissionById('manager', 'farm-1', 'missing'), null)
  assert.deepEqual(calls, [1, 2])
})

test('active checklist and preflight completion hit the mission-scoped routes with Idempotency-Key', async () => {
  globalThis.fetch = async (url, options) => {
    const parsed = new URL(url)
    if (options?.method === 'POST') {
      assert.equal(parsed.pathname, '/api/system-manager/farms/farm-1/missions/mission-1/preflight')
      assert.equal(options.headers['Idempotency-Key'], 'op-1')
      assert.deepEqual(JSON.parse(options.body).answers, { battery: true, weather: false })
      return Response.json({ mission: { id: 'mission-1', status: 'SCHEDULED', version: 2, purpose: 'BASELINE_MAPPING', preflightSuitableForFlight: false }, reusedOperation: false })
    }
    assert.equal(parsed.pathname, '/api/system-manager/farms/farm-1/missions/mission-1/preflight/checklist')
    return Response.json({ definitionId: 'def-1', code: 'DRONE_PRE_FLIGHT', versionNumber: 3, items: [{ key: 'battery', prompt: 'Pin?', required: true }] })
  }
  const checklist = await api.getActivePreflightChecklist('manager', 'farm-1', 'mission-1')
  assert.equal(checklist.items[0].key, 'battery')
  const result = await api.completeMissionPreflight('manager', 'farm-1', 'mission-1', { expectedMissionVersion: 2, checklistDefinitionId: 'def-1', checklistVersion: 3, answers: { battery: true, weather: false }, suitableForFlight: false, notes: null, deviceCompletedAt: '2026-10-30T00:00:00.000Z' }, 'op-1')
  assert.equal(result.mission.version, 2)
  assert.equal(result.mission.preflightSuitableForFlight, false)
})

test('mission preflight error codes translate to actionable Vietnamese messages', async () => {
  const { ApiError } = await import(clientUrl)
  assert.match(workflow.missionError(new ApiError(409, 'x', 'MissionPreflight.InvalidMissionState')), /Đã lên lịch/)
  assert.match(workflow.missionError(new ApiError(409, 'x', 'MissionPreflight.AlreadyCompleted')), /không thể sửa/)
  assert.match(workflow.missionError(new ApiError(400, 'x', 'MissionPreflight.SuitableAnswersRequired')), /phù hợp để bay/)
  assert.match(workflow.missionError(new ApiError(500, 'x', 'MissionPreflight.DefinitionNotConfigured')), /System Admin/)
})
