import { readFileSync } from 'node:fs'
import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'

const compile = file => ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023 } }).outputText
const urlFor = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
const client = urlFor(compile('../src/api/client.ts').replace('import.meta.env.VITE_API_BASE_URL', "'http://test.local'"))
const api = await import(urlFor(compile('../src/features/surveys/systemOrderApi.ts').replace("'../../api/client'", JSON.stringify(client))))
const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })
const authorization = { id: 'authorization', surveyOrderId: 'order/id', type: 'WRITTEN_DATA_USE_CONSENT', status: 'PENDING', evidenceReference: null, issuedAt: null, verifiedAt: null, expiresAt: null, revokedAt: null, verifiedBy: null, version: 517 }
const mockValues = { mode: 'mock', mockReference: '  DEMO-CONSENT  ', issuedAt: '2026-10-22T09:00:00+07:00', expiresAt: '2099-01-01T00:00:00Z' }

test('Admin Order query supports independent filters, server pagination and cancellation', async () => {
  const controller = new AbortController()
  globalThis.fetch = async (url, options) => {
    const parsed = new URL(url)
    assert.equal(parsed.pathname, '/api/system-admin/survey-orders')
    assert.equal(parsed.searchParams.get('status'), 'AWAITING_BASELINE_DEPOSIT')
    assert.equal(parsed.searchParams.get('tenantId'), 'tenant/id')
    assert.equal(parsed.searchParams.get('farmId'), 'farm/id')
    assert.equal(parsed.searchParams.get('pageNumber'), '3')
    assert.equal(parsed.searchParams.get('pageSize'), '20')
    assert.equal(options.signal, controller.signal)
    assert.equal(options.headers.Authorization, 'Bearer admin')
    return Response.json({ items: [{ surveyOrderId: 'order', orderVersion: 851 }], totalCount: 41 })
  }
  const page = await api.getSystemOrders('admin', 3, { status: 'AWAITING_BASELINE_DEPOSIT', tenantId: 'tenant/id', farmId: 'farm/id' }, controller.signal)
  assert.equal(page.items[0].orderVersion, 851)
  assert.equal(page.totalCount, 41)
  globalThis.fetch = async url => { assert.equal(new URL(url).searchParams.has('status'), false); return Response.json({ items: [] }) }
  await api.getSystemOrders('admin', 1, { status: '' })
})

test('Authorization list, detail and evidence reads use the Admin scope and distinct type routes', async () => {
  const controller = new AbortController()
  for (const type of ['WRITTEN_DATA_USE_CONSENT', 'FLIGHT_PERMISSION']) {
    const route = type === 'FLIGHT_PERMISSION' ? 'flight-permission' : 'consent'
    const calls = [
      [() => api.getCaptureAuthorizations('admin', 'order/id', controller.signal), '', true],
      [() => api.getCaptureAuthorization('admin', 'order/id', type, controller.signal), `/${route}`, true],
      [() => api.getAuthorizationEvidence('admin', 'order/id', type), `/${route}/evidence-url`, false],
    ]
    for (const [run, suffix, hasSignal] of calls) {
      globalThis.fetch = async (url, options) => {
        assert.equal(url, `http://test.local/api/system-admin/survey-orders/order%2Fid/capture-authorizations${suffix}`)
        assert.equal(options.headers.Authorization, 'Bearer admin')
        if (hasSignal) assert.equal(options.signal, controller.signal)
        return Response.json({ ...authorization, type })
      }
      assert.equal((await run()).version, 517)
    }
  }
})

test('Evidence file upload is one multipart PUT with browser boundary and reviewed authorization version', async () => {
  const file = new File(['scanned permit'], 'permit.PDF', { type: 'application/pdf' })
  let calls = 0
  globalThis.fetch = async (url, options) => {
    calls++
    assert.equal(url, 'http://test.local/api/system-admin/survey-orders/order%2Fid/capture-authorizations/flight-permission/verify')
    assert.equal(options.method, 'PUT')
    assert.equal(options.headers.Authorization, 'Bearer admin')
    assert.equal(options.headers['Content-Type'], undefined)
    assert.ok(options.body instanceof FormData)
    assert.equal(options.body.get('File').name, 'permit.PDF')
    assert.equal(await options.body.get('File').text(), 'scanned permit')
    assert.equal(options.body.get('ExpectedVersion'), '517')
    assert.equal(options.body.get('IssuedAt'), '2026-10-22T02:00:00.000Z')
    assert.equal(options.body.has('MockReference'), false)
    return Response.json({ ...authorization, type: 'FLIGHT_PERMISSION', status: 'VERIFIED', version: 519 })
  }
  const result = await api.verifyCaptureAuthorization('admin', 'order/id', 'FLIGHT_PERMISSION', { ...authorization, type: 'FLIGHT_PERMISSION' }, { ...mockValues, mode: 'file', file })
  assert.equal(result.version, 519)
  assert.equal(calls, 1)
})

