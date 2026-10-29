import { readFileSync } from 'node:fs'
import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'

const compile = file => ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023 } }).outputText
const dataUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
const clientUrl = dataUrl(compile('../src/api/client.ts').replace('import.meta.env.VITE_API_BASE_URL', "'http://test.local'"))
const droneApi = await import(dataUrl(compile('../src/features/missions/droneApi.ts').replace("'../../api/client'", JSON.stringify(clientUrl))))
const missionApi = await import(dataUrl(compile('../src/features/missions/missionApi.ts').replace("'../../api/client'", JSON.stringify(clientUrl))))
const checklistApi = await import(dataUrl(compile('../src/features/missions/checklistApi.ts').replace("'../../api/client'", JSON.stringify(clientUrl))))
const workflow = await import(dataUrl(compile('../src/features/missions/workflow.ts')))
const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })

test('drone registry register/update/status use expected routes and payloads', async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'http://test.local/api/system/drones')
    assert.equal(options.method, 'POST')
    assert.deepEqual(JSON.parse(options.body), {
      code: 'DRONE-1', name: 'AgriDrone 1', model: null, manufacturer: null,
      specifications: { capabilities: ['BASELINE_MAPPING'] }, serialNumber: null, registrationNumber: null,
      registrationDate: null, registrationExpiryDate: null, weightKg: null, notes: null,
    })
    return Response.json({ id: 'drone', version: 1 })
  }
  await droneApi.registerDrone('admin', {
    code: 'DRONE-1', name: 'AgriDrone 1', model: null, manufacturer: null,
    specifications: { capabilities: ['BASELINE_MAPPING'] }, serialNumber: null, registrationNumber: null,
    registrationDate: null, registrationExpiryDate: null, weightKg: null, notes: null,
  })

  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'http://test.local/api/system/drones/d%2F1')
    assert.equal(options.method, 'PUT')
    assert.equal(JSON.parse(options.body).expectedVersion, 4)
    return Response.json({ id: 'd/1', version: 5 })
  }
  assert.equal((await droneApi.updateDrone('admin', 'd/1', {
    expectedVersion: 4, name: 'X', model: null, manufacturer: null, specifications: undefined,
    serialNumber: null, registrationNumber: null, registrationDate: null, registrationExpiryDate: null, weightKg: null, notes: null,
  })).version, 5)

  const statusBody = { status: 'Maintenance', nextMaintenanceAt: '2026-11-01T00:00:00.000Z', expectedVersion: 5, reason: 'Bảo trì định kỳ' }
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'http://test.local/api/system/drones/d%2F1/status')
    assert.equal(options.method, 'PATCH')
    assert.deepEqual(JSON.parse(options.body), statusBody)
    return Response.json({ id: 'd/1', version: 6 })
  }
  await droneApi.changeDroneStatus('admin', 'd/1', statusBody)
})

test('available drones query sends the time window and omits purpose when not given', async () => {
  globalThis.fetch = async url => {
    const parsed = new URL(url)
    assert.equal(parsed.pathname, '/api/system-manager/farms/farm-1/drones/available')
    assert.equal(parsed.searchParams.get('startAt'), '2026-10-25T00:00:00+07:00')
    assert.equal(parsed.searchParams.get('endAt'), '2026-10-25T23:59:59+07:00')
    assert.equal(parsed.searchParams.has('purpose'), false)
    return Response.json([])
  }
  await droneApi.getAvailableDrones('manager', 'farm-1', '2026-10-25T00:00:00+07:00', '2026-10-25T23:59:59+07:00')
})

test('prepare mission set sends the idempotency header and a date-only body', async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'http://test.local/api/system-manager/survey-orders/order-1/missions/prepare')
    assert.equal(options.method, 'POST')
    assert.equal(options.headers['Idempotency-Key'], 'key-1')
    assert.deepEqual(JSON.parse(options.body), { droneId: 'drone-1', baselineDate: '2026-10-25' })
    return Response.json({ surveyOrderId: 'order-1', farmId: 'farm-1', reusedExistingSet: false, missions: [] })
  }
  const result = await missionApi.prepareMissionSet('manager', 'order-1', { droneId: 'drone-1', baselineDate: '2026-10-25' }, 'key-1')
  assert.equal(result.reusedExistingSet, false)
})

