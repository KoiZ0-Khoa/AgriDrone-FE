import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createServer } from 'vite'

// G7 — trang duyệt kết quả V3 với dữ liệu đúng dạng response BE.
const fp = char => char.repeat(64)
const tokens = { orderId: 'order', expectedOrderVersion: 40, expectedAttemptId: 'att', expectedCountSnapshotId: 'snap', expectedCountFingerprint: fp('a'), expectedComboBatchId: null, expectedComboSourceRevision: null, expectedComboBatchFingerprint: null, expectedComboReviewRevisionId: null, expectedComboReviewFingerprint: null }
const mapReview = { orderId: 'order', tenantId: 't', farmId: 'farm', orderVersion: 40, orderStatus: 'PROCESSING', serviceCode: 'MAP', screensDisease: false, mappingKind: 'FirstBaseline', captureAttemptId: 'att', captureAttemptVersion: 9, captureAttemptStatus: 'PROCESSING', missionId: 'm', farmBaseMapVersionId: 'map', baselineMapVersionId: 'base', farmBoundaryVersionId: 'b', mappingCandidateBatchId: 'mb', verifiedPoleCountSnapshotId: 'snap', verifiedBillablePoleCount: 1234, countSnapshotFingerprint: fp('a'), countSnapshotRevision: 1, currentApprovedResultRevisionId: null, currentApprovedResultFingerprint: null, comboPendingBatch: null, currentComboReview: null, expectedFreezeTokens: tokens }
const batch = {
  batchId: 'batch', jobId: 'job', sourceRevision: 2, canonicalFingerprint: fp('b'), producedAt: '2026-11-20T02:00:00Z', importedAt: '2026-11-20T02:01:00Z',
  blockingCount: 1, blockingReasons: ['BoundaryException:edge-1:OUTSIDE_BOUNDARY'], status: 'Pending', resultNature: 'PRELIMINARY', limitationNotice: 'Kết quả sơ bộ, không thay thế chẩn đoán',
  findings: [{ findingId: 'f1', findingVersion: 1, plantProfileId: null, mappingCandidateId: null, longitude: 106.1, latitude: 10.4, observedAt: '2026-11-20T01:00:00Z', suspectedClassCode: 'ANTHRACNOSE', classificationNature: 'SUSPECTED', confidence: 0.82, uncertainty: 'MEDIUM', limitations: [], evidenceMediaIds: ['img-f1'] }],
  boundaryExceptions: [], diseaseZones: [{ sourceProposalId: 'zone-1', geometry: { type: 'Polygon', coordinates: [] }, suspectedClassCode: 'ANTHRACNOSE', membershipVersion: 1, memberships: [{ findingId: 'f1', plantProfileId: null, mappingCandidateId: null, confidence: 0.8 }], guidanceCandidates: [{ guidanceId: 'g1', versionNumber: 3, code: 'SPRAY-A', sourceReference: 'ref' }], evidenceMediaIds: ['img-zone'] }],
}

test('V3 result review page renders MAP count and freeze, COMBO decisions, and the frozen state', async () => {
  const server = await createServer({ configFile: false, logLevel: 'silent', server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } })
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage')
  const clients = []
  try {
    const { AuthProvider } = await server.ssrLoadModule('/src/features/auth/AuthContext.tsx')
    const { ManagerResultReviewPage } = await server.ssrLoadModule('/src/features/surveys/ManagerResultReviewPage.tsx')
    const render = (review, invoice) => {
      Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: { getItem: () => JSON.stringify({ role: 'SYSTEM_MANAGER', fullName: 'M', email: 'm@example.test', phone: null, accessToken: 'test-token', expiresAt: '2099-01-01T00:00:00Z', tenant: null }) } })
      const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false, gcTime: Infinity, staleTime: Infinity } } })
      clients.push(client)
      client.setQueryData(['result-review', 'order'], review)
      if (invoice) client.setQueryData(['manager-survey-invoice', 'order'], invoice)
      return renderToStaticMarkup(h(QueryClientProvider, { client }, h(MemoryRouter, { initialEntries: ['/manager/orders/order/result-review'] }, h(AuthProvider, null, h(Routes, null, h(Route, { path: '/manager/orders/:orderId/result-review', element: h(ManagerResultReviewPage) }))))))
    }
    const map = render(mapReview)
    assert.match(map, /MAP · Bản đồ và đếm trụ/)
    assert.match(map, /1\.234 trụ/)
    assert.match(map, /Chưa chốt/)
    assert.match(map, /Chốt kết quả nội bộ/)
    assert.doesNotMatch(map, /Duyệt phát hiện, vùng bệnh và mục chặn/)
    assert.match(map, /href="\/manager\/orders\/order"/)

    const comboPending = render({ ...mapReview, serviceCode: 'COMBO', screensDisease: true })
    assert.match(comboPending, /Chạy nhận diện bệnh/)

    const combo = render({ ...mapReview, serviceCode: 'COMBO', screensDisease: true, comboPendingBatch: batch })
    assert.match(combo, /Duyệt phát hiện, vùng bệnh và mục chặn/)
    assert.match(combo, /ANTHRACNOSE/)
    assert.match(combo, /82%/)
    assert.match(combo, /SPRAY-A/) // chỉ một hướng dẫn: chọn sẵn
    assert.match(combo, /OUTSIDE_BOUNDARY/)
    assert.match(combo, /Còn mục chặn chưa xử lý/)
    assert.match(combo, /Kết quả sơ bộ, không thay thế chẩn đoán/)
    assert.match(combo, /Cần duyệt phát hiện, vùng bệnh và mục chặn trước khi chốt/)
    assert.match(combo, /<button[^>]*disabled[^>]*><span>Gửi kết quả duyệt<\/span><\/button>/)

    const frozen = render({ ...mapReview, orderStatus: 'AWAITING_SETTLEMENT', captureAttemptStatus: 'ACCEPTED', currentApprovedResultRevisionId: 'r1', currentApprovedResultFingerprint: fp('d') }, {
      orderId: 'order', invoiceRevisionNumber: 1, verifiedBillablePoleCount: 1234, pricePerPole: 100,
      currency: 'VND', totalAmount: 123400, validAllocatedDepositNet: 20000, confirmedNetReceipts: 20000,
      dueAmount: 103400, overpaymentAmount: 0, hasOpenReconciliation: false,
    })
    assert.match(frozen, /Đã chốt kết quả nội bộ/)
    assert.match(frozen, /Hóa đơn khảo sát/)
    assert.match(frozen, /Còn phải trả/)
    assert.match(frozen, /103\.400/)
    assert.doesNotMatch(frozen, /<span>Chốt kết quả nội bộ<\/span>/)
    for (const client of clients) client.clear()
  } finally {
    if (originalStorage) Object.defineProperty(globalThis, 'sessionStorage', originalStorage)
    else delete globalThis.sessionStorage
    await server.close()
  }
})
