import { readFileSync } from 'node:fs'
import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'

// G7 — duyệt kết quả V3: quy tắc duyệt COMBO, chốt kết quả nội bộ và route API.
const compile = file => ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023 } }).outputText
const urlFor = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
const clientUrl = urlFor(compile('../src/api/client.ts').replace('import.meta.env.VITE_API_BASE_URL', "'http://test.local'"))
const v3WorkflowUrl = urlFor(compile('../src/features/surveys/v3Workflow.ts'))
const flow = await import(urlFor(compile('../src/features/surveys/resultReviewWorkflow.ts')))
const v3Api = await import(urlFor(compile('../src/features/surveys/v3Api.ts').replace("'../../api/client'", JSON.stringify(clientUrl))))
const surveyWorkflow = await import(urlFor(compile('../src/features/surveys/workflow.ts').replace("'../../api/client'", JSON.stringify(clientUrl)).replace("'./v3Workflow'", JSON.stringify(v3WorkflowUrl))))
const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })

const fp = char => char.repeat(64)
const tokens = { orderId: 'o', expectedOrderVersion: 40, expectedAttemptId: 'att', expectedCountSnapshotId: 'snap', expectedCountFingerprint: fp('a'), expectedComboBatchId: null, expectedComboSourceRevision: null, expectedComboBatchFingerprint: null, expectedComboReviewRevisionId: null, expectedComboReviewFingerprint: null }
export const mapReview = { orderId: 'o', tenantId: 't', farmId: 'f', orderVersion: 40, orderStatus: 'PROCESSING', serviceCode: 'MAP', screensDisease: false, mappingKind: 'FirstBaseline', captureAttemptId: 'att', captureAttemptVersion: 9, captureAttemptStatus: 'PROCESSING', missionId: 'm', farmBaseMapVersionId: 'map', baselineMapVersionId: 'base', farmBoundaryVersionId: 'b', mappingCandidateBatchId: 'mb', verifiedPoleCountSnapshotId: 'snap', verifiedBillablePoleCount: 1234, countSnapshotFingerprint: fp('a'), countSnapshotRevision: 1, currentApprovedResultRevisionId: null, currentApprovedResultFingerprint: null, comboPendingBatch: null, currentComboReview: null, expectedFreezeTokens: tokens }
const finding = (id, extra = {}) => ({ findingId: id, findingVersion: 1, plantProfileId: null, mappingCandidateId: null, longitude: 106.1, latitude: 10.4, observedAt: '2026-11-20T01:00:00Z', suspectedClassCode: 'ANTHRACNOSE', classificationNature: 'SUSPECTED', confidence: 0.82, uncertainty: 'MEDIUM', limitations: [], evidenceMediaIds: [`img-${id}`], ...extra })
const batch = {
  batchId: 'batch', jobId: 'job', sourceRevision: 2, canonicalFingerprint: fp('b'), producedAt: '2026-11-20T02:00:00Z', importedAt: '2026-11-20T02:01:00Z',
  blockingCount: 1, blockingReasons: ['BoundaryException:edge-1:OUTSIDE_BOUNDARY'], status: 'Pending', resultNature: 'PRELIMINARY', limitationNotice: 'Không thay thế chẩn đoán',
  findings: [finding('f1'), finding('f2')], boundaryExceptions: [{ sourceReferenceId: 'edge-1', longitude: 1, latitude: 1, boundaryClassification: 'OUTSIDE', measuredBoundaryDistanceM: 3, boundaryThresholdM: 1, evidenceMediaIds: ['img-edge'] }],
  diseaseZones: [{ sourceProposalId: 'zone-1', geometry: { type: 'Polygon', coordinates: [] }, suspectedClassCode: 'ANTHRACNOSE', membershipVersion: 1, memberships: [{ findingId: 'f1', plantProfileId: null, mappingCandidateId: null, confidence: 0.8 }], guidanceCandidates: [{ guidanceId: 'g1', versionNumber: 3, code: 'SPRAY-A', sourceReference: 'ref' }, { guidanceId: 'g2', versionNumber: 1, code: 'PRUNE', sourceReference: 'ref' }], evidenceMediaIds: ['img-zone'] }],
}
export const comboReview = { ...mapReview, serviceCode: 'COMBO', screensDisease: true, comboPendingBatch: batch }
const ready = draft => ({ ...draft, reviewReason: 'Đã đối chiếu ảnh', zones: { 'zone-1': { ...draft.zones['zone-1'], guidanceId: 'g1' } }, blockers: { 'BoundaryException:edge-1:OUTSIDE_BOUNDARY': { resolution: 'AcceptedWithJustification', reason: 'Cây sát ranh giới' } } })

