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

const findingItem = (id, sourceId, review = null, blockingReasons = []) => ({ id, sourceVersion: 1, sourceRowVersion: 9, original: { FindingId: sourceId, SuspectedClassCode: 'SUNBURN' }, review, blockingReasons })
const exceptionItem = (sourceId, review = null) => ({ id: 'ex-1', sourceVersion: null, sourceRowVersion: 77, original: { SourceReferenceId: sourceId, BoundaryClassification: 'NEEDS_REVIEW', MeasuredBoundaryDistanceM: 0.8, BoundaryThresholdM: 1.5 }, review, blockingReasons: ['UnresolvedBoundaryException'] })

test('linkedFinding matches a boundary exception to its finding by the original FindingId (case-insensitive)', () => {
  const findings = [findingItem('f-1', 'AAAA-1'), findingItem('f-2', 'bbbb-2')]
  assert.equal(workflow.linkedFinding(exceptionItem('BBBB-2'), findings).id, 'f-2')
  assert.equal(workflow.linkedFinding(exceptionItem('cccc-3'), findings), null)
  assert.equal(workflow.linkedFinding({ ...exceptionItem('x'), original: {} }, findings), null)
})

test('boundaryOptions follows the linked finding review state', () => {
  const review = decision => ({ reviewId: 'rv', version: 1, decision })
  assert.deepEqual(workflow.boundaryOptions(null).allowed, ['NeedsEvidence'])
  assert.deepEqual(workflow.boundaryOptions(findingItem('f', 's')).allowed, ['NeedsEvidence'])
  assert.deepEqual(workflow.boundaryOptions(findingItem('f', 's', review('Ambiguous'))).allowed, ['NeedsEvidence'])
  assert.deepEqual(workflow.boundaryOptions(findingItem('f', 's', review('Reject'))).allowed, ['ExcludeEvidence', 'NeedsEvidence'])
  assert.deepEqual(workflow.boundaryOptions(findingItem('f', 's', review('NonDisease'))).allowed, ['ExcludeEvidence', 'NeedsEvidence'])
  assert.deepEqual(workflow.boundaryOptions(findingItem('f', 's', review('Approve'))).allowed, ['AcceptCorrectedPosition', 'NeedsEvidence'])
  assert.deepEqual(workflow.boundaryOptions(findingItem('f', 's', review('Correct'), ['PlantAssociationChanged'])).allowed, ['NeedsEvidence'])
})

test('buildBoundaryReview links the current finding review except for NeedsEvidence, and passes API validation', async () => {
  const finding = findingItem('f-1', 'src', { reviewId: 'rv-9', version: 2, decision: 'Reject' })
  const exclude = workflow.buildBoundaryReview({ batchId: 'b', resultVersion: 5 }, exceptionItem('src'), finding, 'ExcludeEvidence', 'ngoài vườn', 'op-1')
  assert.deepEqual(exclude, { operationId: 'op-1', batchId: 'b', expectedResultVersion: 5, expectedExceptionVersion: 77, expectedReviewVersion: null, decision: 'ExcludeEvidence', reason: 'ngoài vườn', evidenceMediaIds: [], findingId: 'f-1', findingReviewId: 'rv-9' })
  const needs = workflow.buildBoundaryReview({ batchId: 'b', resultVersion: 5 }, exceptionItem('src', { reviewId: 'x', version: 3 }), null, 'NeedsEvidence', 'chờ', 'op-2')
  assert.equal('findingId' in needs, false); assert.equal(needs.expectedReviewVersion, 3)
  assert.throws(() => workflow.buildBoundaryReview({ batchId: 'b', resultVersion: 5 }, exceptionItem('src'), findingItem('f', 's'), 'ExcludeEvidence', 'x', 'op'), /chưa được review/)
  const calls = capture({ ...outcome, operationId: 'op-1' })
  await api.reviewHealthBoundaryException('tok', 'order-1', 'ex-1', exclude)
  assert.deepEqual(calls[0].body, exclude)
})

