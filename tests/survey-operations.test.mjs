import { readFileSync } from 'node:fs'
import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'

const compile = file => ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023 } }).outputText
const dataUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
const clientUrl = dataUrl(compile('../src/api/client.ts').replace('import.meta.env.VITE_API_BASE_URL', "'http://test.local'"))
const loadApi = file => import(dataUrl(compile(file).replace("'../../api/client'", JSON.stringify(clientUrl))))
const farms = await loadApi('../src/features/surveys/farmOperationsApi.ts')
const orders = await loadApi('../src/features/surveys/orderApi.ts')
const workflow = await import(dataUrl(compile('../src/features/surveys/orderWorkflow.ts')))
const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })

test('assigned Farm operational context uses Manager route without tenant context or legacy detail calls', async () => {
  const controller = new AbortController(), calls = []
  globalThis.fetch = async (url, options) => {
    calls.push(url)
    assert.equal(url, 'http://test.local/api/system-manager/farms/f%2F1/operational-context')
    assert.equal(options.headers.Authorization, 'Bearer manager')
    assert.equal(options.signal, controller.signal)
    assert.equal(Object.keys(options.headers).some(key => /tenant/i.test(key)), false)
    return Response.json({ farmId: 'f/1', tenantId: 'tenant', version: 413, approvedBoundary: { versionNumber: 8 }, zones: [], publishedBaseMap: null })
  }
  const result = await farms.getFarmContext('manager', 'f/1', controller.signal)
  assert.equal(result.version, 413)
  assert.equal(result.approvedBoundary.versionNumber, 8)
  assert.equal(Object.hasOwn(result, 'centerPoint'), false)
  assert.equal(calls.length, 1)
})

test('Farm boundary correction sends both reviewed versions and keeps holes', async () => {
  const boundary = workflow.polygonFromPoints([{ longitude: 108, latitude: 10 }, { longitude: 109, latitude: 10 }, { longitude: 109, latitude: 11 }], [[[108.1, 10.1], [108.2, 10.1], [108.2, 10.2], [108.1, 10.1]]])
  const body = { boundary, reason: 'Measured correction', evidenceReference: 'field-record', expectedFarmVersion: 413, expectedCurrentBoundaryVersionNumber: 8 }
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'http://test.local/api/system-manager/farms/f%2F1/boundary/verify')
    assert.equal(options.method, 'POST')
    assert.equal(options.headers.Authorization, 'Bearer manager')
    assert.deepEqual(JSON.parse(options.body), body)
    return Response.json({ versionNumber: 9 })
  }
  assert.equal((await farms.verifyFarmBoundary('manager', 'f/1', body)).versionNumber, 9)
})

test('exception list applies BE enum filter and cancellation; classification uses a WGS84 Point', async () => {
  const controller = new AbortController()
  globalThis.fetch = async (url, options) => {
    const parsed = new URL(url)
    assert.equal(parsed.pathname, '/api/system-manager/farms/f%2F1/boundary-exceptions')
    assert.equal(parsed.searchParams.get('state'), 'NeedsReview')
    assert.equal(options.signal, controller.signal)
    return Response.json([])
  }
  await farms.getBoundaryExceptions('manager', 'f/1', 'NeedsReview', controller.signal)
  const body = { point: { type: 'Point', coordinates: [108, 10] }, source: 4, sourceReferenceId: 'FIELD-1', nearBoundaryThresholdMeters: 5 }
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'http://test.local/api/system-manager/farms/f%2F1/boundary-exceptions/classify')
    assert.deepEqual(JSON.parse(options.body), body)
    return Response.json({ classification: 'NearBoundary', distanceMeters: 2, boundaryExceptionId: 'exception', state: 'NeedsReview' })
  }
  assert.equal((await farms.classifyFarmPoint('manager', 'f/1', body)).boundaryExceptionId, 'exception')
})

test('exception correction retains selected decision, evidence, version and server conflicts', async () => {
  const body = { decision: 3, correctedPosition: { type: 'Point', coordinates: [108.1, 10.1] }, reason: 'GPS correction', evidence: { reference: 'field-record' }, expectedVersion: 17 }
  let calls = 0
  globalThis.fetch = async (url, options) => {
    calls++
    assert.equal(url, 'http://test.local/api/system-manager/farms/f%2F1/boundary-exceptions/e%2F1/review')
    assert.equal(options.method, 'POST')
    assert.deepEqual(JSON.parse(options.body), body)
    return Response.json({ errorCode: 'BoundaryException.ConcurrentUpdate', traceId: 'trace' }, { status: 409 })
  }
  await assert.rejects(farms.reviewBoundaryException('manager', 'f/1', 'e/1', body), error => error.status === 409 && error.traceId === 'trace')
  assert.equal(calls, 1)
})

