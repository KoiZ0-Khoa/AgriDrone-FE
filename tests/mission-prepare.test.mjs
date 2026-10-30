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

test('mission purpose follows order status and selected service, never guessed otherwise', () => {
  const order = { surveyServiceCode: 'PLANT_HEALTH' }
  assert.equal(workflow.missionPurposeFor(order, 'BASELINE_READY'), 'BaselineMapping')
  assert.equal(workflow.missionPurposeFor(order, 'READY_FOR_PAID_SERVICE'), 'PlantHealth')
  assert.equal(workflow.missionPurposeFor({ surveyServiceCode: 'HARVEST_READINESS' }, 'READY_FOR_PAID_SERVICE'), 'HarvestReadiness')
  for (const status of ['AWAITING_BASELINE_DEPOSIT', 'BASELINE_IN_PROGRESS', 'AWAITING_PRICING', 'COMPLETED']) assert.equal(workflow.missionPurposeFor(order, status), null)
})

test('schedule window matches a whole Asia/Ho_Chi_Minh day (fixed UTC+7, no DST)', () => {
  assert.deepEqual(workflow.scheduleWindowForDate('2026-10-25'), { startAt: '2026-10-24T17:00:00.000Z', endAt: '2026-10-25T17:00:00.000Z' })
})

test('available drones query sends farm path, window and optional purpose', async () => {
  globalThis.fetch = async url => {
    const parsed = new URL(url)
    assert.equal(parsed.pathname, '/api/system-manager/farms/farm-1/drones/available')
    assert.equal(parsed.searchParams.get('startAt'), '2026-10-24T17:00:00.000Z')
    assert.equal(parsed.searchParams.get('endAt'), '2026-10-25T17:00:00.000Z')
    assert.equal(parsed.searchParams.get('purpose'), 'BaselineMapping')
    return Response.json([{ id: 'drone-1' }])
  }
  const drones = await api.getAvailableDrones('manager', 'farm-1', '2026-10-24T17:00:00.000Z', '2026-10-25T17:00:00.000Z', 'BaselineMapping')
  assert.equal(drones[0].id, 'drone-1')
})

test('available drones query omits purpose when not provided', async () => {
  globalThis.fetch = async url => { assert.equal(new URL(url).searchParams.has('purpose'), false); return Response.json([]) }
  await api.getAvailableDrones('manager', 'farm-1', 'start', 'end')
})

test('prepare mission set sends the Idempotency-Key header and the caller-provided body as-is', async () => {
  globalThis.fetch = async (url, options) => {
    const parsed = new URL(url)
    assert.equal(parsed.pathname, '/api/system-manager/survey-orders/order-1/missions/prepare')
    assert.equal(options.method, 'POST')
    assert.equal(options.headers.Authorization, 'Bearer manager')
    assert.equal(options.headers['Idempotency-Key'], 'key-1')
    assert.deepEqual(JSON.parse(options.body), { droneId: 'drone-1', baselineDate: '2026-10-25' })
    return Response.json({ surveyOrderId: 'order-1', farmId: 'farm-1', reusedExistingSet: false, missions: [{ missionId: 'mission-1', purpose: 'BaselineMapping', status: 'Scheduled', scheduledAt: null, scheduledEndAt: null, version: 1 }] })
  }
  const result = await api.prepareMissionSet('manager', 'order-1', { droneId: 'drone-1', baselineDate: '2026-10-25' }, 'key-1')
  assert.equal(result.reusedExistingSet, false)
  assert.equal(result.missions[0].status, 'Scheduled')
})

test('mission error messages translate known BE codes and fall back for unknown ones', async () => {
  const { ApiError } = await import(clientUrl)
  assert.match(workflow.missionError(new ApiError(409, 'x', 'MissionPlanning.DroneNotAvailable')), /không còn khả dụng/)
  assert.match(workflow.missionError(new ApiError(409, 'x', 'MissionPlanning.OrderNotReady')), /chưa đủ điều kiện/)
  assert.match(workflow.missionError(new ApiError(403, 'x')), /không có quyền/)
  assert.match(workflow.missionError(new ApiError(409, 'x', 'Mission.ConcurrentUpdate')), /cập nhật bởi người khác/)
  assert.equal(workflow.missionError(new Error('custom failure')), 'custom failure')
})
