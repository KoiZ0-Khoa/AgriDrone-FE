import { readFileSync } from 'node:fs'
import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'

const compile = file => ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023 } }).outputText
const dataUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
const clientUrl = dataUrl(compile('../src/api/client.ts').replace('import.meta.env.VITE_API_BASE_URL', "'http://test.local'"))
const api = await import(dataUrl(compile('../src/features/baseMaps/api.ts').replace("'../../api/client'", JSON.stringify(clientUrl))))
const healthApi = await import(dataUrl(compile('../src/features/missions/plantHealthProcessingApi.ts').replace("'../../api/client'", JSON.stringify(clientUrl))))
const workflow = await import(dataUrl(compile('../src/features/baseMaps/workflow.ts').replace("'../../api/client'", JSON.stringify(clientUrl))))
const { ApiError } = await import(clientUrl)
const originalFetch = globalThis.fetch
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
afterEach(() => {
  globalThis.fetch = originalFetch
  if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow)
  else delete globalThis.window
})
const farmId = '10000000-0000-4000-8000-000000000001'
const versionId = '20000000-0000-4000-8000-000000000002'
const nextVersionId = '30000000-0000-4000-8000-000000000003'
const plantId = '40000000-0000-4000-8000-000000000004'

test('manual edits preserve the real candidate reference and reject positions outside the farm or inside a hole', () => {
  const boundary = JSON.stringify({ type: 'Polygon', coordinates: [[[106, 10], [107, 10], [107, 11], [106, 11], [106, 10]], [[106.4, 10.4], [106.6, 10.4], [106.6, 10.6], [106.4, 10.6], [106.4, 10.4]]] })
  const candidate = { candidateId: 'real-candidate', correctedMatchedPlantId: plantId, proposedMatchedPlantId: 'stale-plant' }
  const values = { decision: 'Relocate', longitude: 106.2, latitude: 10.2, row: 3, col: 2, reason: '  Kiểm tra ngoài thực địa  ' }
  assert.deepEqual(workflow.manualReviewBody(values, candidate, boundary), { decision: 'Relocate', correctedLongitude: 106.2, correctedLatitude: 10.2, correctedRowIndex: 3, correctedColumnIndex: 2, correctedMatchedPlantId: plantId, reason: 'Kiểm tra ngoài thực địa' })
  assert.equal(workflow.manualReviewBody({ ...values, decision: 'CreateNew' }, undefined, boundary).correctedMatchedPlantId, null)
  assert.deepEqual(workflow.manualReviewBody({ decision: 'Reject', reason: 'Đã nhổ trụ' }, candidate, null), { decision: 'Reject', correctedLongitude: null, correctedLatitude: null, correctedRowIndex: null, correctedColumnIndex: null, correctedMatchedPlantId: plantId, reason: 'Đã nhổ trụ' })
  for (const patch of [{ longitude: 108 }, { longitude: 106.5, latitude: 10.5 }, { longitude: NaN }, { latitude: null }, { row: 1.5 }, { col: 0 }, { reason: '   ' }]) assert.throws(() => workflow.manualReviewBody({ ...values, ...patch }, candidate, boundary))
  assert.throws(() => workflow.manualReviewBody(values, undefined, boundary), /Chọn điểm/)
  assert.throws(() => workflow.manualReviewBody(values, candidate, null), /ranh giới/)
})

