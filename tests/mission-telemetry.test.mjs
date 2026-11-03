import { readFileSync } from 'node:fs'
import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'

const compile = file => ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023 } }).outputText
const dataUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
const clientUrl = dataUrl(compile('../src/api/client.ts').replace('import.meta.env.VITE_API_BASE_URL', "'http://test.local'"))
const api = await import(dataUrl(compile('../src/features/missions/missionApi.ts').replace("'../../api/client'", JSON.stringify(clientUrl))))
const workflow = await import(dataUrl(compile('../src/features/missions/missionWorkflow.ts').replace("'../../api/client'", JSON.stringify(clientUrl))))
const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })

test('normalize posts multipart to the missionId-first telemetry route', async () => {
  let captured
  globalThis.fetch = async (url, options) => {
    captured = { url: url.toString(), method: options.method, isFormData: options.body instanceof FormData }
    return Response.json({ sourceFileName: 'log.bbl', sourceChecksum: 'abc', warnings: [], segments: [{ segmentIndex: 0, sourcePointCount: 10, rejectedPointCount: 0, pointCount: 10, firstRecordedAt: '2026-01-01T00:00:00Z', lastRecordedAt: '2026-01-01T00:05:00Z', fitsPointCountLimit: true, warnings: [], points: [] }] })
  }
  const file = new File([new Uint8Array([1])], 'log.bbl')
  const result = await api.normalizeTelemetryLog('manager', 'farm-1', 'mission-1', file)
  assert.equal(captured.url, 'http://test.local/api/missions/mission-1/farms/farm-1/telemetry/normalize')
  assert.equal(captured.isFormData, true)
  assert.equal(result.segments[0].fitsPointCountLimit, true)
})

test('import sends Idempotency-Key and the exact segments/points payload, not the normalize response as-is', async () => {
  let captured
  globalThis.fetch = async (url, options) => {
    captured = { url: url.toString(), method: options.method, key: options.headers['Idempotency-Key'], body: JSON.parse(options.body) }
    return Response.json({ telemetryImportId: 't1', missionId: 'mission-1', pointCount: 2, firstRecordedAt: '2026-01-01T00:00:00Z', lastRecordedAt: '2026-01-01T00:00:10Z', missionVersion: 5, reusedOperation: false })
  }
  const body = {
    sourceFileName: 'log.bbl', sourceChecksum: 'abc', expectedMissionVersion: 4,
    segments: [{ segmentIndex: 0, points: [
      { sequenceNumber: 0, recordedAt: '2026-01-01T00:00:00Z', longitude: 106.1, latitude: 10.1, altitudeM: 10, altitudeReference: null, headingDeg: 90, speedMps: 2, horizontalAccuracyM: 1 },
      { sequenceNumber: 1, recordedAt: '2026-01-01T00:00:10Z', longitude: 106.2, latitude: 10.2, altitudeM: 11, altitudeReference: null, headingDeg: 91, speedMps: 3, horizontalAccuracyM: 1 },
    ] }],
  }
  const result = await api.importMissionTelemetry('manager', 'farm-1', 'mission-1', body, 'op-1')
  assert.equal(captured.url, 'http://test.local/api/missions/mission-1/farms/farm-1/telemetry/imports')
  assert.equal(captured.method, 'POST')
  assert.equal(captured.key, 'op-1')
  assert.deepEqual(captured.body, body)
  assert.equal(result.missionVersion, 5)
})

test('telemetry error codes translate to actionable Vietnamese messages', async () => {
  const { ApiError } = await import(clientUrl)
  assert.match(workflow.missionError(new ApiError(409, 'x', 'TelemetryImport.MissionStatusNotAllowed')), /kết thúc chuyến bay/)
  assert.match(workflow.missionError(new ApiError(400, 'x', 'TelemetryImport.TimestampOutsideMission')), /ngoài khoảng thời gian/)
  assert.match(workflow.missionError(new ApiError(409, 'x', 'TelemetryImport.FlightTimelineMissing')), /thời điểm bắt đầu/)
})
