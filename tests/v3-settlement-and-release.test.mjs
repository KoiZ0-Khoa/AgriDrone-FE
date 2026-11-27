import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { afterEach, test } from 'node:test'
import ts from 'typescript'

const compile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
const dataUrl = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
const clientUrl = dataUrl(compile('../src/api/client.ts').replace('import.meta.env.VITE_API_BASE_URL', "'http://test.local'"))
const loadApi = path => import(dataUrl(compile(path).replace("'../../api/client'", JSON.stringify(clientUrl))))
const manager = await loadApi('../src/features/surveys/v3Api.ts')
const results = await loadApi('../src/features/surveys/ownerSurveyResultApi.ts')
const claims = await loadApi('../src/features/surveys/qualityRefundApi.ts')
const health = await loadApi('../src/features/missions/plantHealthProcessingApi.ts')
const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })

test('Manager finalizes the frozen invoice with both concurrency fingerprints', async () => {
  const body = {
    operationId: 'attempt', expectedOrderVersion: 5, expectedApprovedResultRevisionId: 'result',
    expectedApprovedResultFingerprint: 'a'.repeat(64), expectedCountSnapshotId: 'count',
    expectedCountFingerprint: 'b'.repeat(64), finalizationReason: 'Đã kiểm tra số trụ',
    zeroPoleReasonCode: null, zeroPoleEvidenceReference: null,
  }
  const invoice = '/api/v3/system-manager/survey-orders/order/invoice'
  globalThis.fetch = async (url, options) => {
    assert.equal(new URL(url).pathname, invoice)
    assert.equal(options.headers.Authorization, 'Bearer manager')
    return Response.json({ errorCode: 'Invoice.NotFinalized' }, { status: 409 })
  }
  await assert.rejects(manager.getManagerInvoice('manager', 'order'), error => error.code === 'Invoice.NotFinalized')
  globalThis.fetch = async (url, options) => {
    assert.equal(new URL(url).pathname, invoice + '/finalize')
    assert.equal(options.method, 'POST')
    assert.deepEqual(JSON.parse(options.body), body)
    return Response.json({ orderStatus: 'AwaitingSettlement' })
  }
  assert.equal((await manager.finalizeManagerInvoice('manager', 'order', body)).orderStatus, 'AwaitingSettlement')
})

test('COMBO analysis hands off the exact detection job and revision', async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(new URL(url).pathname, '/api/v3/farms/farm/missions/mission/combo-analysis/handoffs')
    assert.equal(options.headers['Idempotency-Key'], 'operation')
    assert.deepEqual(JSON.parse(options.body), { jobId: 'detection', sourceRevision: 2 })
    return Response.json({ missionId: 'mission', messageId: 'operation', handoffId: 'handoff', status: 'QUEUED' })
  }
  await health.publishMissionComboAnalysis('manager', 'farm', 'mission', 'operation', { jobId: 'detection', sourceRevision: 2 })
})

test('Owner reads only the selected published order and matches the compared farm', async () => {
  globalThis.fetch = async () => new Response(null, { status: 404 })
  assert.equal(await results.getPublishedSurveyResult('owner', 'order'), null)
  globalThis.fetch = async (url, options) => {
    assert.equal(new URL(url).pathname, '/api/v3/tenant-owner/survey-orders/order/published-result')
    assert.equal(options.headers.Authorization, 'Bearer owner')
    assert.equal(options.cache, 'no-store')
    return Response.json({ summary: { orderId: 'another' } })
  }
  await assert.rejects(results.getPublishedSurveyResult('owner', 'order'), /không khớp/)
  globalThis.fetch = async url => {
    const target = new URL(url)
    assert.equal(target.pathname, '/api/v3/tenant-owner/farms/farm/survey-results/compare')
    assert.equal(target.searchParams.get('fromOrderId'), 'previous')
    assert.equal(target.searchParams.get('toOrderId'), 'current')
    return Response.json({ from: { orderId: 'previous', farmId: 'farm' }, to: { orderId: 'current', farmId: 'another' } })
  }
  await assert.rejects(results.comparePublishedSurveys('owner', 'farm', 'previous', 'current'), /không khớp/)
})

test('V3 claim sends the publication ID with the released pole code', async () => {
  const body = {
    publicationId: 'publication',
    issues: [{ poleCode: 'P-01', issueType: 'WRONG_POLE', details: 'Sai vị trí' }],
    description: 'Đã đối chiếu', recipientBankName: 'Bank', recipientAccountNumber: '0001', recipientAccountName: 'Owner',
  }
  globalThis.fetch = async (url, options) => {
    assert.equal(new URL(url).pathname, '/api/tenant-owner/survey-orders/order/quality-refunds')
    assert.deepEqual(JSON.parse(options.body), body)
    return Response.json({ status: 'SUBMITTED' })
  }
  assert.equal((await claims.reportRefund('owner', 'order', body)).status, 'SUBMITTED')
})
