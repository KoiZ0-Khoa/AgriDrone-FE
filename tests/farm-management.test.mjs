import { readFileSync } from 'node:fs'
import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'

const compile = file => ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023 } }).outputText
const dataUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
const clientUrl = dataUrl(compile('../src/api/client.ts').replace('import.meta.env.VITE_API_BASE_URL', "'http://test.local'"))
const client = await import(clientUrl)
const api = await import(dataUrl(compile('../src/features/farms/farmsApi.ts').replace("'../../api/client'", JSON.stringify(clientUrl))))
const errors = await import(dataUrl(compile('../src/features/farms/managementErrors.ts').replace("'../../api/client'", JSON.stringify(clientUrl))))
const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })

test('zone update preserves existing polygon, zero area and reviewed version in PUT', async () => {
  const body = { name: 'Khu A', areaHectares: 0, boundary: { type: 'Polygon', coordinates: [[[108, 10], [109, 10], [109, 11], [108, 10]]] }, expectedVersion: 7 }
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'http://test.local/api/farms/farm%2Fid/zones/zone%2Fid')
    assert.equal(options.method, 'PUT')
    assert.equal(options.headers.Authorization, 'Bearer token')
    assert.deepEqual(JSON.parse(options.body), body)
    return Response.json({ version: 8, updatedAt: '2026-09-10T00:00:00Z' })
  }
  assert.equal((await api.updateZone('token', 'farm/id', 'zone/id', body)).version, 8)
})

test('zone update supports clearing optional area and an absent boundary', async () => {
  globalThis.fetch = async (_url, options) => {
    assert.deepEqual(JSON.parse(options.body), { name: 'Khu B', areaHectares: null, boundary: null, expectedVersion: 2 })
    return Response.json({ version: 3 })
  }
  await api.updateZone('token', 'farm', 'zone', { name: 'Khu B', areaHectares: null, boundary: null, expectedVersion: 2 })
})

test('archive endpoints use PUT with reason/version and accept an empty 204 response', async () => {
  const paths = []
  globalThis.fetch = async (url, options) => {
    paths.push(url)
    assert.equal(options.method, 'PUT')
    assert.equal(options.headers.Authorization, 'Bearer token')
    assert.deepEqual(JSON.parse(options.body), { expectedVersion: 9, reason: 'Kết thúc canh tác' })
    return new Response(null, { status: 204 })
  }
  const body = { expectedVersion: 9, reason: 'Kết thúc canh tác' }
  assert.equal(await api.archiveFarm('token', 'farm/id', body), undefined)
  assert.equal(await api.archiveZone('token', 'farm/id', 'zone/id', body), undefined)
  assert.deepEqual(paths, ['http://test.local/api/farms/farm%2Fid/archive', 'http://test.local/api/farms/farm%2Fid/zones/zone%2Fid/archive'])
})

test('farm detail retains the version required to archive, zone detail remains available', async () => {
  globalThis.fetch = async url => {
    assert.match(url, /\/api\/farms\/farm(?:\/zones\/zone)?$/)
    return Response.json({ version: 12, updatedAt: '2026-09-10T00:00:00Z' })
  }
  assert.equal((await api.getFarm('token', 'farm')).version, 12)
  assert.equal((await api.getZone('token', 'farm', 'zone')).version, 12)
})

test('concurrency failures propagate without silently retrying a newer version', async () => {
  for (const code of ['Farm.ConcurrentUpdate', 'FarmZone.ConcurrentUpdate']) {
    let calls = 0
    globalThis.fetch = async () => { calls++; return Response.json({ errorCode: code }, { status: 409 }) }
    await assert.rejects(() => api.archiveFarm('token', 'farm', { expectedVersion: 1, reason: 'Lý do' }), error => errors.isVersionConflict(error))
    assert.equal(calls, 1)
  }
})

test('dependency and boundary conflicts are not treated as stale versions', async () => {
  for (const code of ['Farm.ActiveDependenciesExist', 'FarmZone.ActiveDependenciesExist', 'FarmZone.BoundaryOverlaps', 'FarmZone.BoundaryOutsideFarm']) {
    globalThis.fetch = async () => Response.json({ errorCode: code, detail: 'server detail' }, { status: 409 })
    await assert.rejects(() => api.archiveZone('token', 'farm', 'zone', { expectedVersion: 1, reason: 'Lý do' }), error => {
      assert.equal(errors.isVersionConflict(error), false)
      assert.notEqual(errors.managementError(error), 'server detail')
      return error.code === code
    })
  }
})

test('permission and missing-resource errors are preserved and translated', async () => {
  for (const status of [403, 404]) {
    globalThis.fetch = async () => Response.json({ detail: 'server detail' }, { status })
    await assert.rejects(() => api.archiveFarm('token', 'farm', { expectedVersion: 1, reason: 'Lý do' }), error => {
      assert.ok(error instanceof client.ApiError)
      assert.notEqual(errors.managementError(error), 'server detail')
      return error.status === status
    })
  }
})