test('disease detection calls .NET and an empty successful result can be handed off with one idempotency key', async () => {
  const missionId = versionId, key = nextVersionId, calls = []
  const body = { confidenceThreshold: 0.25, matchingToleranceMeters: 2.5, zoneRadiusMeters: 5, minDiseasedTrees: 3 }
  globalThis.fetch = async (url, options) => {
    calls.push(new URL(url).pathname)
    assert.equal(new URL(url).origin, 'http://test.local')
    assert.equal(options.method, 'POST')
    assert.equal(options.headers.Authorization, 'Bearer manager-token')
    if (url.endsWith('/disease-detect')) {
      assert.deepEqual(JSON.parse(options.body), body)
      return Response.json({ missionId, totalDetections: 0, totalImagesScanned: 3, detections: [], diseaseSummary: {} })
    }
    assert.equal(options.body, undefined)
    assert.equal(options.headers['Idempotency-Key'], key)
    return Response.json({ missionId, messageId: key, status: 'QUEUED' })
  }
  const result = await healthApi.detectMissionDiseases('manager-token', farmId, missionId, body)
  assert.equal(result.totalDetections, 0)
  assert.equal((await healthApi.publishMissionPlantHealth('manager-token', farmId, missionId, key)).status, 'QUEUED')
  assert.deepEqual(calls, [`/api/missions/${missionId}/farms/${farmId}/disease-detect`, `/api/system-manager/farms/${farmId}/missions/${missionId}/plant-health/publish`])
})

test('health handoff rejects mismatched operation or mission and keeps server failure codes', async () => {
  globalThis.fetch = async () => Response.json({ missionId: versionId, messageId: 'different-operation', status: 'QUEUED' })
  await assert.rejects(() => healthApi.publishMissionPlantHealth('token', farmId, versionId, nextVersionId), /không khớp/)
  globalThis.fetch = async () => Response.json({ missionId: plantId })
  await assert.rejects(() => healthApi.detectMissionDiseases('token', farmId, versionId, {}), /không khớp/)
  globalThis.fetch = async () => Response.json({ errorCode: 'DetectDiseases.CaptureMapRequired', detail: 'Published map is required.' }, { status: 409 })
  await assert.rejects(() => healthApi.detectMissionDiseases('token', farmId, versionId, {}), e => e instanceof ApiError && e.code === 'DetectDiseases.CaptureMapRequired')
})

test('map history reads the actual .NET routes with token, cancellation and correct comparison parameter names', async () => {
  const controller = new AbortController(), calls = []
  globalThis.fetch = async (url, options) => {
    const u = new URL(url)
    calls.push(u)
    assert.equal(options.headers.Authorization, 'Bearer manager-token')
    assert.equal(options.signal, controller.signal)
    assert.equal(options.method ?? 'GET', 'GET')
    if (u.pathname.endsWith('/lifecycle')) return Response.json({ farmId, plantId, currentRow: 1, currentCol: 2, timeline: [{ changeType: 'NEW_PLANT' }] })
    if (u.pathname.endsWith('/compare')) return Response.json({ farmId, fromVersionId: versionId, toVersionId: nextVersionId, summary: { createdCount: 1 }, changes: [] })
    if (u.pathname.endsWith('/analytics')) return Response.json({ farmId, totalMappingVersions: 2, timeline: [{ polesDelta: 1, densityPolesPerHa: 50 }] })
    if (u.pathname.endsWith('/base-maps')) return Response.json([{ farmId, versionId }])
    return Response.json({ farmId, versionId, plants: [], manualChanges: [{ changeType: 'REMOVED_PLANT' }] })
  }
  assert.equal((await api.getMapVersions('manager-token', farmId, true, controller.signal))[0].versionId, versionId)
  assert.equal(calls[0].searchParams.get('includeDraft'), 'true')
  assert.equal((await api.getMapVersion('manager-token', farmId, versionId, controller.signal)).manualChanges[0].changeType, 'REMOVED_PLANT')
  assert.equal((await api.getPlantLifecycle('manager-token', farmId, plantId, controller.signal)).timeline[0].changeType, 'NEW_PLANT')
  assert.equal(calls[2].pathname, `/api/farms/${farmId}/plants/${plantId}/lifecycle`)
  assert.equal((await api.compareMapVersions('manager-token', farmId, versionId, nextVersionId, controller.signal)).summary.createdCount, 1)
  assert.equal(calls[3].searchParams.get('fromVersionId'), versionId)
  assert.equal(calls[3].searchParams.get('toVersionId'), nextVersionId)
  assert.equal(calls[3].searchParams.has('sourceVersionId'), false)
  assert.equal((await api.getMapAnalytics('manager-token', farmId, controller.signal)).timeline[0].polesDelta, 1)
  assert.ok(calls.every(u => u.origin === 'http://test.local'))
})