test('blocking reasons parse back into the BE key, even when the source ID contains colons', () => {
  assert.deepEqual(flow.parseBlockingReason('BoundaryException:edge-1:OUTSIDE_BOUNDARY'), { key: 'BoundaryException:edge-1:OUTSIDE_BOUNDARY', sourceType: 'BoundaryException', sourceId: 'edge-1', reasonCode: 'OUTSIDE_BOUNDARY' })
  assert.equal(flow.parseBlockingReason('Zone:a:b:LOW_COVERAGE').sourceId, 'a:b')
  for (const invalid of ['', 'only', 'two:parts', ':id:code', 'type::code']) assert.equal(flow.parseBlockingReason(invalid), null, invalid)
})

test('grouped exclusion updates the finding and its blockers while retaining separate keys and evidence for BE', () => {
  const review = { ...comboReview, comboPendingBatch: { ...batch, diseaseZones: [], blockingReasons: [
    'BOUNDARY_EXCEPTION:f1:OUT_OF_BOUNDARY', 'FINDING_UNCERTAINTY:f1:REQUIRES_REVIEW', 'FINDING_UNCERTAINTY:f2:REQUIRES_REVIEW',
  ] } }
  const original = { ...flow.initialComboReviewDraft(review), reviewReason: 'Đã đối chiếu ảnh' }
  const groups = flow.comboBlockerGroups(review.comboPendingBatch, flow.blockerItems(review.comboPendingBatch))
  assert.equal(groups.length, 2)
  assert.equal(groups[0].items.length, 2)
  assert.equal(flow.excludeComboGroups(original, groups, ' '), original)
  const partial = flow.excludeComboGroups(original, [groups[0]], ' Nằm ngoài vườn ')
  assert.deepEqual(partial.findings.f1, { decision: 'Exclude', reason: 'Nằm ngoài vườn' })
  assert.equal(partial.findings.f2, original.findings.f2)
  assert.equal(flow.canExcludeComboGroup(partial, groups[0]), false)
  const draft = flow.excludeComboGroups(partial, [groups[1]], 'Nhận diện nhầm')
  draft.confirmNoDiseaseObserved = true
  draft.negativeEvidence = 'Đã rà soát ảnh'
  const body = flow.comboReviewBody(review, draft)
  assert.deepEqual(body.blockerResolutions.map(item => [item.sourceType, item.sourceId, item.resolution, item.reason, item.evidenceMediaIds]), [
    ['BOUNDARY_EXCEPTION', 'f1', 'Excluded', 'Nằm ngoài vườn', ['img-f1']],
    ['FINDING_UNCERTAINTY', 'f1', 'Excluded', 'Nằm ngoài vườn', ['img-f1']],
    ['FINDING_UNCERTAINTY', 'f2', 'Excluded', 'Nhận diện nhầm', ['img-f2']],
  ])
})

