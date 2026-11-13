import { readFileSync } from 'node:fs'
import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'

const compile = file => ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023 } }).outputText
const dataUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
const clientUrl = dataUrl(compile('../src/api/client.ts').replace('import.meta.env.VITE_API_BASE_URL', "'http://test.local'"))
const api = await import(dataUrl(compile('../src/features/surveys/healthReviewApi.ts').replace("'../../api/client'", JSON.stringify(clientUrl))))
const workflow = await import(dataUrl(compile('../src/features/surveys/healthReviewWorkflow.ts').replace("'../../api/client'", JSON.stringify(clientUrl))))
const { ApiError } = await import(clientUrl)
const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })

const base = 'http://test.local/api/system-manager/survey-orders/order-1'
function capture(response, status = 200) {
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({ url: url.toString(), method: options.method ?? 'GET', body: options.body ? JSON.parse(options.body) : undefined })
    return Response.json(response, { status })
  }
  return calls
}
const outcome = { operationId: 'op-1', resultId: 'r', batchId: 'b', resultVersion: 6, reviewRevision: 8, reviews: [], invalidatedZoneIds: [], isReplay: false, isCurrentBatch: true }
const item = (overrides = {}) => ({ findingId: 'f1', expectedSourceVersion: 1, expectedReviewVersion: null, decision: 'Reject', reason: ' lá khô ', evidenceMediaIds: [], ...overrides })

test('getHealthReviewSummary reads the order summary route', async () => {
  const calls = capture({ readyForApproval: false, unreviewedFindings: 3 })
  const summary = await api.getHealthReviewSummary('tok', 'order-1')
  assert.equal(calls[0].url, `${base}/health-results/review-summary`)
  assert.equal(summary.unreviewedFindings, 3)
})

test('getHealthReviewQueue uses pageNumber (not page), caps pageSize at 100 and passes filters', async () => {
  const calls = capture({ items: [], totalCount: 0 })
  await api.getHealthReviewQueue('tok', 'order-1', 'findings', { pageNumber: 2, pageSize: 500, resolutionState: 'NEEDS_REVIEW', decision: 'Pending' })
  const url = new URL(calls[0].url)
  assert.equal(url.pathname, '/api/system-manager/survey-orders/order-1/health-findings')
  assert.deepEqual(Object.fromEntries(url.searchParams), { pageNumber: '2', pageSize: '100', decision: 'Pending', resolutionState: 'NEEDS_REVIEW' })
  await api.getHealthReviewQueue('tok', 'order-1', 'exceptions')
  assert.equal(new URL(calls[1].url).pathname, '/api/system-manager/survey-orders/order-1/health-boundary-exceptions')
  await assert.rejects(api.getHealthReviewQueue('tok', 'order-1', 'exceptions', { zoneId: 'z' }), /vùng bệnh/)
})

test('reviewHealthFindings posts only DTO fields, keeps null expectedReviewVersion and trims reasons', async () => {
  const calls = capture(outcome)
  await api.reviewHealthFindings('tok', 'order-1', { operationId: 'op-1', batchId: 'b', expectedResultVersion: 5, items: [item(), item({ findingId: 'f2', expectedReviewVersion: 3, decision: 'NonDisease' })] })
  assert.equal(calls[0].url, `${base}/health-findings/review-batch`)
  assert.equal(calls[0].method, 'POST')
  assert.deepEqual(calls[0].body, { operationId: 'op-1', batchId: 'b', expectedResultVersion: 5, items: [
    { findingId: 'f1', expectedSourceVersion: 1, expectedReviewVersion: null, decision: 'Reject', reason: 'lá khô', evidenceMediaIds: [] },
    { findingId: 'f2', expectedSourceVersion: 1, expectedReviewVersion: 3, decision: 'NonDisease', reason: 'lá khô', evidenceMediaIds: [] },
  ] })
})

test('reviewHealthFindings validates the batch before calling BE', async () => {
  const calls = capture(outcome)
  const request = items => ({ operationId: 'op-1', batchId: 'b', expectedResultVersion: 5, items })
  await assert.rejects(api.reviewHealthFindings('tok', 'order-1', request([])), /từ 1 đến 100/)
  await assert.rejects(api.reviewHealthFindings('tok', 'order-1', request(Array.from({ length: 101 }, (_, i) => item({ findingId: `f${i}` })))), /từ 1 đến 100/)
  await assert.rejects(api.reviewHealthFindings('tok', 'order-1', request([item(), item({ findingId: 'F1' })])), /trùng/)
  await assert.rejects(api.reviewHealthFindings('tok', 'order-1', request([item({ reason: '   ' })])), /Nhập lý do/)
  await assert.rejects(api.reviewHealthFindings('tok', 'order-1', request([item({ reason: 'x'.repeat(2001) })])), /2000/)
  await assert.rejects(api.reviewHealthFindings('tok', 'order-1', request([item({ decision: 'Correct' })])), /ít nhất một trường/)
  await assert.rejects(api.reviewHealthFindings('tok', 'order-1', request([item({ decision: 'NonDisease', correctedClassCode: 'SUNBURN' })])), /Chỉ quyết định Sửa/)
  assert.equal(calls.length, 0)
})

