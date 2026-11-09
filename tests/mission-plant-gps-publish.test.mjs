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
const samplePayload = { surveyOrderId: 'order-1', candidates: [sampleTree], rowSpacingM: 3, plantSpacingM: 2.5, gridBearingDeg: 0 }

test('publishMissionPlantGps POSTs to the mission-scoped publish route with the Idempotency-Key header and payload wrapper', async () => {
  let captured
  globalThis.fetch = async (url, options) => {
    captured = { path: new URL(url).pathname, method: options.method, headers: options.headers, body: JSON.parse(options.body) }
    return Response.json({ missionId: 'mission-1', messageId: 'msg-1', status: 'QUEUED' })
  }
  const result = await api.publishMissionPlantGps('manager', 'farm-1', 'mission-1', samplePayload, 'key-1')
  assert.equal(captured.path, '/api/system-manager/farms/farm-1/missions/mission-1/plant-gps/publish')
  assert.equal(captured.method, 'POST')
  assert.equal(captured.headers['Idempotency-Key'], 'key-1')
  assert.deepEqual(captured.body, { payload: samplePayload })
  assert.deepEqual(result, { missionId: 'mission-1', messageId: 'msg-1', status: 'QUEUED' })
})

test('a Conflict response (plain string array, no errorCode) still surfaces the first message via ApiError', async () => {
  const { ApiError } = await import(clientUrl)
  globalThis.fetch = async () => Response.json({ errors: ['Payload survey order does not match a baseline mapping mission.'] }, { status: 409 })
  await assert.rejects(() => api.publishMissionPlantGps('manager', 'farm-1', 'mission-1', samplePayload, 'key-1'), error => {
    assert.ok(error instanceof ApiError)
    assert.equal(error.status, 409)
    assert.equal(error.code, undefined)
    assert.equal(error.message, 'Payload survey order does not match a baseline mapping mission.')
    return true
  })
})

test('a ValidationProblem response (standard errors dictionary, no errorCode) surfaces the first field message', async () => {
  globalThis.fetch = async () => Response.json({ title: 'One or more validation errors occurred.', errors: { payload: ['Each candidate must include valid row, col, coordinates, confidence, status, and source.'] } }, { status: 400 })
  await assert.rejects(() => api.publishMissionPlantGps('manager', 'farm-1', 'mission-1', samplePayload, 'key-1'), error => {
    assert.equal(error.status, 400)
    assert.equal(error.message, 'Each candidate must include valid row, col, coordinates, confidence, status, and source.')
    return true
  })
})

test('a bare NotFound (empty body) falls back to the generic "unable to process" message', async () => {
  globalThis.fetch = async () => new Response(null, { status: 404 })
  await assert.rejects(() => api.publishMissionPlantGps('manager', 'farm-1', 'mission-1', samplePayload, 'key-1'), error => {
    assert.equal(error.status, 404)
    assert.equal(error.message, 'Không thể xử lý yêu cầu.')
    return true
  })
})

test('publishPlantGpsError translates the known Conflict/Invalid literal messages to Vietnamese', async () => {
  const { ApiError } = await import(clientUrl)
  assert.match(workflow.publishPlantGpsError(new ApiError(409, 'Payload survey order does not match a baseline mapping mission.')), /Khảo sát bản đồ nền/)
  assert.match(workflow.publishPlantGpsError(new ApiError(409, 'No saved plant GPS rows were found for this mission.')), /lưu nháp/)
  assert.match(workflow.publishPlantGpsError(new ApiError(409, 'Payload candidates must match every saved CSV tree_id exactly once.')), /không khớp/)
  assert.match(workflow.publishPlantGpsError(new ApiError(400, 'Each candidate must include valid row, col, coordinates, confidence, status, and source.')), /không hợp lệ/)
})

test('publishPlantGpsError falls back to missionError (status-based, then raw message) for anything not in the known list', async () => {
  const { ApiError } = await import(clientUrl)
  assert.match(workflow.publishPlantGpsError(new ApiError(404, 'Không thể xử lý yêu cầu.')), /Không tìm thấy/)
  assert.equal(workflow.publishPlantGpsError(new ApiError(409, 'Some brand-new business rule message.')), 'Some brand-new business rule message.')
})

test('surveyOrderIdFromMissionCode reconstructs the dashed GUID from the deterministic ORD-{N}-{suffix} missionCode (no GET-single-mission API needed after reload)', () => {
  assert.equal(workflow.surveyOrderIdFromMissionCode('ORD-a1b2c3d4e5f67890abcdef1234567890-BASE'), 'a1b2c3d4-e5f6-7890-abcd-ef1234567890')
  assert.equal(workflow.surveyOrderIdFromMissionCode('ORD-a1b2c3d4e5f67890abcdef1234567890-HEALTH'), 'a1b2c3d4-e5f6-7890-abcd-ef1234567890')
  // Uppercase hex still matches (case-insensitive) even though BE always emits lowercase.
  assert.equal(workflow.surveyOrderIdFromMissionCode('ORD-A1B2C3D4E5F67890ABCDEF1234567890-BASE'), 'a1b2c3d4-e5f6-7890-abcd-ef1234567890')
})

test('surveyOrderIdFromMissionCode returns null for a missionCode that does not follow the ORD-{N}-{suffix} convention', () => {
  assert.equal(workflow.surveyOrderIdFromMissionCode('TEST-MISSION-01'), null)
  assert.equal(workflow.surveyOrderIdFromMissionCode('ORD-tooshort-BASE'), null)
})

test('isBaselineMappingMissionCode reads the BASE suffix as a fallback for mission.purpose lost after a page reload', () => {
  assert.equal(workflow.isBaselineMappingMissionCode('ORD-a1b2c3d4e5f67890abcdef1234567890-BASE'), true)
  assert.equal(workflow.isBaselineMappingMissionCode('ORD-a1b2c3d4e5f67890abcdef1234567890-HEALTH'), false)
  assert.equal(workflow.isBaselineMappingMissionCode('ORD-a1b2c3d4e5f67890abcdef1234567890-READY'), false)
  assert.equal(workflow.isBaselineMappingMissionCode('TEST-MISSION-01'), false)
})
