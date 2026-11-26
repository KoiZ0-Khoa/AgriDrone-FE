import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { afterEach, test } from 'node:test'
import ts from 'typescript'

const compile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const dataUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
const clientUrl = dataUrl(compile('../src/api/client.ts').replace('import.meta.env.VITE_API_BASE_URL', "'http://test.local'"))
const v3WorkflowUrl = dataUrl(compile('../src/features/surveys/v3Workflow.ts'))
const workflow = await import(dataUrl(compile('../src/features/surveys/orderWorkflow.ts').replace("'./v3Workflow'", JSON.stringify(v3WorkflowUrl))))
const v3 = await import(v3WorkflowUrl)
const v3Api = await import(dataUrl(compile('../src/features/surveys/v3Api.ts').replace("'../../api/client'", JSON.stringify(clientUrl))))
const missionApi = await import(dataUrl(compile('../src/features/missions/missionApi.ts').replace("'../../api/client'", JSON.stringify(clientUrl))))
const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })

const window = { startAt: '2099-03-03T20:30:00Z', endAt: '2099-03-04T17:00:00Z' }
const order = {
  surveyOrderId: 'order', farmId: 'farm', tenantId: 'tenant', orderVersion: 31,
  status: 'READY_FOR_CAPTURE', requiresBaselineMapping: true, surveyServiceCode: 'COMBO',
  currentAppointmentId: 'appointment', currentAppointmentVersion: 21, currentAppointmentStatus: 'CONFIRMED',
  currentAppointmentPurpose: 'CAPTURE', currentAppointmentStartAt: window.startAt, currentAppointmentEndAt: window.endAt,
}
const scope = { surveyOrderId: 'order', farmId: 'farm', tenantId: 'tenant', orderVersion: 31, orderStatus: 'READY_FOR_CAPTURE', requiresBaselineMapping: true }

test('initial V3 capture preparation requires a fresh confirmed capture window and no existing attempt', () => {
  const now = Date.parse('2099-03-03T21:00:00Z')
  assert.deepEqual(workflow.capturePreparationWindow(order, scope, [], now), window)
  for (const change of [{ surveyServiceCode: 'PLANT_HEALTH' }, { orderVersion: 32 }, { status: 'AWAITING_DEPOSIT' },
    { currentAppointmentStatus: 'PROPOSED' }, { currentAppointmentPurpose: 'PAID_SERVICE' }, { currentAppointmentVersion: 0 },
    { currentAppointmentStartAt: undefined }, { currentAppointmentEndAt: window.startAt }]) {
    assert.equal(workflow.capturePreparationWindow({ ...order, ...change }, scope, [], now), null)
  }
  assert.equal(workflow.capturePreparationWindow(order, scope, [{ status: 'PLANNED' }], now), null)
  assert.equal(workflow.capturePreparationWindow(order, scope, [], Date.parse(window.endAt)), null)
})

test('Manager loads drones for the exact confirmed slot and creates a V3 capture attempt with the order version', async () => {
  const signal = new AbortController().signal
  globalThis.fetch = async (url, options) => {
    const path = new URL(url)
    assert.equal(path.pathname, '/api/system-manager/farms/farm/drones/available')
    assert.equal(path.searchParams.get('startAt'), window.startAt)
    assert.equal(path.searchParams.get('endAt'), window.endAt)
    assert.equal(path.searchParams.get('purpose'), 'BaselineMapping')
    assert.equal(options.signal, signal)
    return Response.json([
      { id: 'map-drone', specifications: { capabilities: ['BASELINE_MAPPING'] } },
      { id: 'combo-drone', specifications: { capabilities: ['BASELINE_MAPPING', 'PLANT_HEALTH'] } },
    ])
  }
  const choices = await missionApi.getAvailableDrones('manager', order.farmId, window.startAt, window.endAt, 'BaselineMapping', signal)
  const selected = choices.filter(drone => v3.droneSupportsService(drone.specifications.capabilities, order.surveyServiceCode))
  assert.deepEqual(selected.map(drone => drone.id), ['combo-drone'])
  const body = { droneId: selected[0].id, expectedOrderVersion: order.orderVersion }
  const operation = await v3.v3OperationFor(null, body)
  const request = { ...body, operationId: operation.operationId, payloadFingerprint: operation.payloadFingerprint }
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'http://test.local/api/v3/system-manager/survey-orders/order/capture-attempts')
    assert.equal(options.method, 'POST')
    assert.equal(options.headers.Authorization, 'Bearer manager')
    assert.deepEqual(JSON.parse(options.body), request)
    return Response.json({ success: true, attemptId: 'a1', attemptIndex: 1, missionId: 'm1', status: 'Planned', version: 4 }, { status: 201 })
  }
  assert.equal((await v3Api.prepareCaptureAttempt('manager', order.surveyOrderId, request)).missionId, 'm1')
})