test('COMBO shows detections on trụ only for exact mapping candidate links without spatial exceptions', () => {
  const plant = { plantId: 'c1', plantCode: 'P-1', row: 1, col: 1, lat: 10.4001, lon: 106.1001, lifecycleStatus: 'CANDIDATE' }
  const activePlant = { ...plant, plantId: 'p2', mappingCandidateId: 'c2', row: 2, lifecycleStatus: 'ACTIVE' }
  const historicalPlant = { ...plant, plantId: 'c3', row: 3, lifecycleStatus: 'HISTORICAL' }
  const links = flow.comboReviewPlantLinks({
    ...batch,
    findings: [finding('linked', { mappingCandidateId: 'C1' }), finding('second', { mappingCandidateId: 'c1' }),
      finding('linked-active', { mappingCandidateId: 'C2' }), finding('linked-historical', { mappingCandidateId: 'c3' }),
      finding('profile-only', { plantProfileId: 'c1' }), finding('wrong-id-type', { mappingCandidateId: 'p2' }),
      finding('removed', { mappingCandidateId: 'c4' }), finding('ambiguous', { mappingCandidateId: 'c5' }),
      finding('near', { mappingCandidateId: 'c2' }), finding('outside', { mappingCandidateId: 'c2' })],
    boundaryExceptions: [{ ...batch.boundaryExceptions[0], sourceReferenceId: 'outside' }],
    blockingReasons: ['FINDING_SPATIAL:near:NEEDS_REVIEW'],
  }, [plant, activePlant, historicalPlant,
    { ...activePlant, plantId: 'p4', mappingCandidateId: 'c4', lifecycleStatus: 'REMOVED' },
    { ...activePlant, plantId: 'p5', mappingCandidateId: 'c5' },
    { ...activePlant, plantId: 'p6', mappingCandidateId: 'c5' }])
  assert.deepEqual([...links.plantByFinding.keys()], ['linked', 'second', 'linked-active', 'linked-historical'])
  assert.equal(links.plantByFinding.get('linked-active'), activePlant)
  assert.deepEqual(links.findingsByPlant.get('c1').map(item => item.findingId), ['linked', 'second'])
  assert.deepEqual(links.gpsFindings.map(item => item.findingId), ['profile-only', 'wrong-id-type', 'removed', 'ambiguous', 'near'])
})

test('the default COMBO draft accepts every finding, approves zones and leaves blockers unresolved', () => {
  const draft = flow.initialComboReviewDraft(comboReview)
  assert.deepEqual(Object.values(draft.findings).map(item => item.decision), ['Accept', 'Accept'])
  assert.equal(draft.zones['zone-1'].decision, 'Approve')
  assert.equal(draft.zones['zone-1'].guidanceId, null) // hai hướng dẫn: người duyệt phải chọn
  assert.equal(draft.blockers['BoundaryException:edge-1:OUTSIDE_BOUNDARY'].resolution, 'Unresolved')
  const problems = flow.comboReviewProblems(comboReview, draft)
  assert.ok(problems.some(item => /hướng dẫn/.test(item)))
  assert.ok(problems.some(item => /mục chặn chưa xử lý/.test(item)))
  assert.ok(problems.some(item => /lý do duyệt/.test(item)))
  // Lần duyệt trước được nạp lại làm bản nháp.
  const previous = { ...comboReview, currentComboReview: { reviewRevisionId: 'r1', revisionNumber: 1, outcome: 'Rejected', findingDecisions: [{ findingId: 'f2', decision: 'Exclude', reason: 'Bóng lá', evidenceMediaIds: ['img-f2'] }], zoneDecisions: [{ sourceProposalId: 'zone-1', decision: 'Approve', selectedGuidanceId: 'g2' }], blockerResolutions: [{ sourceType: 'BoundaryException', sourceId: 'edge-1', reasonCode: 'OUTSIDE_BOUNDARY', resolution: 'Excluded', reason: 'Ngoài vườn' }], confirmNoDiseaseObserved: false, negativeResultConfirmationEvidence: null } }
  const reloaded = flow.initialComboReviewDraft(previous)
  assert.equal(reloaded.findings.f2.decision, 'Exclude')
  assert.equal(reloaded.findings.f2.reason, 'Bóng lá')
  assert.equal(reloaded.zones['zone-1'].guidanceId, 'g2')
  assert.equal(reloaded.blockers['BoundaryException:edge-1:OUTSIDE_BOUNDARY'].resolution, 'Excluded')
})

