import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { afterEach, test } from 'node:test'
import ts from 'typescript'

const compile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const dataUrl = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64')
const client = dataUrl(compile('../src/api/client.ts').replace('import.meta.env.VITE_API_BASE_URL', "'http://test.local'"))
const api = await import(dataUrl(compile('../src/features/surveys/paymentPolicyApi.ts').replace("'../../api/client'", JSON.stringify(client))))
const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })

test('policy validation permits no deposit and rejects fractional VND or a 100 percent Combo', () => {
  assert.deepEqual(api.depositPolicyBody('0', 0), { amountVnd: 0, expectedVersion: 0 })
  assert.deepEqual(api.depositPolicyBody('5000', 7), { amountVnd: 5000, expectedVersion: 7 })
  for (const value of ['', '-1', '1.1', '1,1', 'NaN', 'Infinity', '1e3', '9007199254740992']) assert.throws(() => api.depositPolicyBody(value, 1))
  assert.deepEqual(api.comboDiscountBody('99.99', 4), { discountPercentage: 99.99, expectedVersion: 4 })
  assert.deepEqual(api.comboDiscountBody('20,25', 0), { discountPercentage: 20.25, expectedVersion: 0 })
  assert.deepEqual(api.comboDiscountBody('0', 0), { discountPercentage: 0, expectedVersion: 0 })
  for (const value of ['', '-1', '100', '100.00', '99.999', '1e1', 'Infinity']) assert.throws(() => api.comboDiscountBody(value, 1))
  for (const version of [-1, 1.1, undefined, 2147483648]) {
    assert.throws(() => api.depositPolicyBody('0', version))
    assert.throws(() => api.comboDiscountBody('20', version))
  }
})

test('Admin reads current policies and history with bearer authorization and cancellation', async () => {
  const abort = new AbortController()
  for (const [read, suffix] of [
    [api.getDepositPolicy, '/survey-deposit/current'], [api.getDepositPolicyHistory, '/survey-deposit/versions'],
    [api.getComboDiscountPolicy, '/survey-combo-discount/current'], [api.getComboDiscountHistory, '/survey-combo-discount/versions'],
  ]) {
    globalThis.fetch = async (url, options) => {
      assert.equal(url, 'http://test.local/api/system-admin' + suffix)
      assert.equal(options.headers.Authorization, 'Bearer admin')
      assert.equal(options.signal, abort.signal)
      assert.equal(options.body, undefined)
      return Response.json({ versionNumber: 0 })
    }
    await read('admin', abort.signal)
  }
})

test('saving policies preserves the observed version and never retries a conflict', async () => {
  let calls = 0
  for (const [save, value, route, body] of [
    [api.saveDepositPolicy, '0', 'survey-deposit', { amountVnd: 0, expectedVersion: 7 }],
    [api.saveComboDiscountPolicy, '20.25', 'survey-combo-discount', { discountPercentage: 20.25, expectedVersion: 7 }],
  ]) {
    globalThis.fetch = async (url, options) => {
      calls++
      assert.equal(url, 'http://test.local/api/system-admin/' + route + '/versions')
      assert.equal(options.method, 'POST')
      assert.deepEqual(JSON.parse(options.body), body)
      return Response.json({ errorCode: 'Policy.VersionConflict', traceId: 'policy-trace', message: 'Reload' }, { status: 409 })
    }
    await assert.rejects(save('admin', value, 7), error => error.status === 409 && error.traceId === 'policy-trace')
  }
  assert.equal(calls, 2)
})
