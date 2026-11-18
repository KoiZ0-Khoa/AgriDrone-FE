// Giai đoạn 3 — phê duyệt & phát hành kết quả Plant Health theo đơn.
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
const fingerprint = 'a'.repeat(64)
const approval = { operationId: 'op-1', resultId: 'r', batchId: 'b', resultVersion: 7, approvedReviewRevision: 9, status: 'APPROVED', conclusion: 'NO_ACCEPTED_SUSPECTED_FINDINGS', acceptedFindingCount: 0, approvalFingerprint: fingerprint, currentStatus: 'APPROVED' }

test('getHealthApproval reads the approval route and maps 404 (not approved yet) to null', async () => {
  let calls = capture(approval)
  assert.equal((await api.getHealthApproval('tok', 'order-1')).approvalFingerprint, fingerprint)
  assert.equal(calls[0].url, `${base}/health-results/approval`)
  calls = capture({ errorCode: 'PlantHealthReview.NotFound' }, 404)
  assert.equal(await api.getHealthApproval('tok', 'order-1'), null)
  capture({ errorCode: 'PlantHealthReview.VersionConflict' }, 409)
  await assert.rejects(api.getHealthApproval('tok', 'order-1'), ApiError)
})

test('approveHealthResult posts exactly the DTO fields with a trimmed reason and checks the echoed ids', async () => {
  const calls = capture(approval)
  await api.approveHealthResult('tok', 'order-1', { operationId: 'OP-1', batchId: 'B', expectedResultVersion: 7, expectedReviewRevision: 9, reason: '  đã review đủ  ' })
  assert.equal(calls[0].url, `${base}/health-results/approve`)
  assert.equal(calls[0].method, 'POST')
  assert.deepEqual(calls[0].body, { operationId: 'OP-1', batchId: 'B', expectedResultVersion: 7, expectedReviewRevision: 9, reason: 'đã review đủ' })
  await assert.rejects(api.approveHealthResult('tok', 'order-1', { operationId: 'other', batchId: 'b', expectedResultVersion: 7, expectedReviewRevision: 9, reason: 'x' }), /không khớp/)
})

test('approveHealthResult blocks empty reasons and invalid revisions before calling BE', async () => {
  const calls = capture(approval)
  await assert.rejects(api.approveHealthResult('tok', 'order-1', { operationId: 'op-1', batchId: 'b', expectedResultVersion: 7, expectedReviewRevision: 9, reason: '   ' }), /lý do/)
  await assert.rejects(api.approveHealthResult('tok', 'order-1', { operationId: 'op-1', batchId: 'b', expectedResultVersion: 7, expectedReviewRevision: -1, reason: 'ok' }), /Lượt review/)
  assert.equal(calls.length, 0)
})

test('publishHealthResult posts the exact approval fingerprint and rejects a malformed one locally', async () => {
  const calls = capture({ operationId: 'op-2', batchId: 'b', orderStatus: 'AWAITING_PRICING', publicationVersion: 1 })
  const result = await api.publishHealthResult('tok', 'order-1', { operationId: 'op-2', batchId: 'b', expectedResultVersion: 7, expectedReviewRevision: 9, approvalFingerprint: fingerprint })
  assert.equal(calls[0].url, `${base}/health-results/publish`)
  assert.deepEqual(calls[0].body, { operationId: 'op-2', batchId: 'b', expectedResultVersion: 7, expectedReviewRevision: 9, approvalFingerprint: fingerprint })
  assert.equal(result.orderStatus, 'AWAITING_PRICING')
  await assert.rejects(api.publishHealthResult('tok', 'order-1', { operationId: 'op-3', batchId: 'b', expectedResultVersion: 7, expectedReviewRevision: 9, approvalFingerprint: 'short' }), /mã xác thực/)
  assert.equal(calls.length, 1)
})

test('getHealthPublication reads the publication route', async () => {
  const calls = capture({ publication: { publicationVersion: 2, findings: [], diseaseZones: [] }, fingerprint })
  assert.equal((await api.getHealthPublication('tok', 'order-1')).publication.publicationVersion, 2)
  assert.equal(calls[0].url, `${base}/health-results/publication`)
})

test('releaseStage follows summary readiness, approval status and order status', () => {
  const ready = { readyForApproval: true }, notReady = { readyForApproval: false }
  assert.equal(workflow.releaseStage('PENDING_REVIEW', notReady, null), 'blocked')
  assert.equal(workflow.releaseStage('PENDING_REVIEW', ready, null), 'ready')
  assert.equal(workflow.releaseStage('IN_PROGRESS', ready, null), 'blocked')
  // Sau phê duyệt, BE trả readyForApproval = false — vẫn phải là "approved".
  assert.equal(workflow.releaseStage('PENDING_REVIEW', notReady, { currentStatus: 'APPROVED' }), 'approved')
  assert.equal(workflow.releaseStage('PENDING_REVIEW', notReady, { currentStatus: 'PUBLISHED' }), 'published')
  assert.equal(workflow.releaseStage('AWAITING_PRICING', notReady, { currentStatus: 'APPROVED' }), 'published')
})

test('reviewEditable locks review once approved or when the order left PENDING_REVIEW', () => {
  assert.equal(workflow.reviewEditable('PENDING_REVIEW', null), true)
  assert.equal(workflow.reviewEditable('PENDING_REVIEW', approval), false)
  assert.equal(workflow.reviewEditable('COMPLETED', null), false)
})

test('release helpers: conclusion, next step and stale errors', () => {
  assert.equal(workflow.expectedConclusion(0), 'NO_ACCEPTED_SUSPECTED_FINDINGS')
  assert.equal(workflow.expectedConclusion(3), 'HAS_REVIEWED_SUSPECTED_FINDINGS')
  assert.match(workflow.nextStepAfterPublish('AWAITING_PRICING'), /chốt số trụ và giá/)
  assert.match(workflow.nextStepAfterPublish('COMPLETED'), /hoàn tất/)
  assert.equal(workflow.nextStepAfterPublish('PENDING_REVIEW'), null)
  const error = code => new ApiError(409, 'x', code)
  for (const code of ['PlantHealthReview.ApprovalBlocked', 'PlantHealthReview.ApprovalSnapshotChanged', 'PlantHealthReview.ResultLocked', 'PlantHealthReview.VersionConflict'])
    assert.equal(workflow.isStaleReleaseError(error(code)), true, code)
  assert.equal(workflow.isStaleReleaseError(error('PlantHealthReview.ProvenanceIncomplete')), false)
  assert.match(workflow.healthReviewError(error('PlantHealthReview.ProvenanceIncomplete')), /nguồn gốc/)
})
