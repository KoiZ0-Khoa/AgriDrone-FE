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

test('media upload hits the missionId-first route (not system-manager-prefixed) with multipart files', async () => {
  let captured
  globalThis.fetch = async (url, options) => {
    captured = { url: url.toString(), method: options.method, contentType: options.headers?.['Content-Type'], isFormData: options.body instanceof FormData }
    return Response.json([
      { index: 0, fileName: 'a.jpg', status: 'Completed', media: { uploadSessionId: 's1', mediaAssetId: 'm1', status: 'Completed', mimeType: 'image/jpeg', fileSizeBytes: 123, sha256Checksum: 'abc', reusedCompletion: false }, errorCode: null, errorMessage: null },
    ])
  }
  const file = new File([new Uint8Array([1, 2, 3])], 'a.jpg', { type: 'image/jpeg' })
  const results = await api.uploadMissionMedia('manager', 'farm-1', 'mission-1', [file])
  assert.equal(captured.url, 'http://test.local/api/missions/mission-1/farms/farm-1/media')
  assert.equal(captured.method, 'POST')
  assert.equal(captured.isFormData, true)
  assert.equal(captured.contentType, undefined)
  assert.equal(results[0].media.mediaAssetId, 'm1')
})

test('batched upload (>20 files) stops sending further batches once a batch reports a non-Completed item', async () => {
  const calls = []
  globalThis.fetch = async url => {
    calls.push(url.toString())
    const firstBatch = calls.length === 1
    return Response.json(firstBatch
      ? [{ index: 0, fileName: 'ok.jpg', status: 'Completed', media: {}, errorCode: null, errorMessage: null },
        { index: 1, fileName: 'bad.jpg', status: 'Failed', media: null, errorCode: 'x', errorMessage: 'broken' },
        { index: 2, fileName: 'rest.jpg', status: 'NotAttempted', media: null, errorCode: null, errorMessage: null }]
      : [{ index: 0, fileName: 'should-not-run.jpg', status: 'Completed', media: {}, errorCode: null, errorMessage: null }])
  }
  const files = Array.from({ length: 25 }, (_, index) => new File([new Uint8Array([index])], `f${index}.jpg`))
  globalThis.FormData.prototype.append = globalThis.FormData.prototype.append
  const batches = []
  for (let start = 0; start < files.length; start += 20) {
    const batch = files.slice(start, start + 20)
    const batchResults = await api.uploadMissionMedia('manager', 'farm-1', 'mission-1', batch)
    batches.push(batchResults)
    if (batchResults.some(item => item.status !== 'Completed')) break
  }
  assert.equal(calls.length, 1)
  assert.equal(batches.length, 1)
  assert.equal(batches[0][1].status, 'Failed')
})

test('media list and download-url use the same missionId-first route', async () => {
  const calls = []
  globalThis.fetch = async url => {
    calls.push(new URL(url).pathname)
    return calls.length === 1
      ? Response.json({ items: [{ mediaId: 'm1' }], totalCount: 1, pageNumber: 1, pageSize: 20, hasNextPage: false })
      : Response.json({ mediaId: 'm1', downloadUrl: 'https://minio/x', expiresAt: '2026-01-01T00:00:00Z' })
  }
  const page = await api.getMissionMedia('manager', 'farm-1', 'mission-1')
  assert.equal(page.items[0].mediaId, 'm1')
  const download = await api.getMissionMediaDownloadUrl('manager', 'farm-1', 'mission-1', 'm1')
  assert.equal(download.downloadUrl, 'https://minio/x')
  assert.deepEqual(calls, ['/api/missions/mission-1/farms/farm-1/media', '/api/missions/mission-1/farms/farm-1/media/m1/download-url'])
})

test('fileSizeLabel formats bytes/KB/MB and handles null', () => {
  assert.equal(workflow.fileSizeLabel(null), '—')
  assert.equal(workflow.fileSizeLabel(500), '500 B')
  assert.equal(workflow.fileSizeLabel(2048), '2 KB')
  assert.equal(workflow.fileSizeLabel(2 * 1024 * 1024), '2.0 MB')
})