test('getAllHealthFindings pages through the batch with pageSize 100 and pins the batchId', async () => {
  const urls = []
  globalThis.fetch = async url => {
    const u = new URL(url.toString()); urls.push(u.search)
    const page = Number(u.searchParams.get('pageNumber'))
    return Response.json({ batchId: 'b', resultVersion: 5, totalCount: 150, isCurrentBatch: true, items: Array.from({ length: page === 1 ? 100 : 50 }, (_, i) => ({ id: `${page}-${i}` })) })
  }
  const all = await api.getAllHealthFindings('tok', 'order-1')
  assert.equal(all.items.length, 150)
  assert.deepEqual(urls, ['?pageNumber=1&pageSize=100', '?pageNumber=2&pageSize=100&batchId=b'])
  globalThis.fetch = async url => Response.json({ batchId: 'b', resultVersion: new URL(url.toString()).searchParams.get('pageNumber') === '1' ? 5 : 6, totalCount: 150, items: [] })
  await assert.rejects(api.getAllHealthFindings('tok', 'order-1'), /thay đổi/)
})

const square = [[106.49, 10.46], [106.4910, 10.46], [106.4910, 10.4610], [106.49, 10.4610], [106.49, 10.46]]
const zoneItem = (overrides = {}) => ({ id: 'z-1', sourceVersion: null, sourceRowVersion: 900, original: { SourceProposalId: 'p1', SuspectedClassCode: 'SUNBURN', Geometry: { Type: 'Polygon', Coordinates: [square] },
  Memberships: [{ PlantId: 'plant-a', MappingCandidateId: null, Confidence: 0.9 }, { PlantId: 'plant-b', MappingCandidateId: null, Confidence: 0.8 }] }, review: null, guidanceReview: null, blockingReasons: ['UnreviewedZone'], ...overrides })
const accepted = (id, plantId, classCode = 'SUNBURN', position = [106.4905, 10.4605], extra = {}) => ({ id, sourceVersion: 1, sourceRowVersion: 9, blockingReasons: [], original: { FindingId: `src-${id}`, PlantId: plantId },
  review: { reviewId: `rv-${id}`, version: 1, decision: 'Approve', snapshot: { PlantId: plantId, ClassCode: classCode, Position: position } }, ...extra })

test('pointInRing and readZoneOriginal read the PascalCase proposal geometry', () => {
  assert.equal(workflow.pointInRing(106.4905, 10.4605, square), true)
  assert.equal(workflow.pointInRing(106.4920, 10.4605, square), false)
  const original = workflow.readZoneOriginal(zoneItem().original)
  assert.equal(original.ring.length, 5); assert.equal(original.memberships.length, 2); assert.equal(original.suspectedClassCode, 'SUNBURN')
  assert.equal(workflow.readZoneOriginal({ Geometry: { Coordinates: [[[1, 2]]] } }).ring, null)
})

test('approveReadiness mirrors BE member auto-resolution', () => {
  const both = [accepted('f-a', 'plant-a'), accepted('f-b', 'plant-b')]
  assert.deepEqual(workflow.approveReadiness(zoneItem(), both), { ready: true, reason: null })
  assert.match(workflow.approveReadiness(zoneItem(), [both[0]]).reason, /1\/2 cây/)
  assert.match(workflow.approveReadiness(zoneItem(), [...both, accepted('f-a2', 'plant-a')]).reason, /nhiều phát hiện/)
  assert.match(workflow.approveReadiness(zoneItem(), [both[0], accepted('f-b', 'plant-b', 'SUNBURN', [106.50, 10.47])]).reason, /ngoài hình vùng/)
  // Phát hiện cùng trụ nhưng khác loại, hoặc còn mục chặn, không được tính.
  assert.equal(workflow.approveReadiness(zoneItem(), [both[0], accepted('f-b', 'plant-b', 'ANTHRACNOSE')]).ready, false)
  assert.equal(workflow.approveReadiness(zoneItem(), [both[0], accepted('f-b', 'plant-b', 'SUNBURN', undefined, { blockingReasons: ['CatalogueChanged'] })]).ready, false)
})

test('zoneMemberCandidates keeps accepted findings of the class with an inside flag', () => {
  const candidates = workflow.zoneMemberCandidates([accepted('f-a', 'plant-a'), accepted('f-x', 'plant-x', 'SUNBURN', [106.50, 10.47]), accepted('f-y', 'plant-y', 'ANTHRACNOSE'),
    { id: 'f-r', sourceVersion: 1, blockingReasons: [], original: {}, review: { reviewId: 'r', version: 1, decision: 'Reject', snapshot: {} } }], 'sunburn', square)
  assert.deepEqual(candidates.map(c => [c.findingId, c.insideZone, c.findingReviewId]), [['f-a', true, 'rv-f-a'], ['f-x', false, 'rv-f-x']])
})