test('Mock evidence is explicit, trims its reference, and accepts actual version zero without guessing', async () => {
  globalThis.fetch = async (_url, options) => {
    assert.ok(options.body instanceof FormData)
    assert.equal(options.body.get('ExpectedVersion'), '0')
    assert.equal(options.body.get('MockReference'), 'DEMO-CONSENT')
    assert.equal(options.body.has('File'), false)
    assert.equal(options.body.has('ExpiresAt'), false)
    return Response.json({ ...authorization, status: 'VERIFIED', version: 1 })
  }
  await api.verifyCaptureAuthorization('admin', 'order/id', authorization.type, { ...authorization, version: 0 }, { ...mockValues, expiresAt: '' })
})

test('Missing evidence, wrong file, oversized file and invalid dates never submit verification', () => {
  for (const values of [
    { ...mockValues, mockReference: ' ' },
    { ...mockValues, mockReference: 'x'.repeat(201) },
    { ...mockValues, mode: 'file' },
    { ...mockValues, mode: 'file', file: new File([], 'empty.pdf') },
    { ...mockValues, mode: 'file', file: new File(['bad'], 'permit.exe') },
    { ...mockValues, mode: 'file', file: new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'large.pdf') },
    { ...mockValues, issuedAt: 'bad' },
    { ...mockValues, expiresAt: '2020-01-01T00:00:00Z' },
    { ...mockValues, expiresAt: 'bad' },
    { ...mockValues, mode: 'other' },
  ]) assert.throws(() => api.verifyCaptureAuthorization('admin', 'order/id', authorization.type, authorization, values))
  assert.throws(() => api.authorizationForm({ ...authorization, status: 'REVOKED' }, mockValues), /thu hồi/)
})

test('Authorization identity and version must match the selected order and type before mutations', () => {
  for (const change of [{ surveyOrderId: 'other' }, { type: 'FLIGHT_PERMISSION' }, { id: '' }, { version: undefined }, { version: -1 }, { version: 0.5 }, { version: 4_294_967_296 }]) {
    assert.throws(() => api.verifyCaptureAuthorization('admin', 'order/id', authorization.type, { ...authorization, ...change }, mockValues), /không khớp/)
    assert.throws(() => api.revokeCaptureAuthorization('admin', 'order/id', authorization.type, { ...authorization, status: 'VERIFIED', ...change }, 'Wrong document'), /không khớp/)
  }
})

test('Revocation sends JSON reason and document version, and rejects pending or already revoked evidence', async () => {
  const verified = { ...authorization, status: 'VERIFIED' }
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'http://test.local/api/system-admin/survey-orders/order%2Fid/capture-authorizations/consent/revoke')
    assert.equal(options.method, 'PUT')
    assert.equal(options.headers['Content-Type'], 'application/json')
    assert.deepEqual(JSON.parse(options.body), { reason: 'Expired document', expectedVersion: 517 })
    return Response.json({ ...verified, status: 'REVOKED', version: 520 })
  }
  assert.equal((await api.revokeCaptureAuthorization('admin', 'order/id', authorization.type, verified, '  Expired document  ')).version, 520)
  for (const status of ['PENDING', 'REVOKED']) assert.throws(() => api.revokeCaptureAuthorization('admin', 'order/id', authorization.type, { ...authorization, status }, 'Reason'))
  assert.throws(() => api.revokeCaptureAuthorization('admin', 'order/id', authorization.type, verified, ' '))
})

test('Conflict and permission errors keep server details and never retry with a new version or fallback route', async () => {
  for (const status of [401, 403, 404, 409]) {
    let calls = 0
    globalThis.fetch = async () => { calls++; return Response.json({ detail: 'Authorization version conflict.', errorCode: 'SurveyCaptureAuthorization.Conflict', traceId: 'evidence-trace' }, { status }) }
    await assert.rejects(api.verifyCaptureAuthorization('admin', 'order/id', authorization.type, authorization, mockValues), error => error.status === status && error.traceId === 'evidence-trace')
    assert.equal(calls, 1)
  }
  globalThis.fetch = async () => Response.json('Dịch vụ lưu trữ MinIO đang tắt.', { status: 400 })
  await assert.rejects(api.verifyCaptureAuthorization('admin', 'order/id', authorization.type, authorization, mockValues), /MinIO đang tắt/)
})

test('Evidence download respects mock/no-file responses, expiry, document identity and safe URL schemes', () => {
  const verified = { ...authorization, evidenceReference: 'minio://bucket/evidence.pdf' }
  const evidence = { surveyOrderId: 'order/id', type: verified.type, evidenceReference: verified.evidenceReference, isMock: false, downloadUrl: 'https://storage.test/evidence.pdf?signature=test', urlExpiresAt: '2099-01-01T00:00:00Z' }
  assert.equal(api.evidenceDownloadUrl(verified, evidence), evidence.downloadUrl)
  assert.equal(api.evidenceDownloadUrl(verified, { ...evidence, isMock: true, downloadUrl: null }), null)
  assert.equal(api.evidenceDownloadUrl(verified, { ...evidence, downloadUrl: null }), null)
  for (const changes of [{ surveyOrderId: 'other' }, { type: 'FLIGHT_PERMISSION' }, { evidenceReference: 'other' }, { downloadUrl: 'javascript:alert(1)' }, { urlExpiresAt: '2020-01-01T00:00:00Z' }, { urlExpiresAt: null }]) assert.throws(() => api.evidenceDownloadUrl(verified, { ...evidence, ...changes }))
})