const sample = { clientOperationId: '019a0000-1111-2222-3333-444444444444', sequenceNumber: 0, latitude: 10, longitude: 108, horizontalAccuracyMeters: 2, capturedAt: '2026-10-20T10:00:00+07:00' }
test('GPS import retains operation identity/order/accuracy and normalizes real capture timestamps', () => {
  const parsed = workflow.parseCaptureSamples(JSON.stringify([sample]))
  assert.deepEqual(parsed, [{ ...sample, capturedAt: '2026-10-20T03:00:00.000Z' }])
  assert.deepEqual(workflow.parseCaptureSamples(JSON.stringify([sample]), parsed), parsed)
  assert.throws(() => workflow.parseCaptureSamples(JSON.stringify([{ ...sample, longitude: 109 }]), parsed))
})

test('GPS import rejects missing evidence, duplicate identity/sequence and malformed device coordinates', () => {
  for (const value of ['invalid-json', '{}', '[]', JSON.stringify([sample, sample]), JSON.stringify([{ ...sample, clientOperationId: 'other' }]), JSON.stringify([{ ...sample, sequenceNumber: -1 }]), JSON.stringify([{ ...sample, longitude: 181 }]), JSON.stringify([{ ...sample, horizontalAccuracyMeters: 0 }]), JSON.stringify([{ ...sample, capturedAt: '2026-10-20T10:00:00' }]), JSON.stringify([{ ...sample, capturedAt: 'invalid' }])]) assert.throws(() => workflow.parseCaptureSamples(value))
  assert.throws(() => workflow.parseCaptureSamples(JSON.stringify(Array(501).fill(sample))))
  assert.throws(() => workflow.parseCaptureSamples(JSON.stringify([{ ...sample, sequenceNumber: 1 }]), [sample]))
})

test('GPS session can resume using authenticated GET and an abort signal', async () => {
  const controller = new AbortController()
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'http://test.local/api/system-manager/survey-orders/o%2F1/boundary-capture-sessions/s%2F1')
    assert.equal(options.headers.Authorization, 'Bearer manager')
    assert.equal(options.signal, controller.signal)
    return Response.json({ surveyOrderId: 'o/1', farmId: 'farm', orderVersion: 51, sessionVersion: 6, samples: [sample] })
  }
  assert.equal((await orders.getCaptureSession('manager', 'o/1', 's/1', controller.signal)).samples.length, 1)
})

test('capture start, sync, finalize and abort keep exact reviewed versions and never infer them', async () => {
  const base = 'http://test.local/api/system-manager/survey-orders/o%2F1/boundary-capture-sessions'
  const cases = [
    [body => orders.startCapture('manager', 'o/1', body), base, { droneId: 'drone', operationId: 'operation', expectedOrderVersion: 51 }],
    [body => orders.syncCapture('manager', 'o/1', 's/1', body), `${base}/s%2F1/samples:sync`, { expectedSessionVersion: 6, samples: [sample] }],
    [body => orders.finalizeCapture('manager', 'o/1', 's/1', body), `${base}/s%2F1/finalize`, { expectedOrderVersion: 51, expectedSessionVersion: 6, expectedCurrentBoundaryVersionNumber: 8, evidenceReference: 'field-record' }],
    [body => orders.abortCapture('manager', 'o/1', 's/1', body), `${base}/s%2F1/abort`, { expectedSessionVersion: 6, reason: 'Weather' }],
  ]
  for (const [run, path, body] of cases) {
    globalThis.fetch = async (url, options) => { assert.equal(url, path); assert.equal(options.method, 'POST'); assert.deepEqual(JSON.parse(options.body), body); return Response.json({ sessionVersion: 7 }) }
    assert.equal((await run(body)).sessionVersion, 7)
  }
})

test('capture controls require matching Order and Farm plus a real session version', () => {
  const scope = { surveyOrderId: 'order', farmId: 'farm', orderVersion: 51 }
  const session = { surveyOrderId: 'order', farmId: 'farm', orderVersion: 51, sessionVersion: 0 }
  assert.equal(workflow.matchingCapture(scope, session), true)
  for (const change of [{ surveyOrderId: 'other' }, { farmId: 'other' }, { orderVersion: 50 }, { sessionVersion: undefined }]) assert.equal(workflow.matchingCapture(scope, { ...session, ...change }), false)
})

