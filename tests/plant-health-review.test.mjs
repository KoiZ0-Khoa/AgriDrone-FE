import { readFileSync } from 'node:fs'
import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'

const compile = file => ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023 } }).outputText
const dataUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
const clientUrl = dataUrl(compile('../src/api/client.ts').replace('import.meta.env.VITE_API_BASE_URL', "'http://test.local'"))
const api = await import(dataUrl(compile('../src/features/surveys/plantHealthReviewApi.ts').replace("'../../api/client'", JSON.stringify(clientUrl))))
const workflow = await import(dataUrl(compile('../src/features/surveys/plantHealthMapWorkflow.ts').replace("'../../api/client'", JSON.stringify(clientUrl))))
const { ApiError } = await import(clientUrl)
const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })

const base = 'http://test.local/api/system-manager/farms/farm-1/plant-health'
function capture(response, status = 200) {
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({ url: url.toString(), method: options.method ?? 'GET', auth: options.headers.Authorization, body: options.body ? JSON.parse(options.body) : undefined })
    return Response.json(response, { status })
  }
  return calls
}
const square = { type: 'Polygon', coordinates: [[[106.1, 10.1], [106.2, 10.1], [106.2, 10.2]]] }
const closedSquare = [[[106.1, 10.1], [106.2, 10.1], [106.2, 10.2], [106.1, 10.1]]]

test('reviewPlantObservation PUTs CONFIRMED with trimmed reason and corrected condition code', async () => {
  const calls = capture({ observationId: 'OBS-1', newStatus: 'CONFIRMED', resolvedPlantId: 'plant-1', reason: 'r' })
  const result = await api.reviewPlantObservation('tok', 'farm-1', 'obs-1', { decision: 'CONFIRMED', reason: '  vết rõ  ', correctedConditionCode: ' SUNBURN ' })
  assert.equal(calls[0].url, `${base}/observations/obs-1/review`)
  assert.equal(calls[0].method, 'PUT')
  assert.equal(calls[0].auth, 'Bearer tok')
  assert.deepEqual(calls[0].body, { decision: 'CONFIRMED', reason: 'vết rõ', correctedConditionCode: 'SUNBURN' })
  assert.equal(result.resolvedPlantId, 'plant-1')
})

test('reviewPlantObservation drops correctedConditionCode when rejecting', async () => {
  const calls = capture({ observationId: 'obs-1', newStatus: 'REJECTED', resolvedPlantId: null, reason: 'r' })
  await api.reviewPlantObservation('tok', 'farm-1', 'obs-1', { decision: 'REJECTED', reason: 'lá khô', correctedConditionCode: 'SUNBURN' })
  assert.deepEqual(calls[0].body, { decision: 'REJECTED', reason: 'lá khô' })
})

test('reviewPlantObservation rejects a response for another observation', async () => {
  capture({ observationId: 'obs-2', newStatus: 'CONFIRMED', resolvedPlantId: null, reason: 'r' })
  await assert.rejects(api.reviewPlantObservation('tok', 'farm-1', 'obs-1', { decision: 'CONFIRMED', reason: 'x' }), /không khớp/)
})

test('getFlaggedObservations reads the farm list and rejects a mismatched farm', async () => {
  const calls = capture({ farmId: 'farm-1', count: 1, items: [{ observationId: 'o', missionId: 'm', detectedLat: null, detectedLon: null, gpsDistanceMeters: 3.4, detectionConfidence: 0.9, matchingParametersJson: null, suggestedPlantId: null }] })
  const result = await api.getFlaggedObservations('tok', 'farm-1')
  assert.equal(calls[0].url, `${base}/flagged-observations`)
  assert.equal(calls[0].method, 'GET')
  assert.equal(result.count, 1)
  capture({ farmId: 'farm-9', count: 0, items: [] })
  await assert.rejects(api.getFlaggedObservations('tok', 'farm-1'), /không khớp/)
})

test('resolveFlaggedObservation sends only the fields of each action', async () => {
  let calls = capture({ observationId: 'obs-1', action: 'SNAP', newStatus: 'MATCHED', resolvedPlantId: 'p', newPlantId: null, newPlantCode: null })
  await api.resolveFlaggedObservation('tok', 'farm-1', 'obs-1', { action: 'SNAP', targetPlantId: 'p', reason: ' lệch góc ' })
  assert.equal(calls[0].url, `${base}/observations/obs-1/resolve-flag`)
  assert.equal(calls[0].method, 'POST')
  assert.deepEqual(calls[0].body, { action: 'SNAP', targetPlantId: 'p', reason: 'lệch góc' })

  calls = capture({ observationId: 'obs-1', action: 'DISMISS', newStatus: 'REJECTED', resolvedPlantId: null, newPlantId: null, newPlantCode: null })
  await api.resolveFlaggedObservation('tok', 'farm-1', 'obs-1', { action: 'DISMISS', reason: 'nhiễu' })
  assert.deepEqual(calls[0].body, { action: 'DISMISS', reason: 'nhiễu' })

  calls = capture({ observationId: 'obs-1', action: 'CREATE_NEW_PLANT', newStatus: 'NEW_PLANT', resolvedPlantId: 'n', newPlantId: 'n', newPlantCode: 'P-NEW' })
  await api.resolveFlaggedObservation('tok', 'farm-1', 'obs-1', { action: 'CREATE_NEW_PLANT', newPlantCode: '   ', zoneId: null, reason: 'trụ mới' })
  assert.deepEqual(calls[0].body, { action: 'CREATE_NEW_PLANT', reason: 'trụ mới' })
})

