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