test('COMBO review body carries every decision, the exact batch tokens and the evidence BE requires', () => {
  const draft = ready(flow.initialComboReviewDraft(comboReview))
  draft.findings.f2 = { decision: 'Exclude', reason: ' Bóng lá ' }
  assert.deepEqual(flow.comboReviewProblems(comboReview, draft), [])
  const body = flow.comboReviewBody(comboReview, draft)
  assert.equal(body.expectedOrderVersion, 40)
  assert.equal(body.expectedBatchId, 'batch')
  assert.equal(body.expectedSourceRevision, 2)
  assert.equal(body.expectedBatchFingerprint, fp('b'))
  assert.equal(body.expectedPreviousReviewId, null)
  assert.equal(body.outcome, 'Approved')
  assert.deepEqual(body.findingDecisions, [
    { findingId: 'f1', decision: 'Accept', reason: null, evidenceMediaIds: [] },
    { findingId: 'f2', decision: 'Exclude', reason: 'Bóng lá', evidenceMediaIds: ['img-f2'] },
  ])
  assert.deepEqual(body.zoneDecisions, [{ sourceProposalId: 'zone-1', decision: 'Approve', reviewedGeometry: null, reviewedFindingIds: null, selectedGuidanceId: 'g1', selectedGuidanceVersionNumber: 3, reason: null, evidenceMediaIds: [] }])
  assert.deepEqual(body.blockerResolutions, [{ sourceType: 'BoundaryException', sourceId: 'edge-1', reasonCode: 'OUTSIDE_BOUNDARY', resolution: 'AcceptedWithJustification', reason: 'Cây sát ranh giới', evidenceMediaIds: ['img-edge'] }])
  assert.equal(body.confirmNoDiseaseObserved, false)
  assert.equal(body.negativeResultConfirmationEvidence, null)
})

test('COMBO review refuses missing reasons, zones with excluded members and an unconfirmed negative result', () => {
  const base = ready(flow.initialComboReviewDraft(comboReview))
  assert.throws(() => flow.comboReviewBody(comboReview, { ...base, findings: { ...base.findings, f2: { decision: 'Exclude', reason: ' ' } } }), /lý do loại/)
  assert.throws(() => flow.comboReviewBody(comboReview, { ...base, zones: { 'zone-1': { decision: 'Reject', guidanceId: null, reason: '' } } }), /từ chối vùng/)
  assert.throws(() => flow.comboReviewBody(comboReview, { ...base, findings: { ...base.findings, f1: { decision: 'Exclude', reason: 'sai' } } }), /đã bị loại/)
  assert.throws(() => flow.comboReviewBody(comboReview, { ...base, blockers: { 'BoundaryException:edge-1:OUTSIDE_BOUNDARY': { resolution: 'Resolved', reason: '' } } }), /giải trình/)
  // Loại hết phát hiện + từ chối vùng: phải xác nhận không ghi nhận nghi bệnh và có bằng chứng.
  const none = { ...base, findings: { f1: { decision: 'Exclude', reason: 'sai' }, f2: { decision: 'Exclude', reason: 'sai' } }, zones: { 'zone-1': { decision: 'Reject', guidanceId: null, reason: 'Không có bệnh' } } }
  assert.throws(() => flow.comboReviewBody(comboReview, none), /Không ghi nhận nghi bệnh/)
  assert.throws(() => flow.comboReviewBody(comboReview, { ...none, confirmNoDiseaseObserved: true }), /bằng chứng/)
  const negative = flow.comboReviewBody(comboReview, { ...none, confirmNoDiseaseObserved: true, negativeEvidence: ' Kiểm tra thực địa ' })
  assert.equal(negative.confirmNoDiseaseObserved, true)
  assert.equal(negative.negativeResultConfirmationEvidence, 'Kiểm tra thực địa')
  assert.deepEqual(negative.zoneDecisions[0].evidenceMediaIds, ['img-zone'])
  // Từ chối kết quả: được gửi khi còn mục chặn, không kèm xác nhận âm tính.
  const rejected = flow.comboReviewBody(comboReview, { ...base, outcome: 'Rejected', blockers: { 'BoundaryException:edge-1:OUTSIDE_BOUNDARY': { resolution: 'Unresolved', reason: '' } } })
  assert.equal(rejected.outcome, 'Rejected')
  assert.deepEqual(rejected.blockerResolutions[0].evidenceMediaIds, [])
})

