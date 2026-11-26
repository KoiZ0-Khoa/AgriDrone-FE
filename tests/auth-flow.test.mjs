import { readFileSync } from 'node:fs'
import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'

const compile = file => ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023 } }).outputText
const dataUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
const clientUrl = dataUrl(compile('../src/api/client.ts').replace('import.meta.env.VITE_API_BASE_URL', "'http://test.local'"))
const { ApiError } = await import(clientUrl)
const auth = await import(dataUrl(compile('../src/features/auth/authApi.ts').replace("'../../api/client'", JSON.stringify(clientUrl))))
const errors = await import(dataUrl(compile('../src/features/auth/authErrors.ts').replace("'../../api/client'", JSON.stringify(clientUrl))))
const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })

test('multi-tenant login forwards the issued selection token unchanged in the JSON body', async () => {
  const selection = { selectionToken: 'selection.token.signature', expiresAt: '2099-01-01T00:00:00Z', tenants: [{ id: 'tenant-a' }, { id: 'tenant-b' }] }
  globalThis.fetch = async (url, options) => {
    assert.equal(options.method, 'POST')
    assert.equal(options.headers.Authorization, undefined)
    if (url.endsWith('/login')) return Response.json({ session: null, tenantSelection: selection })
    assert.equal(url, 'http://test.local/api/auth/select-tenant')
    assert.deepEqual(JSON.parse(options.body), { selectionToken: selection.selectionToken, tenantId: 'tenant-b' })
    return Response.json({ session: { accessToken: 'access-token' }, tenantSelection: null })
  }
  const response = await auth.loginUser({ email: 'test@example.test', password: 'test-only' })
  errors.assertTenantSelectionFresh(response.tenantSelection)
  const result = await auth.selectTenant(response.tenantSelection.selectionToken, 'tenant-b')
  assert.equal(result.session.accessToken, 'access-token')
})

test('fresh selection is accepted; expired, missing and malformed selections require login', () => {
  const now = Date.parse('2026-09-17T10:00:00Z')
  const fresh = { selectionToken: 'token', expiresAt: '2026-09-17T10:05:00Z', tenants: [] }
  assert.doesNotThrow(() => errors.assertTenantSelectionFresh(fresh, now))
  for (const selection of [null, { ...fresh, selectionToken: '' }, { ...fresh, expiresAt: 'invalid' }, { ...fresh, expiresAt: '2026-09-17T10:00:00Z' }, { ...fresh, expiresAt: '2026-09-17T09:59:59Z' }]) {
    assert.throws(() => errors.assertTenantSelectionFresh(selection, now), error => errors.requiresFreshTenantLogin(error))
  }
})

test('401 at tenant selection is not shown as an incorrect password', () => {
  const rejected = new ApiError(401, 'The tenant selection token is invalid or expired.', 'Authentication.InvalidTenantSelectionToken')
  assert.match(errors.getAuthErrorMessage(rejected, 'tenant-selection'), /Phiên chọn đơn vị/)
  assert.doesNotMatch(errors.getAuthErrorMessage(rejected, 'tenant-selection'), /mật khẩu/)
  assert.equal(errors.requiresFreshTenantLogin(rejected), true)
  assert.equal(errors.getAuthErrorMessage(new ApiError(401, 'Unauthorized'), 'login'), 'Email hoặc mật khẩu không đúng.')
})

test('membership access denial and network failures do not invalidate selection as expired', () => {
  const denied = new ApiError(403, 'Access denied', 'Tenant.AccessDenied')
  assert.equal(errors.requiresFreshTenantLogin(denied), false)
  assert.match(errors.getAuthErrorMessage(denied, 'tenant-selection'), /quyền vào đơn vị/)
  assert.match(errors.getAuthErrorMessage(new TypeError('Failed to fetch'), 'tenant-selection'), /Không kết nối/)
})

const client = await import(clientUrl)

test('login and tenant selection ask BE for a refresh cookie (session header + credentials include)', async () => {
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({ url, credentials: options.credentials, session: options.headers['X-AgriDrone-Session'] })
    return Response.json({ session: { accessToken: 'access-token' }, tenantSelection: null })
  }
  await auth.loginUser({ email: 'test@example.test', password: 'test-only' })
  await auth.selectTenant('selection', 'tenant-a')
  assert.deepEqual(calls, [
    { url: 'http://test.local/api/auth/login', credentials: 'include', session: '1' },
    { url: 'http://test.local/api/auth/select-tenant', credentials: 'include', session: '1' },
  ])
})