test('buildZoneReview / buildGuidanceReview carry the right versions and pass API validation', async () => {
  const page = { batchId: 'b', resultVersion: 5 }
  const zone = zoneItem({ review: { reviewId: 'zr-1', version: 2, decision: 'Correct', snapshot: {} }, guidanceReview: { reviewId: 'g', version: 4, decision: 'NeedsEvidence', snapshot: {} } })
  const correct = workflow.buildZoneReview(page, zone, 'Correct', 'gộp lại', 'op-1', { classCode: 'ANTHRACNOSE', members: [{ findingId: 'f-a', sourceVersion: 1, findingReviewId: 'rv-f-a', plantId: 'plant-a' }] })
  assert.deepEqual(correct, { operationId: 'op-1', batchId: 'b', expectedResultVersion: 5, expectedZoneVersion: 900, expectedReviewVersion: 2, decision: 'Correct', reason: 'gộp lại', evidenceMediaIds: [],
    correctedClassCode: 'ANTHRACNOSE', members: [{ findingId: 'f-a', sourceVersion: 1, findingReviewId: 'rv-f-a' }] })
  const approve = workflow.buildZoneReview(page, zoneItem(), 'Approve', 'ok', 'op-2', { classCode: 'X', members: [] })
  assert.equal('members' in approve || 'correctedClassCode' in approve, false); assert.equal(approve.expectedReviewVersion, null)
  const guidance = workflow.buildGuidanceReview(page, zone, 'Select', 'theo hướng dẫn', 'op-3', 'gd-1')
  assert.deepEqual(guidance, { operationId: 'op-3', batchId: 'b', expectedResultVersion: 5, expectedZoneVersion: 900, expectedReviewVersion: 4, zoneReviewId: 'zr-1', decision: 'Select', reason: 'theo hướng dẫn', evidenceMediaIds: [], guidanceId: 'gd-1' })
  assert.throws(() => workflow.buildGuidanceReview(page, zoneItem(), 'RejectAll', 'x', 'op'), /Xác nhận hoặc sửa vùng/)
  const calls = capture({ ...outcome, operationId: 'op-1' })
  await api.reviewHealthZone('tok', 'order-1', 'z-1', correct)
  assert.equal(calls[0].url, `${base}/disease-zones/z-1/review`); assert.deepEqual(calls[0].body, correct)
  capture({ ...outcome, operationId: 'op-3' })
  await api.reviewZoneGuidance('tok', 'order-1', 'z-1', guidance)
})

test('zone/guidance API reject invalid combinations before calling BE', async () => {
  const calls = capture(outcome)
  const request = { operationId: 'op-1', batchId: 'b', expectedResultVersion: 5, expectedZoneVersion: 1, expectedReviewVersion: null, reason: 'x', evidenceMediaIds: [] }
  await assert.rejects(api.reviewHealthZone('tok', 'order-1', 'z', { ...request, decision: 'Correct' }), /ít nhất một trường/)
  await assert.rejects(api.reviewHealthZone('tok', 'order-1', 'z', { ...request, decision: 'Approve', correctedClassCode: 'A' }), /Chỉ quyết định Sửa/)
  await assert.rejects(api.reviewHealthZone('tok', 'order-1', 'z', { ...request, decision: 'Correct', members: [] }), /ít nhất 1 phát hiện/)
  await assert.rejects(api.reviewZoneGuidance('tok', 'order-1', 'z', { ...request, zoneReviewId: 'r', decision: 'Select' }), /Chọn một hướng dẫn/)
  await assert.rejects(api.reviewZoneGuidance('tok', 'order-1', 'z', { ...request, zoneReviewId: 'r', decision: 'RejectAll', guidanceId: 'g' }), /Chọn một hướng dẫn/)
  assert.equal(calls.length, 0)
  await api.getZoneGuidanceOptions('tok', 'order-1', 'z-9')
  assert.equal(calls[0].url, 'http://test.local/api/system-manager/survey-orders/order-1/disease-zones/z-9/guidance-options')
})

test('version helpers map list items to expected versions (null before first review)', () => {
  const unreviewed = { id: 'f1', sourceVersion: 1, sourceRowVersion: 5434, review: null }
  assert.deepEqual(workflow.findingVersions(unreviewed), { findingId: 'f1', expectedSourceVersion: 1, expectedReviewVersion: null })
  assert.deepEqual(workflow.findingVersions({ ...unreviewed, review: { version: 2 } }).expectedReviewVersion, 2)
  assert.deepEqual(workflow.boundaryVersions({ id: 'e', sourceVersion: null, sourceRowVersion: 9, review: null }), { expectedExceptionVersion: 9, expectedReviewVersion: null })
  assert.throws(() => workflow.findingVersions({ ...unreviewed, sourceVersion: null }), /sourceVersion/)
})