test('MAP freeze sends only count tokens; COMBO freeze needs an approved review with no open blockers', () => {
  assert.equal(flow.freezeBlocker(mapReview), null)
  assert.equal(flow.defaultFreezeDecision(mapReview), 'Approved')
  assert.deepEqual(flow.freezeResultBody(mapReview, { reviewDecision: 'Approved', freezeReason: ' Đủ số trụ ' }), { expectedOrderVersion: 40, expectedAttemptId: 'att', expectedCountSnapshotId: 'snap', expectedCountFingerprint: fp('a'), reviewDecision: 'Approved', freezeReason: 'Đủ số trụ', expectedComboBatchId: null, expectedComboSourceRevision: null, expectedComboBatchFingerprint: null, expectedComboReviewRevisionId: null, expectedComboReviewFingerprint: null })
  assert.throws(() => flow.freezeResultBody(mapReview, { reviewDecision: 'Approved', freezeReason: '' }), /lý do chốt/)
  for (const changes of [{ currentApprovedResultRevisionId: 'r' }, { orderStatus: 'AWAITING_SETTLEMENT' }, { captureAttemptStatus: 'ACCEPTED' }]) assert.ok(flow.freezeBlocker({ ...mapReview, ...changes }), JSON.stringify(changes))
  assert.match(flow.freezeBlocker(comboReview), /duyệt phát hiện/)
  const summary = { reviewRevisionId: 'r2', outcome: 'Approved', unresolvedBlockersCount: 0, acceptedFindingsCount: 1 }
  const comboTokens = { ...tokens, expectedComboBatchId: 'batch', expectedComboSourceRevision: 2, expectedComboBatchFingerprint: fp('b'), expectedComboReviewRevisionId: 'r2', expectedComboReviewFingerprint: fp('c') }
  const approved = { ...comboReview, currentComboReview: summary, expectedFreezeTokens: comboTokens }
  assert.equal(flow.freezeBlocker(approved), null)
  assert.equal(flow.defaultFreezeDecision(approved), 'ApprovedWithObservations')
  const body = flow.freezeResultBody(approved, { reviewDecision: 'ApprovedWithObservations', freezeReason: 'Đã duyệt' })
  assert.equal(body.expectedComboReviewRevisionId, 'r2')
  assert.equal(body.expectedComboReviewFingerprint, fp('c'))
  assert.match(flow.freezeBlocker({ ...approved, currentComboReview: { ...summary, outcome: 'Rejected' } }), /từ chối/)
  assert.match(flow.freezeBlocker({ ...approved, currentComboReview: { ...summary, unresolvedBlockersCount: 1 } }), /mục chặn/)
})

test('result-review API routes, and a 409 stale-token error is recognised and translated', async () => {
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push([options.method ?? 'GET', new URL(url).pathname])
    assert.equal(options.headers.Authorization, 'Bearer manager')
    return Response.json(options.method ? { isReplay: false } : mapReview, { status: options.method ? 201 : 200 })
  }
  assert.deepEqual(await v3Api.getResultReview('manager', 'o/1'), mapReview)
  await v3Api.recordComboReview('manager', 'o/1', { operationId: 'op' })
  await v3Api.freezeResultReview('manager', 'o/1', { operationId: 'op' })
  assert.deepEqual(calls, [['GET', '/api/v3/system-manager/survey-orders/o%2F1/result-review'], ['POST', '/api/v3/system-manager/survey-orders/o%2F1/result-review/combo-reviews'], ['POST', '/api/v3/system-manager/survey-orders/o%2F1/result-review/freeze']])
  globalThis.fetch = async () => Response.json({ errorCode: 'ComboBatch.NotFound' }, { status: 409 })
  assert.equal(await v3Api.getResultReview('manager', 'o'), null)
  globalThis.fetch = async () => Response.json({ errorCode: 'CountSnapshot.Missing' }, { status: 409 })
  await assert.rejects(v3Api.getResultReview('manager', 'o'), { status: 409, code: 'CountSnapshot.Missing' })
  globalThis.fetch = async () => Response.json({ errorCode: 'CountSnapshot.Stale', detail: 'stale' }, { status: 409 })
  await assert.rejects(v3Api.freezeResultReview('manager', 'o', { operationId: 'op' }), error => flow.isStaleReviewError(error) && /Tải lại dữ liệu duyệt/.test(surveyWorkflow.workflowError(error)))
  assert.equal(flow.isStaleReviewError(new Error('x')), false)
})