test('login still works without a refresh cookie when BE rejects the origin for cookie sessions', async () => {
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push(options.headers['X-AgriDrone-Session'])
    return options.headers['X-AgriDrone-Session']
      ? Response.json({ errorCode: 'Authentication.InvalidOrigin', detail: 'Request origin is not permitted for cookie authentication.' }, { status: 403 })
      : Response.json({ session: { accessToken: 'access-token' }, tenantSelection: null })
  }
  const response = await auth.loginUser({ email: 'test@example.test', password: 'test-only' })
  assert.equal(response.session.accessToken, 'access-token')
  assert.deepEqual(calls, ['1', undefined])
})

test('wrong password is not retried as a cookie-origin problem', async () => {
  let count = 0
  globalThis.fetch = async () => { count++; return Response.json({ errorCode: 'Authentication.InvalidCredentials' }, { status: 401 }) }
  await assert.rejects(() => auth.loginUser({ email: 'test@example.test', password: 'wrong' }), error => error.status === 401)
  assert.equal(count, 1)
})

test('refresh and logout POST to the cookie routes with the session header and no bearer token', async () => {
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({ url, method: options.method, credentials: options.credentials, session: options.headers['X-AgriDrone-Session'], auth: options.headers.Authorization })
    return url.endsWith('/logout') ? new Response(null, { status: 204 }) : Response.json({ session: { accessToken: 'next' } })
  }
  const refreshed = await auth.refreshSession()
  assert.equal(refreshed.session.accessToken, 'next')
  await auth.logoutSession()
  assert.deepEqual(calls, [
    { url: 'http://test.local/api/auth/refresh', method: 'POST', credentials: 'include', session: '1', auth: undefined },
    { url: 'http://test.local/api/auth/logout', method: 'POST', credentials: 'include', session: '1', auth: undefined },
  ])
})

test('a 401 with a bearer token refreshes once and retries the same request with the new token', async () => {
  const seen = []
  const refreshedFor = []
  client.setAccessTokenRefresher(async expired => { refreshedFor.push(expired); return 'fresh-token' })
  try {
    globalThis.fetch = async (url, options) => {
      seen.push(options.headers.Authorization)
      return options.headers.Authorization === 'Bearer fresh-token' ? Response.json({ ok: true }) : new Response(null, { status: 401 })
    }
    assert.deepEqual(await client.apiRequest('/api/things', { token: 'stale-token' }), { ok: true })
    assert.deepEqual(seen, ['Bearer stale-token', 'Bearer fresh-token'])
    assert.deepEqual(refreshedFor, ['stale-token'])
  } finally {
    client.setAccessTokenRefresher(null)
  }
})

test('when refresh fails the original 401 surfaces; anonymous 401s never trigger a refresh', async () => {
  let refreshCalls = 0
  client.setAccessTokenRefresher(async () => { refreshCalls++; return null })
  try {
    globalThis.fetch = async () => new Response(null, { status: 401 })
    await assert.rejects(() => client.apiRequest('/api/things', { token: 'stale-token' }), error => error.status === 401)
    await assert.rejects(() => client.apiRequest('/api/public', {}), error => error.status === 401)
    assert.equal(refreshCalls, 1)
  } finally {
    client.setAccessTokenRefresher(null)
  }
})

test('concurrent refresh calls share one request so BE never sees the same refresh cookie twice', async () => {
  let count = 0
  let release
  globalThis.fetch = async () => { count++; await new Promise(resolve => { release = resolve }); return Response.json({ session: { accessToken: 'next' } }) }
  const first = auth.refreshSession()
  const second = auth.refreshSession()
  await new Promise(resolve => setTimeout(resolve, 0))
  release()
  assert.equal((await first).session.accessToken, 'next')
  assert.equal((await second).session.accessToken, 'next')
  assert.equal(count, 1)
  globalThis.fetch = async () => { count++; return Response.json({ session: { accessToken: 'later' } }) }
  assert.equal((await auth.refreshSession()).session.accessToken, 'later')
  assert.equal(count, 2)
})