test('openRows keeps unreviewed and still-blocked findings for "select all"; decisionChanges lists rows whose decision will change', () => {
  const rows = [
    { id: 'a', decision: 'Pending', resolutionState: 'NEEDS_REVIEW' },
    { id: 'b', decision: 'NonDisease', resolutionState: 'RESOLVED' },
    { id: 'c', decision: 'Reject', resolutionState: 'NEEDS_REVIEW' },
    { id: 'd', decision: 'Pending', resolutionState: 'PENDING_REVIEW' },
  ]
  assert.deepEqual(workflow.openRows(rows).map(row => row.id), ['a', 'c', 'd'])
  assert.deepEqual(workflow.decisionChanges(rows, 'NonDisease').map(row => row.id), ['c'])
  assert.deepEqual(workflow.decisionChanges(rows, 'Reject').map(row => row.id), ['b'])
})

test('bulk boundary decisions are allowed only when every selected exception accepts them; openBoundaryItems keeps undecided/blocked ones', () => {
  const finding = (decision, blockingReasons = []) => ({ id: 'f', review: decision ? { reviewId: 'r', decision } : null, blockingReasons, original: {} })
  const nonDisease = finding('NonDisease'), rejected = finding('Reject'), approved = finding('Approve'), pending = finding(null)
  assert.deepEqual(workflow.bulkBoundaryDecision([nonDisease, rejected], 'ExcludeEvidence'), { ok: true, blocked: 0 })
  assert.deepEqual(workflow.bulkBoundaryDecision([nonDisease, approved], 'ExcludeEvidence'), { ok: false, blocked: 1 })
  assert.deepEqual(workflow.bulkBoundaryDecision([approved], 'AcceptCorrectedPosition'), { ok: true, blocked: 0 })
  assert.deepEqual(workflow.bulkBoundaryDecision([pending, null], 'ExcludeEvidence'), { ok: false, blocked: 2 })
  assert.equal(workflow.bulkBoundaryDecision([], 'ExcludeEvidence').ok, false)
  const rows = [
    { item: { id: 'e1', review: null, blockingReasons: ['UnresolvedBoundaryException'] } },
    { item: { id: 'e2', review: { decision: 'ExcludeEvidence' }, blockingReasons: [] } },
    { item: { id: 'e3', review: { decision: 'NeedsEvidence' }, blockingReasons: ['UnresolvedBoundaryException'] } },
  ]
  assert.deepEqual(workflow.openBoundaryItems(rows).map(row => row.item.id), ['e1', 'e3'])
})

test('findingImages reads evidence media by role; findingRow exposes them; healthMissionOf picks the -HEALTH mission', () => {
  const evidence = [{ MediaAssetId: 'src-1', Role: 'source_image' }, { MediaAssetId: 'ann-1', Role: 'annotated_image' }, { MediaAssetId: 'crop-1', Role: 'crop_image' }]
  assert.deepEqual(workflow.findingImages(evidence), { source: 'src-1', annotated: 'ann-1', crop: 'crop-1' })
  assert.deepEqual(workflow.findingImages([{ MediaAssetId: 'src-1', Role: 'source_image' }]), { source: 'src-1', annotated: null, crop: null })
  assert.deepEqual(workflow.findingImages(null), { source: null, annotated: null, crop: null })
  assert.equal(workflow.hasFindingImages({ source: null, annotated: null, crop: null }), false)
  const row = workflow.findingRow({ id: 'f1', sourceVersion: 1, sourceRowVersion: 1, observedAt: '2026-10-27T03:10:00Z', resolutionState: 'NEEDS_REVIEW',
    original: { FindingId: 'f1', EvidenceMedia: evidence }, review: null, blockingReasons: [] }, new Map(), new Map())
  assert.equal(row.images.annotated, 'ann-1')
  assert.equal(workflow.healthMissionOf([{ id: 'm1', missionCode: 'ORD-abc-BASE' }, { id: 'm2', missionCode: 'ORD-abc-HEALTH' }]).id, 'm2')
  assert.equal(workflow.healthMissionOf([{ id: 'm1', missionCode: 'ORD-abc-BASE' }]), null)
})