test('mismatched Farm, version, plant or comparison responses are rejected instead of displayed', async () => {
  globalThis.fetch = async () => Response.json([{ farmId: 'other', versionId }])
  await assert.rejects(() => api.getMapVersions('token', farmId), /không khớp/)
  globalThis.fetch = async () => Response.json({ farmId, versionId: nextVersionId })
  await assert.rejects(() => api.getMapVersion('token', farmId, versionId), /không khớp/)
  globalThis.fetch = async () => Response.json({ farmId, plantId: 'other' })
  await assert.rejects(() => api.getPlantLifecycle('token', farmId, plantId), /không khớp/)
  globalThis.fetch = async () => Response.json({ farmId, fromVersionId: nextVersionId, toVersionId: versionId })
  await assert.rejects(() => api.compareMapVersions('token', farmId, versionId, nextVersionId), /không khớp/)
  await assert.rejects(() => api.compareMapVersions('token', farmId, versionId, versionId), /hai phiên bản/)
})

test('only payment-required conflicts are treated as a payment lock; Owner never gets a locally fabricated unlocked result', async () => {
  globalThis.fetch = async () => Response.json({ errorCode: 'FarmPlants.PaymentRequired', detail: 'Locked' }, { status: 409 })
  await assert.rejects(() => api.getMapVersion('owner', farmId, versionId), error => workflow.isPaymentLocked(error))
  assert.equal(workflow.isPaymentLocked(new ApiError(409, 'Version changed', 'Map.VersionConflict')), false)
  assert.equal(workflow.isPaymentLocked(new ApiError(403, 'Forbidden', 'FarmPlants.PaymentRequired')), false)
  assert.equal(workflow.isReleasedMap('Published'), true)
  assert.equal(workflow.isReleasedMap('SUPERSEDED'), true)
  assert.equal(workflow.isReleasedMap('DRAFT'), false)
})

test('map geometry keeps WGS84 longitude-first order and derives a viewport when image bounds are absent', () => {
  const boundaryGeoJson = JSON.stringify({ type: 'Polygon', coordinates: [[[106, 10], [107, 10], [107, 11], [106, 10]]] })
  assert.deepEqual(workflow.mapBoundary(boundaryGeoJson).coordinates[0][0], [106, 10])
  assert.equal(workflow.mapBoundary('{invalid'), null)
  assert.equal(workflow.mapBoundary(JSON.stringify({ type: 'Polygon', coordinates: [[[106, 100], [107, 10], [107, 11], [106, 100]]] })), null)
  assert.deepEqual(workflow.viewerBounds({ bounds: { minLat: 10, maxLat: 11, minLon: 106, maxLon: 107 }, plants: [] }), [[10, 106], [11, 107]])
  assert.equal(workflow.viewerBounds({ bounds: null, plants: [], boundaryGeoJson: null }), null)
  const b = workflow.viewerBounds({ bounds: null, plants: [{ lat: 10.5, lon: 106.5 }], boundaryGeoJson: null })
  assert.ok(b[0][0] < 10.5 && b[1][0] > 10.5 && b[0][1] < 106.5 && b[1][1] > 106.5)
})

test('preview accepts signed HTTP URLs and rejects executable, credential-bearing and private storage URIs', () => {
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { origin: 'http://test.local' } } })
  assert.equal(workflow.previewUrl('https://storage.local/image.jpg?signature=example'), 'https://storage.local/image.jpg?signature=example')
  for (const url of ['javascript:alert(1)', 'data:image/svg+xml,test', 'minio://bucket/file', 'https://user:pass@storage.local/image.jpg', null]) assert.equal(workflow.previewUrl(url), null)
})
