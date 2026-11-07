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

test('downloadMissionTreesCsv GETs the missionId-first csv route with a bearer header and reads the server file name', async () => {
  let captured
  globalThis.fetch = async (url, options) => {
    captured = { url: url.toString(), headers: options.headers }
    return new Response('tree_id,row,col\ntree_r1_c1,1,1\n', { status: 200, headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="trees_mission-1.csv"' } })
  }
  const { blob, fileName } = await api.downloadMissionTreesCsv('manager', 'farm-1', 'mission-1')
  assert.equal(captured.url, 'http://test.local/api/missions/mission-1/farms/farm-1/yolo-csv')
  assert.equal(captured.headers.Authorization, 'Bearer manager')
  assert.equal(fileName, 'trees_mission-1.csv')
  assert.equal(await blob.text(), 'tree_id,row,col\ntree_r1_c1,1,1\n')
})

test('downloadMissionTreesCsv falls back to trees_{missionId}.csv when the server sends no Content-Disposition', async () => {
  globalThis.fetch = async () => new Response('a,b\n1,2\n', { status: 200 })
  const { fileName } = await api.downloadMissionTreesCsv('manager', 'farm-1', 'mission-1')
  assert.equal(fileName, 'trees_mission-1.csv')
})

test('a non-OK file response raises an ApiError built from the JSON problem body, same as apiRequest', async () => {
  const { ApiError } = await import(clientUrl)
  globalThis.fetch = async () => Response.json({ detail: 'Trees CSV not found. Please run YOLO detection first.', errorCode: 'DownloadCsv.NotFound' }, { status: 404 })
  await assert.rejects(() => api.downloadMissionTreesCsv('manager', 'farm-1', 'mission-1'), error => {
    assert.ok(error instanceof ApiError)
    assert.equal(error.status, 404)
    assert.equal(error.code, 'DownloadCsv.NotFound')
    return true
  })
})

test('DownloadCsv error codes translate to actionable Vietnamese messages', async () => {
  const { ApiError } = await import(clientUrl)
  assert.match(workflow.missionError(new ApiError(404, 'x', 'DownloadCsv.NotFound')), /chạy nhận diện cây/)
  assert.match(workflow.missionError(new ApiError(403, 'x', 'DownloadCsv.FarmAccessDenied')), /không được phân công/)
})