test('reviewHealthFindings sends Correct fields only for Correct', async () => {
  const calls = capture(outcome)
  await api.reviewHealthFindings('tok', 'order-1', { operationId: 'op-1', batchId: 'b', expectedResultVersion: 5, items: [item({ decision: 'Correct', correctedPlantId: 'p1', correctedPosition: { type: 'Point', coordinates: [106.4, 10.4] } })] })
  assert.deepEqual(calls[0].body.items[0], { findingId: 'f1', expectedSourceVersion: 1, expectedReviewVersion: null, decision: 'Correct', reason: 'lá khô', evidenceMediaIds: [], correctedPlantId: 'p1', correctedPosition: { type: 'Point', coordinates: [106.4, 10.4] } })
})

test('reviewHealthFindings rejects an outcome for another operation', async () => {
  capture({ ...outcome, operationId: 'op-other' })
  await assert.rejects(api.reviewHealthFindings('tok', 'order-1', { operationId: 'op-1', batchId: 'b', expectedResultVersion: 5, items: [item()] }), /mã thao tác/)
})

test('reviewHealthBoundaryException requires a finding link except for NeedsEvidence', async () => {
  const calls = capture(outcome)
  const request = overrides => ({ operationId: 'op-1', batchId: 'b', expectedResultVersion: 5, expectedExceptionVersion: 7, expectedReviewVersion: null, reason: 'ngoài ranh', evidenceMediaIds: [], ...overrides })
  await api.reviewHealthBoundaryException('tok', 'order-1', 'ex-1', request({ decision: 'ExcludeEvidence', findingId: 'f1', findingReviewId: 'rv1' }))
  assert.equal(calls[0].url, `${base}/health-boundary-exceptions/ex-1/review`)
  assert.deepEqual(calls[0].body, { operationId: 'op-1', batchId: 'b', expectedResultVersion: 5, expectedExceptionVersion: 7, expectedReviewVersion: null, decision: 'ExcludeEvidence', reason: 'ngoài ranh', evidenceMediaIds: [], findingId: 'f1', findingReviewId: 'rv1' })
  await api.reviewHealthBoundaryException('tok', 'order-1', 'ex-1', request({ decision: 'NeedsEvidence' }))
  assert.equal('findingId' in calls[1].body, false)
  await assert.rejects(api.reviewHealthBoundaryException('tok', 'order-1', 'ex-1', request({ decision: 'ExcludeEvidence' })), /Chọn phát hiện/)
  await assert.rejects(api.reviewHealthBoundaryException('tok', 'order-1', 'ex-1', request({ decision: 'NeedsEvidence', findingId: 'f1' })), /không được gắn/)
  assert.equal(calls.length, 2)
})

test('healthReviewError translates PlantHealthReview codes and flags reloadable conflicts', () => {
  assert.match(workflow.healthReviewError(new ApiError(409, 'x', 'PlantHealthReview.VersionConflict')), /Tải lại/)
  assert.match(workflow.healthReviewError(new ApiError(409, 'x', 'PlantHealthReview.ResultLocked')), /chờ kiểm duyệt/)
  assert.match(workflow.healthReviewError(new ApiError(404, 'x')), /Không tìm thấy/)
  assert.equal(workflow.isReviewVersionConflict(new ApiError(409, 'x', 'PlantHealthReview.BatchChanged')), true)
  assert.equal(workflow.isReviewVersionConflict(new ApiError(409, 'x', 'PlantHealthReview.ResultLocked')), false)
})

test('readers parse PascalCase original/snapshot JSON and tolerate missing fields', () => {
  const finding = workflow.readFindingOriginal({ FindingId: 'src', PlantId: null, Position: { Type: 'Point', Coordinates: [106.49, 10.46] }, Confidence: 0.333, SuspectedClassCode: 'SUNBURN', EvidenceMedia: [{ MediaAssetId: 'm1', Role: 'source_image' }] })
  assert.equal(finding.lon, 106.49); assert.equal(finding.lat, 10.46); assert.equal(finding.plantId, null)
  assert.equal(finding.suspectedClassCode, 'SUNBURN'); assert.deepEqual(finding.evidenceMediaIds, ['m1'])
  assert.equal(workflow.readFindingOriginal(null).lat, null)
  const boundary = workflow.readBoundaryOriginal({ SourceReferenceId: 'x', OriginalPosition: { Coordinates: [1, 2] }, MeasuredBoundaryDistanceM: 0.8, BoundaryThresholdM: 1.5, EvidenceMedia: [] })
  assert.equal(boundary.measuredBoundaryDistanceM, 0.8); assert.equal(boundary.lat, 2)
  assert.deepEqual(workflow.readReviewSnapshot({ PlantId: 'p', ClassCode: 'SUNBURN', Position: [1, 2] }), { plantId: 'p', classCode: 'SUNBURN', lon: 1, lat: 2, boundFindingId: null })
})