test('resolveFlaggedObservation accepts the 201 Created response of CREATE_NEW_PLANT', async () => {
  capture({ observationId: 'obs-1', action: 'CREATE_NEW_PLANT', newStatus: 'NEW_PLANT', resolvedPlantId: 'n', newPlantId: 'n', newPlantCode: 'P-NEW-1' }, 201)
  const result = await api.resolveFlaggedObservation('tok', 'farm-1', 'obs-1', { action: 'CREATE_NEW_PLANT', newPlantCode: 'p-new-1', reason: 'x' })
  assert.equal(result.newPlantCode, 'P-NEW-1')
})

test('mergeDiseaseZones closes the polygon and requires two distinct zones before calling BE', async () => {
  const calls = capture({ mergedZoneId: 'z3', totalTrees: 8, mergedZoneCount: 2 })
  const result = await api.mergeDiseaseZones('tok', 'farm-1', ['z1', 'z2'], square)
  assert.equal(calls[0].url, `${base}/disease-zones/merge`)
  assert.deepEqual(calls[0].body, { zoneIds: ['z1', 'z2'], mergedGeometry: { type: 'Polygon', coordinates: closedSquare } })
  assert.equal(result.mergedZoneCount, 2)
  await assert.rejects(api.mergeDiseaseZones('tok', 'farm-1', ['z1', 'Z1'], square), /ít nhất 2/)
  assert.equal(calls.length, 1)
})

test('updateDiseaseZoneBoundary PUTs a closed polygon and keeps an already-closed ring unchanged', async () => {
  const calls = capture({ zoneId: 'z1', geometryGeoJson: '{}', totalEnclosedTrees: 29 })
  await api.updateDiseaseZoneBoundary('tok', 'farm-1', 'z1', { type: 'Polygon', coordinates: closedSquare })
  assert.equal(calls[0].url, `${base}/disease-zones/z1/boundary`)
  assert.equal(calls[0].method, 'PUT')
  assert.deepEqual(calls[0].body, { newGeometry: { type: 'Polygon', coordinates: closedSquare } })
  await assert.rejects(api.updateDiseaseZoneBoundary('tok', 'farm-1', 'z1', { type: 'Polygon', coordinates: [[[1, 1], [2, 2]]] }), /ít nhất 3 điểm/)
  assert.equal(calls.length, 1)
})

test('updateDiseaseZoneMemberships PATCHes both arrays and blocks an empty change', async () => {
  const calls = capture({ zoneId: 'z1', totalEnclosedTrees: 5, addedCount: 1, removedCount: 0 })
  await api.updateDiseaseZoneMemberships('tok', 'farm-1', 'z1', { addPlantIds: ['p1'], removePlantIds: [] })
  assert.equal(calls[0].url, `${base}/disease-zones/z1/memberships`)
  assert.equal(calls[0].method, 'PATCH')
  assert.deepEqual(calls[0].body, { addPlantIds: ['p1'], removePlantIds: [] })
  await assert.rejects(api.updateDiseaseZoneMemberships('tok', 'farm-1', 'z1', { addPlantIds: [], removePlantIds: [] }), /Chưa chọn cây/)
  assert.equal(calls.length, 1)
})

test('plantHealthReviewError translates BE codes and falls back for access errors', () => {
  assert.match(workflow.plantHealthReviewError(new ApiError(400, 'x', 'ResolveFlagged.OutsideBoundary')), /ngoài ranh giới/)
  assert.match(workflow.plantHealthReviewError(new ApiError(409, 'x', 'UpdateZoneBoundary.InvalidStatus')), /không thể chỉnh viền/)
  assert.match(workflow.plantHealthReviewError(new ApiError(403, 'x', 'MergeZones.FarmAccessDenied')), /không được phân công/)
  assert.equal(workflow.plantHealthReviewError(new ApiError(500, 'Lỗi lạ', 'Other.Code')), 'Lỗi lạ')
})

test('parseMatchingParameters reads snake_case keys and tolerates bad JSON', () => {
  assert.deepEqual(workflow.parseMatchingParameters('{"class_name":"Disease_Sun_Burn","crop_image_url":"http://x/c.jpg"}'),
    { className: 'Disease_Sun_Burn', imageName: null, cropImageUrl: 'http://x/c.jpg', annotatedImageUrl: null, detectionId: null })
  assert.equal(workflow.parseMatchingParameters('{not json'), null)
  assert.equal(workflow.parseMatchingParameters('[1,2]'), null)
  assert.equal(workflow.parseMatchingParameters(null), null)
})
