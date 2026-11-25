import { readFileSync } from 'node:fs'
import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'

const compile = file => ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023 },
}).outputText
const urlFor = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
const client = urlFor(compile('../src/api/client.ts').replace('import.meta.env.VITE_API_BASE_URL', "'http://test.local'"))
const api = await import(urlFor(compile('../src/features/surveys/qualityRefundApi.ts').replace("'../../api/client'", JSON.stringify(client))))
const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })

function expectRequests(requests) {
  globalThis.fetch = async (url, options) => {
    const request = requests.shift()
    assert.ok(request, `Unexpected request ${url}`)
    const target = new URL(url)
    assert.equal(target.pathname + target.search, request.path)
    assert.equal(options.headers.Authorization, `Bearer ${request.role}`)
    assert.equal(options.method ?? 'GET', request.method ?? 'GET')
    if (request.body) assert.deepEqual(JSON.parse(options.body), request.body)
    request.check?.(options)
    return Response.json(request.response)
  }
  return () => assert.deepEqual(requests, [])
}

test('Owner uses the order claim window, farm plant codes and a single multi-plant report', async () => {
  const order = '/api/tenant-owner/survey-orders/order/quality-refunds'
  const plants = [{ id: 'plant-a', plantCode: 'P-001', lat: null, lon: null }, { id: 'plant-b', plantCode: 'P-002', lat: 10, lon: 106 }]
  const controller = new AbortController()
  const body = {
    issues: [
      { poleCode: 'P-001', issueType: 'FALSE_POSITIVE', details: 'Trụ khỏe.' },
      { poleCode: 'P-002', issueType: 'WRONG_POLE', details: 'Sai mã trụ.' },
    ],
    description: 'Đã đối chiếu hai trụ.',
    recipientBankName: 'Bank', recipientAccountNumber: '001234', recipientAccountName: 'Owner',
  }
  const check = expectRequests([
    { role: 'owner', path: order + '/claim-window', response: { canReport: true }, check: options => { assert.equal(options.signal, controller.signal); assert.equal(options.cache, 'no-store') } },
    { role: 'owner', path: '/api/farms/farm/plants', response: plants },
    { role: 'owner', path: order, method: 'POST', body, response: { id: 'case', status: 'SUBMITTED', version: 1 } },
    { role: 'owner', path: order, response: [{ id: 'case' }] },
  ])
  assert.equal((await api.getRefundClaimWindow('owner', 'order', controller.signal)).canReport, true)
  const farmPlants = await api.getRefundFarmPlants('owner', 'farm')
  const issues = body.issues.map((issue, index) => ({ ...issue, poleCode: farmPlants[index].plantCode }))
  assert.equal((await api.reportRefund('owner', 'order', { ...body, issues })).version, 1)
  assert.equal((await api.getOwnerRefunds('owner', 'order'))[0].id, 'case')
  check()
})

test('Manager and Admin submit role-specific findings and decisions with the current case version', async () => {
  const manager = '/api/system-manager/survey-orders/order/quality-refunds'
  const admin = '/api/system-admin/survey-orders'
  const verification = { findings: [{ poleCode: 'P-001', confirmedError: true, reason: 'Sai.' }, { poleCode: 'P-002', confirmedError: false, reason: 'Đúng.' }], reason: 'Đã kiểm tra.', expectedVersion: 1 }
  const decision = { approve: true, reason: 'Có trụ bị gán sai.', expectedVersion: 2 }
  const check = expectRequests([
    { role: 'manager', path: manager, response: [{ id: 'case', version: 1 }] },
    { role: 'manager', path: manager + '/case/verify', method: 'POST', body: verification, response: { version: 2 } },
    { role: 'admin', path: admin + '/quality-refunds?pageNumber=2&pageSize=20', response: { items: [], totalCount: 22 } },
    { role: 'admin', path: admin + '/order/quality-refunds', response: { cases: [{ id: 'case', version: 2 }] } },
    { role: 'admin', path: admin + '/order/quality-refunds/case/decision', method: 'POST', body: decision, response: { approvedAmount: 5000, version: 3 } },
  ])
  const [item] = await api.getManagerRefunds('manager', 'order')
  assert.equal((await api.verifyRefund('manager', 'order', item.id, { ...verification, expectedVersion: item.version })).version, 2)
  assert.equal((await api.getAdminRefundQueue('admin', 2)).totalCount, 22)
  const order = await api.getAdminRefunds('admin', 'order')
  assert.equal((await api.decideRefund('admin', 'order', item.id, { ...decision, expectedVersion: order.cases[0].version })).approvedAmount, 5000)
  check()
})

test('Admin uploads receipt before recording the transfer and Owner reads a short-lived receipt URL', async () => {
  const admin = '/api/system-admin/survey-orders/order/quality-refunds/case'
  const evidence = 'minio://bucket/refund-evidence/tenant/case/receipt.png'
  const transfer = { bankTransferReference: 'BANK-1', transferEvidenceReference: evidence, expectedVersion: 3 }
  const check = expectRequests([
    { role: 'admin', path: admin + '/transfer-evidence', method: 'POST', response: { transferEvidenceReference: evidence }, check: options => {
      assert.ok(options.body instanceof FormData)
      assert.equal(options.body.get('file').name, 'receipt.png')
      assert.equal(options.headers['Content-Type'], undefined)
    } },
    { role: 'admin', path: admin + '/record-transfer', method: 'POST', body: transfer, response: { status: 'REFUNDED', version: 4 } },
    { role: 'owner', path: '/api/tenant-owner/survey-orders/order/quality-refunds/case/transfer-evidence', response: { url: 'https://media.test/receipt.png?signature=123' }, check: options => assert.equal(options.cache, 'no-store') },
    { role: 'admin', path: admin + '/transfer-evidence', response: { url: evidence } },
  ])
  const file = new File(['test receipt'], 'receipt.png', { type: 'image/png' })
  const transferEvidenceReference = await api.uploadRefundEvidence('admin', 'order', 'case', file)
  assert.equal((await api.recordRefundTransfer('admin', 'order', 'case', { ...transfer, transferEvidenceReference })).status, 'REFUNDED')
  assert.equal(await api.getRefundEvidence('owner', 'owner', 'order', 'case'), 'https://media.test/receipt.png?signature=123')
  await assert.rejects(api.getRefundEvidence('admin', 'admin', 'order', 'case'), /biên lai không hợp lệ/)
  check()
})