test('findingRow prefers reviewed plant/class/position and labels decisions and blockers', () => {
  const original = { FindingId: 'src', PlantId: null, Position: { Coordinates: [106.49, 10.46] }, Confidence: 0.333, SuspectedClassCode: 'SUNBURN' }
  const plantCodes = new Map([['p-1', 'P-B9D9-001-004']])
  const classNames = new Map([['SUNBURN', 'Cháy nắng'], ['ANTHRACNOSE', 'Thán thư']])
  const pending = workflow.findingRow({ id: 'f1', observedAt: '2026-10-01T02:00:00Z', resolutionState: 'PENDING_REVIEW', original, review: null, blockingReasons: ['Unreviewed'] }, plantCodes, classNames)
  assert.equal(pending.className, 'Cháy nắng'); assert.equal(pending.plantLabel, 'Chưa gắn trụ'); assert.equal(pending.plantId, null)
  assert.equal(pending.decision, 'Pending'); assert.equal(pending.decisionLabel, 'Chưa review'); assert.deepEqual(pending.blockingReasons, ['Chưa review'])
  assert.equal(pending.lat, 10.46)
  const corrected = workflow.findingRow({ id: 'f1', observedAt: 'x', resolutionState: 'RESOLVED', original, blockingReasons: [],
    review: { reviewId: 'rv', version: 1, decision: 'Correct', reviewedBy: 'u', reviewedAt: 'y', reason: 'gắn trụ', snapshot: { PlantId: 'P-1', ClassCode: 'ANTHRACNOSE', Position: [106.5, 10.5] } } }, plantCodes, classNames)
  assert.equal(corrected.className, 'Thán thư'); assert.equal(corrected.reviewedClass, 'ANTHRACNOSE'); assert.equal(corrected.originalClass, 'SUNBURN')
  assert.equal(corrected.plantLabel, 'P-B9D9-001-004'); assert.equal(corrected.lat, 10.5); assert.equal(corrected.decisionLabel, 'Đã sửa'); assert.equal(corrected.reviewReason, 'gắn trụ')
  const unknownPlant = workflow.findingRow({ id: 'f2', observedAt: 'x', resolutionState: 'NEEDS_REVIEW', original: { ...original, PlantId: 'other' }, review: null, blockingReasons: ['NewCode'] }, plantCodes, new Map())
  assert.equal(unknownPlant.plantLabel, 'Trụ ngoài bản đồ hiện tại'); assert.equal(unknownPlant.className, 'SUNBURN'); assert.deepEqual(unknownPlant.blockingReasons, ['NewCode'])
})

test('buildFindingBatch takes batch/version from the list page and per-item versions, and the API accepts it unchanged', async () => {
  const items = [
    { id: 'f1', sourceVersion: 1, sourceRowVersion: 9, review: null },
    { id: 'f2', sourceVersion: 2, sourceRowVersion: 9, review: { reviewId: 'rv', version: 4 } },
  ]
  const body = workflow.buildFindingBatch({ batchId: 'batch-1', resultVersion: 5434 }, items, 'Reject', 'nhiễu', 'op-1')
  assert.deepEqual(body, { operationId: 'op-1', batchId: 'batch-1', expectedResultVersion: 5434, items: [
    { findingId: 'f1', expectedSourceVersion: 1, expectedReviewVersion: null, decision: 'Reject', reason: 'nhiễu', evidenceMediaIds: [] },
    { findingId: 'f2', expectedSourceVersion: 2, expectedReviewVersion: 4, decision: 'Reject', reason: 'nhiễu', evidenceMediaIds: [] },
  ] })
  const calls = capture(outcome)
  await api.reviewHealthFindings('tok', 'order-1', body)
  assert.deepEqual(calls[0].body, body)
})

test('unapprovableRows flags findings the AI never linked to a plant, even if a later review linked one', () => {
  const rows = [{ id: 'a', originalPlantId: 'p1', plantId: 'p1' }, { id: 'b', originalPlantId: null, plantId: 'p2' }, { id: 'c', originalPlantId: null, plantId: null }]
  assert.deepEqual(workflow.unapprovableRows(rows).map(row => row.id), ['b', 'c'])
})

