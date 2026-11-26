import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'vite'

test('Admin cancel decision uses the V3 route, order version and replay key', async () => {
  const server = await createServer({ configFile: false, logLevel: 'silent', server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } })
  const originalFetch = globalThis.fetch
  try {
    const { readAuthUserId } = await server.ssrLoadModule('/src/features/auth/authStorage.ts')
    const { systemOrderCancellationAction } = await server.ssrLoadModule('/src/features/surveys/systemOrderActions.ts')
    const orderId = '809340af-0243-46a8-ad75-383c0217569b'
    const userId = '8394b473-54c7-44b9-84c7-b25f95127d2a'
    const token = 'header.' + Buffer.from(JSON.stringify({ sub: userId })).toString('base64url') + '.signature'
    assert.equal(readAuthUserId(token), userId)
    assert.equal(readAuthUserId('bad-token'), null)

    const requests = []
    globalThis.fetch = async (input, options) => {
      assert.equal(new URL(input).pathname, `/api/v3/system-admin/survey-orders/${orderId}/cancellation-decisions`)
      assert.equal(options.method, 'POST')
      assert.equal(options.headers.Authorization, `Bearer ${token}`)
      requests.push(JSON.parse(options.body))
      return Response.json({ success: true, orderId })
    }

    const order = { surveyOrderId: orderId, surveyServiceCode: 'MAP', status: 'AWAITING_REFLIGHT_DECISION', orderVersion: 52, farmName: 'Hàm Thuận' }
    const action = systemOrderCancellationAction(token, readAuthUserId(token), order)
    const values = { kind: 'SERVICE_FAILURE', reason: '  Chuyến bay không thể thực hiện lại.  ' }
    await action.run(values)
    await action.run(values)
    await action.run({ ...values, kind: 'OPERATIONAL_POSTPONEMENT' })
    const [submitted, retry, newDecision] = requests
    const { operationId, payloadFingerprint, ...body } = submitted
    assert.deepEqual(body, {
      requesterId: userId, decisionKind: 'SERVICE_FAILURE', requestedRetentionAmount: 0,
      reasonCode: 'SERVICE_FAILURE', reasonDescription: 'Chuyến bay không thể thực hiện lại.', expectedOrderVersion: 52,
    })
    assert.match(operationId, /^[0-9a-f-]{36}$/)
    assert.match(payloadFingerprint, /^[0-9a-f]{64}$/)
    assert.deepEqual(retry, submitted)
    assert.notEqual(newDecision.operationId, operationId)
    await assert.rejects(action.run({ ...values, kind: 'CUSTOMER_BEFORE_CAPTURE' }), /chọn trường hợp/)
    assert.equal(requests.length, 3)
  } finally {
    globalThis.fetch = originalFetch
    await server.close()
  }
})