test('route approval binds finalized capture, boundary and external route version with safety review', async () => {
  const body = { sessionId: 'session', farmBoundaryVersionId: 'boundary', routePlanVersion: 12, safetyInsetMeters: 4, isWithinSafetyInset: true, expectedOrderVersion: 51 }
  globalThis.fetch = async (url, options) => { assert.equal(url, 'http://test.local/api/system-manager/survey-orders/o%2F1/baseline-route-plans/r%2F1/approve'); assert.deepEqual(JSON.parse(options.body), body); return Response.json({ baselineRoutePlanId: 'r/1' }) }
  assert.equal((await orders.approveBaselineRoute('manager', 'o/1', 'r/1', body)).baselineRoutePlanId, 'r/1')
})

test('orthophoto marking uses four unique longitude/latitude corners in explicit ring order', async () => {
  const scope = { surveyOrderId: 'order', orderStatus: 'AWAITING_BASELINE_REVIEW', orderVersion: 51 }
  const points = [{ longitude: 108, latitude: 10 }, { longitude: 109, latitude: 10 }, { longitude: 109, latitude: 11 }, { longitude: 108, latitude: 11 }]
  const body = workflow.orthophotoBody(scope, points, ' Verified ', ' ORTHO-1 ')
  assert.deepEqual(body, { expectedOrderVersion: 51, corners: points.map((point, index) => ({ sequence: index + 1, ...point })), reason: 'Verified', evidenceReference: 'ORTHO-1' })
  for (const invalid of [points.slice(0, 3), [...points.slice(0, 3), points[0]], [...points, points[0]]]) assert.throws(() => workflow.orthophotoBody(scope, invalid))
  assert.throws(() => workflow.orthophotoBody({ ...scope, orderStatus: 'AWAITING_BASELINE_DEPOSIT' }, points))
  assert.throws(() => workflow.orthophotoBody({ ...scope, orderVersion: undefined }, points))
  globalThis.fetch = async (url, options) => { assert.equal(url, 'http://test.local/api/system-manager/survey-orders/o%2F1/farm-boundary/mark-orthophoto-corners'); assert.deepEqual(JSON.parse(options.body), body); return Response.json({ orderVersion: 52 }) }
  assert.equal((await orders.markOrthophotoCorners('manager', 'o/1', body)).orderVersion, 52)
})

test('Owner payment distinguishes deposit and remaining balance without FE amounts or confirmation', async () => {
  for (const purpose of ['BASELINE_DEPOSIT', 'FINAL_BALANCE']) {
    globalThis.fetch = async (url, options) => {
      assert.equal(url, 'http://test.local/api/tenant-owner/survey-orders/o%2F1/payments')
      assert.equal(options.headers.Authorization, 'Bearer owner')
      assert.deepEqual(JSON.parse(options.body), { purpose, expectedOrderVersion: 51 })
      return Response.json({ amount: purpose === 'BASELINE_DEPOSIT' ? 500000 : 2500000, currency: 'VND', paymentStatus: 'PROCESSING' }, { status: 201 })
    }
    assert.equal((await orders.initiateSurveyPayment('owner', 'o/1', { purpose, expectedOrderVersion: 51 })).paymentStatus, 'PROCESSING')
  }
})

test('drone selector uses Manager farm authorization and the operator-selected time window', async () => {
  globalThis.fetch = async (url, options) => {
    const parsed = new URL(url)
    assert.equal(parsed.pathname, '/api/system-manager/farms/f%2F1/drones/available')
    assert.equal(parsed.searchParams.get('startAt'), '2026-10-20T03:00:00Z')
    assert.equal(parsed.searchParams.get('endAt'), '2026-10-20T05:00:00Z')
    assert.equal(parsed.searchParams.get('purpose'), 'BaselineMapping')
    assert.equal(options.headers.Authorization, 'Bearer manager')
    return Response.json([{ id: 'drone', code: 'D1', name: 'Drone One' }])
  }
  assert.equal((await orders.getCaptureDrones('manager', 'f/1', '2026-10-20T03:00:00Z', '2026-10-20T05:00:00Z'))[0].code, 'D1')
})
