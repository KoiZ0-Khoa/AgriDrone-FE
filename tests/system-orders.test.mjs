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

