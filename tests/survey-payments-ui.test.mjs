import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createServer } from 'vite'
import { confirmedOrder, orderId, ownerOrder, paidServiceOrder, paymentItem } from './owner-payment-fixtures.mjs'

test('Owner screens render paginated orders, appointment actions, payment eligibility and server-only results', async () => {
  const server = await createServer({ configFile: false, logLevel: 'silent', server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } })
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage')
  const originalFetch = globalThis.fetch
  const clients = []
  try {
    let fetches = 0
    globalThis.fetch = async () => { fetches++; throw new Error('No request should be initiated during fixture render') }
    const { AuthProvider } = await server.ssrLoadModule('/src/features/auth/AuthContext.tsx')
    const { OwnerPaymentsPage } = await server.ssrLoadModule('/src/features/surveys/OwnerPaymentsPage.tsx')
    const { ApiError } = await server.ssrLoadModule('/src/api/client.ts')
    function render(role, payments, { path = '/survey-payments/' + orderId, order = confirmedOrder, tenantId = 'tenant', list = [ownerOrder] } = {}) {
      Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: { getItem: () => JSON.stringify({ role, fullName: 'Owner', email: 'owner@example.test', phone: null, accessToken: 'test-token', expiresAt: '2099-01-01T00:00:00Z', tenant: { id: tenantId, name: 'An Phu', code: 'ANPHU' } }) } })
      const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false, gcTime: Infinity, staleTime: Infinity } } })
      clients.push(client)
      function seed(key, value) {
        if (value instanceof Error) client.getQueryCache().build(client, { queryKey: key }).setState({ status: 'error', error: value, fetchStatus: 'idle' })
        else client.setQueryData(key, value)
      }
      seed(['owner-survey-order', tenantId, orderId], order)
      seed(['owner-payment-history', tenantId, orderId], payments instanceof Error ? payments : { surveyOrderId: orderId, payments })
      const url = new URL(path, 'http://test.local')
      seed(['owner-survey-orders', tenantId, Number(url.searchParams.get('page') ?? 1), ''], { items: list, pageNumber: 1, pageSize: 20, totalCount: 41 })
      const html = renderToStaticMarkup(h(QueryClientProvider, { client }, h(MemoryRouter, { initialEntries: [path] }, h(AuthProvider, null, h(Routes, null,
        h(Route, { path: '/survey-payments', element: h(OwnerPaymentsPage) }),
        h(Route, { path: '/survey-payments/return', element: h(OwnerPaymentsPage) }),
        h(Route, { path: '/survey-payments/:orderId', element: h(OwnerPaymentsPage) }),
      )))))
      assert.equal(client.getQueryCache().getAll().some(query => ['farm-members', 'assignable-users', 'members'].includes(query.queryKey[0])), false)
      return html
    }
    const button = (html, label) => [...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].map(match => match[0]).find(value => value.includes('>' + label + '<'))
    const proposed = render('OWNER', [], { order: ownerOrder })
    assert.match(proposed, /Sao chép mã đơn/)
    assert.match(proposed, /Long An/)
    assert.match(proposed, /01\/01\/2099|1\/1\/2099/)
    assert.ok(button(proposed, 'Xác nhận lịch'))
    assert.doesNotMatch(button(proposed, 'Xác nhận lịch'), /disabled=""/)
    assert.doesNotMatch(proposed, /Chưa thể tạo thanh toán mới|Thông tin đơn và lịch hẹn chưa sẵn sàng/)
    const ready = render('OWNER', [])
    assert.doesNotMatch(button(ready, 'Thanh toán'), /disabled=""/)
    const pending = render('OWNER', [paymentItem], { path: '/survey-payments/' + orderId + '?status=success&orderVersion=999&amount=1' })
    assert.match(pending, /Đang xử lý/)
    assert.match(pending, /10\.000/)
    assert.match(pending, /Đã có giao dịch đang xử lý/)
    assert.match(button(pending, 'Thanh toán'), /disabled=""/)
    assert.doesNotMatch(pending, /Đã thanh toán|Mở trang thanh toán/)
    const paid = render('OWNER', [{ ...paymentItem, status: 'PAID' }])
    assert.match(paid, /Đã thanh toán/)
    assert.match(button(paid, 'Thanh toán'), /disabled=""/)
    assert.match(render('OWNER', []), /Chưa có giao dịch/)
    const zero = render('OWNER', [], { order: { ...paidServiceOrder, remainingAmount: 0 } })
    assert.doesNotMatch(button(zero, 'Hoàn tất số dư 0'), /disabled=""/)
    const expired = render('OWNER', [], { order: { ...confirmedOrder, currentAppointment: { ...confirmedOrder.currentAppointment, endAt: '2000-01-01T00:00:00Z' } } })
    assert.match(button(expired, 'Thanh toán'), /disabled=""/)
    const reschedule = render('OWNER', [], { order: { ...ownerOrder, currentAppointment: { ...ownerOrder.currentAppointment, status: 'RESCHEDULE_REQUESTED' } } })
    assert.match(reschedule, /Chờ Manager đề xuất thời gian mới/)
    assert.doesNotMatch(reschedule, /<span>Xác nhận lịch<\/span>/)
    const error = render('OWNER', new ApiError(403, 'Forbidden', 'Payment.Forbidden', 'read-trace'))
    assert.match(error, /read-trace/)
    assert.match(error, /Chưa tải được lịch sử/)
    assert.doesNotMatch(error, /Chưa có giao dịch/)
    assert.match(button(error, 'Thanh toán'), /disabled=""/)
    const orderError = render('OWNER', [], { order: new ApiError(404, 'Not found', 'SurveyOrder.NotFound', 'order-trace') })
    assert.match(orderError, /order-trace/)
    assert.doesNotMatch(orderError, /Lịch sử thanh toán|SO-OWNER-1/)
    const unavailable = render('OWNER', [], { order: new ApiError(502, 'Bad Gateway') })
    assert.match(unavailable, /Chưa kết nối được máy chủ/)
    const list = render('OWNER', [], { path: '/survey-payments?page=3' })
    assert.match(list, /SO-OWNER-1/)
    const generatedOrderNumber = 'SO-01a17d91fc96732abaff93fb21b78d89'
    const generatedDetail = render('OWNER', [], { order: { ...confirmedOrder, orderNumber: generatedOrderNumber } })
    assert.doesNotMatch(generatedDetail.replace(/<[^>]*>/g, ''), new RegExp(generatedOrderNumber))
    assert.match(generatedDetail, /<h1>Long An<\/h1>/)
    assert.match(generatedDetail, /Sao chép mã đơn/)
    const generatedList = render('OWNER', [], { path: '/survey-payments', list: [{ ...ownerOrder, orderNumber: generatedOrderNumber }] })
    assert.doesNotMatch(generatedList.replace(/<[^>]*>/g, ''), new RegExp(generatedOrderNumber))
    assert.match(generatedList, new RegExp('/survey-payments/' + orderId))
    assert.match(list, /Xem đơn &amp; thanh toán/)
    assert.match(list, /ant-pagination-item-3 ant-pagination-item-active/)
    const returned = render('OWNER', [], { path: '/survey-payments/return?status=success' })
    assert.match(returned, /Kiểm tra kết quả thanh toán/)
    assert.doesNotMatch(returned, /Đã thanh toán/)
    for (const role of ['MEMBER', 'TENANT_ADMIN', 'SYSTEM_MANAGER']) {
      const forbidden = render(role, [paymentItem])
      assert.match(forbidden, /Bạn không có quyền truy cập/)
      assert.doesNotMatch(forbidden, /Lịch sử thanh toán|SO-OWNER-1/)
    }
    assert.match(render('OWNER', [], { path: '/survey-payments/not-a-guid' }), /Liên kết đơn khảo sát không hợp lệ/)
    assert.equal(fetches, 0)
  } finally {
    clients.forEach(client => client.clear())
    globalThis.fetch = originalFetch
    if (originalStorage) Object.defineProperty(globalThis, 'sessionStorage', originalStorage)
    else delete globalThis.sessionStorage
    await server.close()
  }
})
