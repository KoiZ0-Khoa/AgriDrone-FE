import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'vite'

test('Admin V3 uses the commercial-policy API and sends versioned configuration', async () => {
  const server = await createServer({ configFile: false, logLevel: 'silent', server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } })
  const originalFetch = globalThis.fetch
  try {
    const { getCommercialPolicies } = await server.ssrLoadModule('/src/features/surveys/commercialPoliciesApi.ts')
    const { activationAction, bundleAction, createServiceAction, policyActions, priceAction, revisionAction } =
      await server.ssrLoadModule('/src/features/surveys/commercialPolicyActions.ts')

    const root = '/api/v3/system-admin/commercial-policies/'
    const requests = []
    let hasReadApi = true
    globalThis.fetch = async (input, options) => {
      const url = new URL(input, 'http://test.local')
      assert.ok(url.pathname.startsWith(root))
      assert.equal(options.headers.Authorization, 'Bearer admin-token')
      const resource = url.pathname.slice(root.length)
      if (options.method === 'POST') {
        requests.push([resource, JSON.parse(options.body)])
        return Response.json({})
      }
      if (resource === 'activations') return new Response(null, { status: 404 })
      if (!hasReadApi) return new Response(null, { status: 405 })
      if (resource === 'bundle-versions') assert.equal(url.searchParams.get('streamKey'), 'DEFAULT_BUNDLE')
      const offset = url.searchParams.get('offset')
      assert.equal(url.searchParams.get('limit'), '100')
      return Response.json(resource === 'prices' && offset === '0'
        ? Array.from({ length: 100 }, (_, i) => ({ id: `price-${i}` }))
        : resource === 'prices' ? [{ id: 'last-price' }] : [])
    }

    const token = 'admin-token'
    const empty = await getCommercialPolicies(token, new AbortController().signal)
    assert.equal(empty.activation, null)
    assert.equal(empty.prices.length, 101)
    assert.equal(empty.prices.at(-1).id, 'last-price')
    hasReadApi = false
    await assert.rejects(getCommercialPolicies(token, new AbortController().signal), { status: 405 })
    const service = { id: 'service', code: 'COMBO', status: 'ACTIVE', name: 'Combo', description: 'Bản đồ và khảo sát' }
    const revision = { id: 'revision', surveyServiceId: service.id, versionNumber: 4, effectiveFrom: '2020-01-01T00:00:00Z' }
    const effective = { effectiveFrom: '2020-01-01T00:00:00Z', effectiveTo: null }
    const price = { id: 'price', versionNumber: 7, surveyServiceId: service.id, ...effective }
    const bundle = { id: 'bundle', versionNumber: 6, ...effective }
    const data = {
      ...empty,
      services: [service], revisions: [revision], prices: [price],
      deposits: [{ id: 'deposit', versionNumber: 2, amount: 500000, currency: 'VND', ...effective }],
      claims: [{ id: 'claim', versionNumber: 3, ...effective }],
      cancellations: [{ id: 'cancel', versionNumber: 5, ...effective }],
      bundles: [bundle],
    }
    const audit = { reason: 'TEST' }
    const details = { name: service.name, description: service.description }
    await createServiceAction(token, 'COMBO').run(details)
    await revisionAction(token, service, revision).run({ ...details, ...audit })
    assert.throws(() => priceAction(token, service, price).run({ ...audit, price: '2.5' }), /số nguyên/)
    await priceAction(token, service, price).run({ ...audit, price: '2500' })
    const policies = policyActions(token, data)
    await policies.deposit.run({ ...audit, amount: '500000' })
    await policies.claim.run({ ...audit, days: '7', timeZone: 'Asia/Ho_Chi_Minh', excludeNoticeDate: 'true' })
    await policies.cancellation.run({ ...audit, before: 'true', after: 'true', noShow: '1', postponement: 'false', failure: 'true' })
    const now = Date.parse('2026-11-26T00:00:00Z')
    assert.equal(bundleAction(token, { ...data, prices: [] }, now), null)
    await bundleAction(token, data, now).run({ ...audit, services: revision.id })
    const activation = activationAction(token, bundle, null)
    assert.deepEqual(activation.fields.slice(0, 3).map(field => field.value), ['false', 'false', 'false'])
    await activation.run({ ...audit, intake: 'true', capture: 'true', release: 'true' })
    const notes = { reasonCode: 'TEST', evidenceReference: null }
    assert.deepEqual(requests, [
      ['services', { code: 'COMBO', activateImmediately: true, ...details }],
      ['revisions', { surveyServiceId: 'service', mapsPoles: true, screensDisease: true, expectedLatestVersionNumber: 4, ...details, ...notes }],
      ['prices', { surveyServiceId: 'service', pricePerPole: 2500, currency: 'VND', expectedLatestPriceVersion: 7, ...notes }],
      ['deposit-policies', { amount: 500000, currency: 'VND', expectedLatestVersion: 2, ...notes }],
      ['claim-policies', { calendarWindowDays: 7, timeZoneId: 'Asia/Ho_Chi_Minh', excludeNoticeDate: true, expectedLatestVersion: 3, ...notes }],
      ['cancellation-policies', { refundableBeforeCapture: true, retainDepositAfterCapture: true, allowedFreeNoShowReschedules: 1, operationalPostponementRefundable: false, serviceFailureRefundable: true, expectedLatestVersion: 5, ...notes }],
      ['bundle-versions', { streamKey: 'DEFAULT_BUNDLE', serviceRevisionIds: ['revision'], depositPolicyId: 'deposit', claimPolicyId: 'claim', cancellationPolicyId: 'cancel', pricingCurrency: 'VND', expectedLatestVersion: 6, ...notes }],
      ['activations', { targetPolicyVersionId: 'bundle', publicIntakeEnabled: true, captureEnabled: true, releaseEnabled: true, expectedLastDecisionId: '00000000-0000-0000-0000-000000000000', decisionReasonCode: 'TEST', decisionEvidenceReference: null }],
    ])
  } finally {
    globalThis.fetch = originalFetch
    await server.close()
  }
})
