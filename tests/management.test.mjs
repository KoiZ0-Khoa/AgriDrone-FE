import { readFileSync } from 'node:fs'
import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'
const compile = file => ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023 } }).outputText
const dataUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
const clientUrl = dataUrl(compile('../src/api/client.ts').replace('import.meta.env.VITE_API_BASE_URL', "'http://test.local'"))
const apiUrl = dataUrl(compile('../src/management/api.ts').replace("'../api/client'", JSON.stringify(clientUrl)))
const api = await import(apiUrl)
const actions = await import(dataUrl(compile('../src/management/actions.ts').replace("'./api'", JSON.stringify(apiUrl))))
const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })

test('profile uses name/phone and preserves the returned fullName', async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'http://test.local/current/profile')
    assert.equal(options.method, 'PUT')
    assert.equal(options.headers.Authorization, 'Bearer token')
    assert.deepEqual(JSON.parse(options.body), { name: 'Nguyễn A', phone: '0900000000' })
    return Response.json({ fullName: 'Nguyễn A', phone: '0900000000' })
  }
  let saved
  await actions.profileAction('token', { fullName: 'A', phone: null }, p => { saved = p }).run({ name: ' Nguyễn A ', phone: '0900000000' })
  assert.equal(saved.fullName, 'Nguyễn A')
})
test('password confirmation never goes to BE and password spaces remain unchanged', async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'http://test.local/current/change-password')
    assert.deepEqual(JSON.parse(options.body), { oldPassword: ' old password ', newPassword: ' new password ' })
    return Response.json({ message: 'ok' })
  }
  const action = actions.passwordAction('token', () => {})
  assert.throws(() => action.run({ oldPassword: 'x', newPassword: '12345678', confirm: 'different' }))
  await action.run({ oldPassword: ' old password ', newPassword: ' new password ', confirm: ' new password ' })
})
test('farm edit preserves polygon and reviewed version, handles zero and nullable fields', () => {
  const farm = { expectedVersion: 4, boundary: { type: 'Polygon', coordinates: [[[1, 1], [2, 1], [2, 2], [1, 1]]] } }
  const body = actions.farmBody({ name: ' Farm ', address: ' ', area: '0', longitude: '0', latitude: '0' }, farm)
  assert.equal(body.expectedVersion, 4)
  assert.deepEqual(body.boundary, farm.boundary)
  assert.deepEqual(body.centerPoint.coordinates, [0, 0])
  assert.equal(body.areaHectares, 0)
  assert.equal(body.address, null)
  assert.equal(actions.farmBody({ name: 'F', area: '', longitude: '', latitude: '' }, farm).centerPoint, null)
  for (const change of [{ longitude: '1', latitude: '' }, { longitude: '181', latitude: '1' }, { area: '-1' }, { area: 'Infinity' }]) {
    assert.throws(() => actions.farmBody({ name: 'F', area: '', longitude: '', latitude: '', ...change }, farm))
  }
})
test('farm update uses PUT and propagates concurrency without retry', async () => {
  let count = 0
  globalThis.fetch = async (url, options) => {
    count++
    assert.equal(url, 'http://test.local/api/farms/farm%2Fid')
    assert.equal(options.method, 'PUT')
    assert.equal(JSON.parse(options.body).expectedVersion, 7)
    return Response.json({ errorCode: 'Farm.ConcurrentUpdate' }, { status: 409 })
  }
  await assert.rejects(api.updateFarm('token', 'farm/id', { expectedVersion: 7 }), e => e.code === 'Farm.ConcurrentUpdate')
  assert.equal(count, 1)
})
test('member role/status strings and transfer-owner body match BE', async () => {
  const calls = []
  globalThis.fetch = async (url, options) => { calls.push([url, options.method, JSON.parse(options.body)]); return new Response(null, { status: 204 }) }
  await api.changeMemberRole('t', 'u', 'TENANT_ADMIN')
  await api.changeMemberStatus('t', 'u', 'INACTIVE')
  await api.transferOwnership('t', 'u')
  assert.deepEqual(calls, [
    ['http://test.local/api/tenants/current/members/u/role', 'PUT', { role: 'TENANT_ADMIN' }],
    ['http://test.local/api/tenants/current/members/u/status', 'PUT', { status: 'INACTIVE' }],
    ['http://test.local/api/tenants/current/transfer-ownership', 'POST', { newOwnerUserId: 'u' }],
  ])
})
test('invitations use absolute routes, acceptance is anonymous and blanks are nullable', async () => {
  const calls = []
  globalThis.fetch = async (url, options) => { calls.push([url, options]); return Response.json({ invitationId: 'i' }) }
  await actions.inviteAction('token').run({ email: ' a@example.test ' })
  await actions.acceptAction().run({ token: ' abc ', fullName: '', phone: '', password: '' })
  assert.equal(calls[0][0], 'http://test.local/current/invitations/tenant-admin')
  assert.equal(calls[1][0], 'http://test.local/invitations/accept')
  assert.equal(calls[1][1].headers.Authorization, undefined)
  assert.deepEqual(JSON.parse(calls[1][1].body), { token: 'abc', fullName: null, phone: null, password: null })
})
test('all management lists request the selected page', async () => {
  const urls = []
  globalThis.fetch = async url => { urls.push(url); return Response.json({ items: [], totalCount: 0 }) }
  await api.getMembers('t', 2); await api.getTenants('t', 3); await api.getUsers('t', 4); await api.getMemberships('t', 'u/id', 2)
  assert.deepEqual(urls, [
    'http://test.local/tenants/current/users?pageNumber=2&pageSize=20',
    'http://test.local/api/system/tenants/all?pageNumber=3&pageSize=20',
    'http://test.local/api/users?pageNumber=4&pageSize=20',
    'http://test.local/api/system/users/u%2Fid/tenants?pageNumber=2&pageSize=20',
  ])
})
test('system tenant and membership actions support bodyless 204 responses', async () => {
  const calls = []
  globalThis.fetch = async (url, options) => { calls.push([url, options.method, options.body]); return new Response(null, { status: 204 }) }
  await api.setTenantActive('t', 'tenant', false)
  await api.setMembershipActive('t', 'membership', true)
  assert.deepEqual(calls, [
    ['http://test.local/api/system/tenants/tenant/deactivate', 'PUT', undefined],
    ['http://test.local/api/system/tenant-memberships/membership/activate', 'PUT', undefined],
  ])
})
test('create tenant and provision owner match contract field names', async () => {
  const calls = []
  globalThis.fetch = async (url, options) => { calls.push([url, options.method, JSON.parse(options.body)]); return Response.json({ id: 't' }) }
  await api.createTenant('token', { tenantCode: 'FARM', tenantName: 'Đơn vị' })
  await api.provisionOwner('token', 't', 'owner@example.test')
  assert.deepEqual(calls, [
    ['http://test.local/api/system/tenants', 'POST', { tenantCode: 'FARM', tenantName: 'Đơn vị' }],
    ['http://test.local/api/system/tenants/t/owner-provisionings', 'POST', { email: 'owner@example.test' }],
  ])
})
test('forms reject empty required values and malformed emails before a request', () => {
  assert.throws(() => actions.validate([actions.emailField], { email: 'not-email' }))
  assert.throws(() => actions.validate([{ key: 'name', label: 'Tên', max: 3 }], { name: '    ' }))
  assert.throws(() => actions.validate([{ key: 'name', label: 'Tên', max: 3 }], { name: 'abcd' }))
  assert.doesNotThrow(() => actions.validate([actions.emailField], { email: 'ok@example.test' }))
})