test('correctionFields sends only fields that differ from the AI original, so earlier corrections are kept', () => {
  const row = { originalClass: 'SUNBURN', originalPlantId: null, originalLat: 10.46, originalLon: 106.49 }
  // AI chưa gắn trụ: chọn trụ → gửi correctedPlantId; loại bệnh/vị trí trùng gốc (khác hoa thường) → không gửi.
  assert.deepEqual(workflow.correctionFields(row, { classCode: 'sunburn', plantId: 'p1', lat: 10.46, lon: 106.49 }), { correctedPlantId: 'p1' })
  // Lần sửa trước đã gắn p1; giờ chỉ đổi loại bệnh — vẫn phải gửi lại p1 vì BE lấy nền là giá trị gốc (null).
  assert.deepEqual(workflow.correctionFields(row, { classCode: 'ANTHRACNOSE', plantId: 'p1', lat: 10.46, lon: 106.49 }), { correctedClassCode: 'ANTHRACNOSE', correctedPlantId: 'p1' })
  // Vị trí mới gửi dạng GeoJSON [lon, lat].
  assert.deepEqual(workflow.correctionFields({ ...row, originalPlantId: 'p1' }, { classCode: 'SUNBURN', plantId: 'p1', lat: 10.47, lon: 106.5 }), { correctedPosition: { type: 'Point', coordinates: [106.5, 10.47] } })
})

test('correctionFields rejects forms that are not a valid Correct', () => {
  const row = { originalClass: 'SUNBURN', originalPlantId: 'p1', originalLat: 10.46, originalLon: 106.49 }
  assert.throws(() => workflow.correctionFields(row, { classCode: 'SUNBURN', plantId: 'p1', lat: 10.46, lon: 106.49 }), /Xác nhận bệnh/)
  assert.throws(() => workflow.correctionFields(row, { classCode: 'SUNBURN', plantId: null, lat: 10.46, lon: 106.49 }), /Chọn trụ/)
  assert.throws(() => workflow.correctionFields(row, { classCode: ' ', plantId: 'p1', lat: 10.46, lon: 106.49 }), /Chọn loại bệnh/)
  assert.throws(() => workflow.correctionFields(row, { classCode: 'SUNBURN', plantId: 'p2', lat: null, lon: 106.49 }), /Vị trí/)
  assert.throws(() => workflow.correctionFields(row, { classCode: 'SUNBURN', plantId: 'p2', lat: 95, lon: 106.49 }), /Vị trí/)
})

test('plantsByDistance sorts nearest first and keeps order when the finding has no position', () => {
  const plants = [{ id: 'far', lat: 10.4620, lon: 106.4940 }, { id: 'near', lat: 10.46176, lon: 106.49402 }]
  const sorted = workflow.plantsByDistance(plants, 10.461746, 106.4940198)
  assert.deepEqual(sorted.map(entry => entry.plant.id), ['near', 'far'])
  assert.ok(sorted[0].distance < 2 && sorted[1].distance > 25)
  assert.deepEqual(workflow.plantsByDistance(plants, null, null).map(entry => [entry.plant.id, entry.distance]), [['far', null], ['near', null]])
})

test('a Correct item built from correctionFields passes the API validation unchanged', async () => {
  const calls = capture(outcome)
  const fields = workflow.correctionFields({ originalClass: 'SUNBURN', originalPlantId: null, originalLat: 10.46, originalLon: 106.49 }, { classCode: 'SUNBURN', plantId: 'p1', lat: 10.46, lon: 106.49 })
  await api.reviewHealthFindings('tok', 'order-1', { operationId: 'op-1', batchId: 'b', expectedResultVersion: 5, items: [{ ...item({ decision: 'Correct' }), ...fields }] })
  assert.deepEqual(calls[0].body.items[0], { findingId: 'f1', expectedSourceVersion: 1, expectedReviewVersion: null, decision: 'Correct', reason: 'lá khô', evidenceMediaIds: [], correctedPlantId: 'p1' })
})

test('version helpers map list items to expected versions (null before first review)', () => {
  const unreviewed = { id: 'f1', sourceVersion: 1, sourceRowVersion: 5434, review: null }
  assert.deepEqual(workflow.findingVersions(unreviewed), { findingId: 'f1', expectedSourceVersion: 1, expectedReviewVersion: null })
  assert.deepEqual(workflow.findingVersions({ ...unreviewed, review: { version: 2 } }).expectedReviewVersion, 2)
  assert.deepEqual(workflow.boundaryVersions({ id: 'e', sourceVersion: null, sourceRowVersion: 9, review: null }), { expectedExceptionVersion: 9, expectedReviewVersion: null })
  assert.throws(() => workflow.findingVersions({ ...unreviewed, sourceVersion: null }), /sourceVersion/)
})