test('mission lifecycle transitions send expectedMissionVersion and the required fields for each action', async () => {
  const base = 'http://test.local/api/system-manager/farms/farm-1/missions/mission-1'

  globalThis.fetch = async url => { assert.equal(url, `${base}/version`); return Response.json({ id: 'mission-1', version: 2 }) }
  assert.equal((await missionApi.getMissionVersion('manager', 'farm-1', 'mission-1')).version, 2)

  globalThis.fetch = async (url, options) => {
    assert.equal(url, `${base}/start`)
    assert.deepEqual(JSON.parse(options.body), { expectedMissionVersion: 2 })
    return Response.json({ id: 'mission-1', status: 'InFlight', version: 3 })
  }
  assert.equal((await missionApi.startMission('manager', 'farm-1', 'mission-1', 2)).status, 'InFlight')

  globalThis.fetch = async (url, options) => {
    assert.equal(url, `${base}/complete-flight`)
    assert.deepEqual(JSON.parse(options.body), { expectedMissionVersion: 3 })
    return Response.json({ id: 'mission-1', status: 'FlightCompleted', version: 4 })
  }
  assert.equal((await missionApi.completeFlight('manager', 'farm-1', 'mission-1', 3)).status, 'FlightCompleted')

  const cancelBody = { expectedMissionVersion: 2, reason: 'Thời tiết không phù hợp' }
  globalThis.fetch = async (url, options) => {
    assert.equal(url, `${base}/cancel`)
    assert.deepEqual(JSON.parse(options.body), cancelBody)
    return Response.json({ id: 'mission-1', status: 'Cancelled', version: 3 })
  }
  assert.equal((await missionApi.cancelMission('manager', 'farm-1', 'mission-1', cancelBody)).status, 'Cancelled')

  const failBody = {
    expectedMissionVersion: 3, reason: 'Mất tín hiệu điều khiển', incidentIdempotencyKey: 'incident-1',
    incidentType: 'SIGNAL_LOSS', incidentOutcome: 'Drone đã hạ cánh an toàn', recoveryDecision: 'RESCHEDULE_REQUIRED', evidenceReference: null,
  }
  globalThis.fetch = async (url, options) => {
    assert.equal(url, `${base}/fail-flight`)
    assert.deepEqual(JSON.parse(options.body), failBody)
    return Response.json({ id: 'mission-1', status: 'FlightFailed', version: 4 })
  }
  assert.equal((await missionApi.failFlight('manager', 'farm-1', 'mission-1', failBody)).status, 'FlightFailed')

  const rescheduleBody = { expectedVersion: 4, scheduledDate: '2026-10-27' }
  globalThis.fetch = async (url, options) => {
    assert.equal(url, `${base}/reschedule`)
    assert.deepEqual(JSON.parse(options.body), rescheduleBody)
    return Response.json({ id: 'mission-1', status: 'Scheduled', version: 5 })
  }
  assert.equal((await missionApi.rescheduleMission('manager', 'farm-1', 'mission-1', rescheduleBody)).status, 'Scheduled')
})

test('preflight completion reads the active checklist then submits identity and answers from it', async () => {
  globalThis.fetch = async url => {
    assert.equal(url, 'http://test.local/api/system-manager/farms/farm-1/missions/mission-1/preflight/checklist')
    return Response.json({ definitionId: 'def-1', code: 'preflight', versionNumber: 2, items: [{ key: 'battery', prompt: 'Pin đủ an toàn?', required: true }] })
  }
  const checklist = await checklistApi.getActiveChecklist('manager', 'farm-1', 'mission-1')
  assert.equal(checklist.items[0].key, 'battery')

  const body = { idempotencyKey: 'op-1', expectedMissionVersion: 2, checklistDefinitionId: 'def-1', checklistVersion: 2, answers: { battery: true }, suitableForFlight: true, notes: null }
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'http://test.local/api/system-manager/farms/farm-1/missions/mission-1/preflight')
    assert.deepEqual(JSON.parse(options.body), body)
    return Response.json({ mission: { id: 'mission-1', status: 'Scheduled', version: 3 }, reusedOperation: false })
  }
  assert.equal((await missionApi.completePreflight('manager', 'farm-1', 'mission-1', body)).mission.version, 3)
})

test('checklist definition writes use POST create and PATCH conditions, never a GET', async () => {
  const items = [{ key: 'battery', prompt: 'Pin đủ an toàn?', required: true }]
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'http://test.local/api/system/preflight-checklist')
    assert.equal(options.method, 'POST')
    assert.deepEqual(JSON.parse(options.body), { items })
    return Response.json({ definitionId: 'def-1', code: 'preflight', versionNumber: 1, effectiveFrom: '2026-10-25T00:00:00Z' })
  }
  assert.equal((await checklistApi.createChecklist('admin', items)).versionNumber, 1)

  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'http://test.local/api/system/preflight-checklist/conditions')
    assert.equal(options.method, 'PATCH')
    assert.deepEqual(JSON.parse(options.body), { itemsToAdd: items, keysToRemove: ['oldKey'] })
    return Response.json({ definitionId: 'def-1', code: 'preflight', versionNumber: 2, effectiveFrom: '2026-10-25T00:00:00Z' })
  }
  assert.equal((await checklistApi.changeChecklistConditions('admin', items, ['oldKey'])).versionNumber, 2)
})

test('operationFor keeps the key for a retried payload and mints a new one once edited', () => {
  const first = workflow.operationFor(null, { a: 1 })
  const retry = workflow.operationFor(first, { a: 1 })
  assert.equal(retry.key, first.key)
  const edited = workflow.operationFor(retry, { a: 2 })
  assert.notEqual(edited.key, first.key)
})

test('drone specification JSON and weight parsing reject invalid input without guessing a value', () => {
  assert.throws(() => workflow.parseSpecifications('{not json'))
  assert.equal(workflow.parseSpecifications(''), undefined)
  assert.deepEqual(workflow.parseSpecifications('{"capabilities":["BASELINE_MAPPING"]}'), { capabilities: ['BASELINE_MAPPING'] })
  assert.equal(workflow.optionalDecimal('', 'Trọng lượng'), null)
  assert.equal(workflow.optionalDecimal('8.5', 'Trọng lượng'), 8.5)
  assert.throws(() => workflow.optionalDecimal('-1', 'Trọng lượng'))
  assert.throws(() => workflow.optionalDecimal('not-a-number', 'Trọng lượng'))
})
