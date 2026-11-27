import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createServer } from 'vite'
import { confirmedOrder, orderId, ownerInvoice, ownerOrder, settlementOrder, paymentItem } from './owner-payment-fixtures.mjs'

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
    function render(role, payments, { path = '/survey-payments/' + orderId, order = confirmedOrder, invoice = null, tenantId = 'tenant', list = [ownerOrder] } = {}) {
      Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: { getItem: () => JSON.stringify({ role, fullName: 'Owner', email: 'owner@example.test', phone: null, accessToken: 'test-token', expiresAt: '2099-01-01T00:00:00Z', tenant: { id: tenantId, name: 'An Phu', code: 'ANPHU' } }) } })
      const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false, gcTime: Infinity, staleTime: Infinity } } })
      clients.push(client)
      function seed(key, value) {
        if (value instanceof Error) client.getQueryCache().build(client, { queryKey: key }).setState({ status: 'error', error: value, fetchStatus: 'idle' })
        else client.setQueryData(key, value)
      }
      seed(['owner-survey-order', tenantId, orderId], order)
      seed(['owner-survey-invoice', tenantId, orderId], invoice)
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
    const v3Proposed = ownerOrder
    const proposed = render('OWNER', [], { order: v3Proposed })
    assert.match(proposed, /Sao chép mã đơn/)
    assert.match(proposed, /Long An/)
    assert.match(proposed, /01\/01\/2099|1\/1\/2099/)
    assert.ok(button(proposed, 'Xác nhận lịch'))
    assert.doesNotMatch(button(proposed, 'Xác nhận lịch'), /disabled=""/)
    assert.ok(button(proposed, 'Yêu cầu đổi lịch'))
    assert.match(proposed, /Lịch bay/)
    assert.doesNotMatch(proposed, /Bay bệnh|Manager chốt lịch bay bệnh|Khảo sát bản đồ nền/)
    assert.doesNotMatch(proposed, /Chưa thể tạo thanh toán mới|Thông tin đơn và lịch hẹn chưa sẵn sàng/)
    const ready = render('OWNER', [])
    assert.doesNotMatch(button(ready, 'Trả cọc'), /disabled=""/)
    assert.match(ready, /Xem số tiền khi tạo phiên trả cọc/)
    assert.doesNotMatch(ready, /NaN|undefined/)
    const pending = render('OWNER', [paymentItem], { path: '/survey-payments/' + orderId + '?status=success&orderVersion=999&amount=1' })
    assert.match(pending, /Đang xử lý/)
    assert.match(pending, /10\.000/)
    assert.match(pending, /Đã có giao dịch cọc/)
    assert.match(button(pending, 'Trả cọc'), /disabled=""/)
    assert.doesNotMatch(pending, /Đã thanh toán|Mở trang thanh toán/)
    const paid = render('OWNER', [{ ...paymentItem, status: 'PAID' }])
    assert.match(paid, /Đã thanh toán/)
    assert.match(button(paid, 'Trả cọc'), /disabled=""/)
    assert.match(render('OWNER', []), /Chưa có giao dịch/)
    const finalInvoice = render('OWNER', [], { order: settlementOrder, invoice: ownerInvoice })
    for (const value of ['Số trụ tính phí', '1.500.000', '940.000']) assert.match(finalInvoice, new RegExp(value))
    assert.match(render('OWNER', [], { order: settlementOrder }), /Hóa đơn được hiển thị sau khi chốt kết quả khảo sát/)
    assert.equal(button(finalInvoice, 'Trả cọc'), undefined)
    assert.equal(button(finalInvoice, 'Thanh toán'), undefined)
    const legacyDeposit = render('OWNER', [], { order: { ...confirmedOrder, status: 'AWAITING_BASELINE_DEPOSIT' } })
    assert.equal(button(legacyDeposit, 'Trả cọc'), undefined)
    // V3: lịch đã xác nhận, chờ cọc → còn đổi được lịch, không xác nhận lại.
    const v3Confirmed = render('OWNER', [], { order: { ...v3Proposed, status: 'AWAITING_DEPOSIT', currentAppointment: { ...v3Proposed.currentAppointment, status: 'CONFIRMED' } } })
    assert.match(v3Confirmed, /Đã xác nhận/)
    assert.ok(button(v3Confirmed, 'Yêu cầu đổi lịch'))
    assert.equal(button(v3Confirmed, 'Xác nhận lịch'), undefined)
    // V3: đã yêu cầu đổi lịch / vắng mặt → chờ Manager đề xuất lại, không còn nút.
    const v3Reschedule = render('OWNER', [], { order: { ...v3Proposed, currentAppointment: { ...v3Proposed.currentAppointment, status: 'RESCHEDULE_REQUESTED' } } })
    assert.match(v3Reschedule, /Chờ Manager đề xuất thời gian mới/)
    assert.doesNotMatch(v3Reschedule, /<span>Xác nhận lịch<\/span>|<span>Yêu cầu đổi lịch<\/span>/)
    // V3: đã bắt đầu bay → hết đổi lịch.
    assert.equal(button(render('OWNER', [], { order: { ...v3Proposed, status: 'CAPTURING', currentAppointment: { ...v3Proposed.currentAppointment, status: 'CONFIRMED' } } }), 'Yêu cầu đổi lịch'), undefined)
    const readyToFly = render('OWNER', [], { order: { ...confirmedOrder, status: 'READY_FOR_CAPTURE' } })
    assert.match(readyToFly, /Đơn đã đủ điều kiện tiền cọc/)
    assert.equal(button(readyToFly, 'Trả cọc'), undefined)
    const diseaseFlight = render('OWNER', [], { order: { ...confirmedOrder, status: 'READY_FOR_CAPTURE',
      currentAppointment: { ...confirmedOrder.currentAppointment, purpose: 'DISEASE_CAPTURE', status: 'CONFIRMED' } } })
    assert.match(diseaseFlight, /Lịch bay bệnh/)
    assert.match(diseaseFlight, /Manager đã xác nhận lịch bay bệnh/)
    for (const action of ['Xác nhận lịch', 'Yêu cầu đổi lịch', 'Trả cọc', 'Hủy đơn khảo sát']) {
      assert.equal(button(diseaseFlight, action), undefined)
    }
    const refunded = render('OWNER', [{ ...paymentItem, status: 'REFUNDED' }])
    assert.doesNotMatch(button(refunded, 'Trả cọc'), /disabled=""/)
    const invalidated = render('OWNER', [{ ...paymentItem, status: 'INVALIDATED' }])
    assert.match(invalidated, /Đã vô hiệu hóa/)
    assert.doesNotMatch(button(invalidated, 'Trả cọc'), /disabled=""/)
    const adjustment = render('OWNER', [{ ...paymentItem, status: 'ADJUSTMENT_REQUIRED' }])
    assert.match(adjustment, /cần được quản trị viên đối soát/)
    assert.match(button(adjustment, 'Trả cọc'), /disabled=""/)
    const expired = render('OWNER', [], { order: { ...confirmedOrder, currentAppointment: { ...confirmedOrder.currentAppointment, endAt: '2000-01-01T00:00:00Z' } } })
    assert.match(button(expired, 'Trả cọc'), /disabled=""/)
    const reschedule = render('OWNER', [], { order: { ...ownerOrder, currentAppointment: { ...ownerOrder.currentAppointment, status: 'RESCHEDULE_REQUESTED' } } })
    assert.match(reschedule, /Chờ Manager đề xuất thời gian mới/)
    assert.doesNotMatch(reschedule, /<span>Xác nhận lịch<\/span>/)
    const error = render('OWNER', new ApiError(403, 'Forbidden', 'Payment.Forbidden', 'read-trace'))
    assert.match(error, /read-trace/)
    assert.match(error, /Chưa tải được lịch sử/)
    assert.doesNotMatch(error, /Chưa có giao dịch/)
    assert.match(button(error, 'Trả cọc'), /disabled=""/)
    const orderError = render('OWNER', [], { order: new ApiError(404, 'Not found', 'SurveyOrder.NotFound', 'order-trace') })
    assert.match(orderError, /order-trace/)
    assert.doesNotMatch(orderError, /Lịch sử thanh toán|SO-OWNER-1/)
    const unavailable = render('OWNER', [], { order: new ApiError(502, 'Bad Gateway') })
    assert.match(unavailable, /Chưa kết nối được máy chủ/)
    const list = render('OWNER', [], { path: '/survey-payments?page=3' })
    assert.match(list, /SO-OWNER-1/)
    assert.match(list, /Bản đồ và sức khỏe cây/)
    assert.doesNotMatch(list, /NaN|Tổng tiền/)
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
