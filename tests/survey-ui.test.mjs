import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createServer } from 'vite'

test('survey screens render real BE response shapes for public, Admin, Owner and Manager', async () => {
  const server = await createServer({ configFile: false, logLevel: 'silent', server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } })
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage')
  try {
    const { AuthProvider } = await server.ssrLoadModule('/src/features/auth/AuthContext.tsx')
    const { ManagersPage } = await server.ssrLoadModule('/src/features/surveys/ManagersPage.tsx')
    const { ServicesPage } = await server.ssrLoadModule('/src/features/surveys/ServicesPage.tsx')
    const { SurveyIntakePage } = await server.ssrLoadModule('/src/features/surveys/SurveyIntakePage.tsx')
    const { RequestsPage } = await server.ssrLoadModule('/src/features/surveys/RequestsPage.tsx')
    const { ManagerFarmsPage } = await server.ssrLoadModule('/src/features/surveys/ManagerFarmsPage.tsx')
    const { ManagerFarmDetailPage } = await server.ssrLoadModule('/src/features/surveys/ManagerFarmDetailPage.tsx')
    const { ManagerOrdersPage, ManagerOrderDetailPage } = await server.ssrLoadModule('/src/features/surveys/ManagerOrdersPage.tsx')
    const { PlantHealthPage } = await server.ssrLoadModule('/src/features/surveys/PlantHealthPage.tsx')
    const { ApiError } = await server.ssrLoadModule('/src/api/client.ts')
    const sessionFor = role => ({ role, fullName: 'Test user', email: 'test@example.test', phone: null, accessToken: 'test-token', expiresAt: '2099-01-01T00:00:00Z', tenant: role === 'OWNER' || role === 'MEMBER' ? { id: 'tenant', code: 'TEST', name: 'Test tenant' } : null })
    const clients = []
    function render(Component, role, data, props = {}, path = '/') {
      Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: { getItem: () => role ? JSON.stringify(sessionFor(role)) : null } })
      const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false, gcTime: Infinity, staleTime: Infinity } } })
      clients.push(client)
      for (const [key, value] of data) {
        if (value instanceof Error) client.getQueryCache().build(client, { queryKey: key }).setState({ status: 'error', error: value, fetchStatus: 'idle' })
        else client.setQueryData(key, value)
      }
      return renderToStaticMarkup(h(QueryClientProvider, { client }, h(MemoryRouter, { initialEntries: [path] }, h(AuthProvider, null, h(Routes, null, h(Route, { path: path.startsWith('/manager/farms/') ? '/manager/farms/:farmId' : path.startsWith('/manager/orders/') ? '/manager/orders/:orderId' : '*', element: h(Component, props) }))))))
    }
    const services = [{ surveyServiceId: 'service', code: 'PLANT_HEALTH', name: 'Plant Health', description: 'Khảo sát sức khỏe cây', serviceType: 'PLANT_HEALTH', status: 'ACTIVE', version: 123, currentPrice: { priceVersionId: 'price', amountPerPole: 1500, currency: 'VND', effectiveFrom: '2026-10-16T00:00:00Z', effectiveTo: null } }]
    const manager = { id: 'manager', userId: 'user', email: 'manager@example.test', fullName: 'Manager One', status: 'ACTIVE', availability: 'AVAILABLE', qualificationStatus: 'QUALIFIED', qualificationExpiresAt: '2099-01-01T00:00:00Z', version: 7 }
    const managers = render(ManagersPage, 'SYSTEM_ADMIN', [[['system-managers', 1, { status: '', availability: '', qualificationStatus: '' }], { items: [manager], totalCount: 1 }]])
    assert.match(managers, /Manager One/)
    assert.match(managers, /Mời System Manager/)
    assert.match(managers, /Phân công nông trại/)
    const catalogue = render(ServicesPage, 'SYSTEM_ADMIN', [[['survey-services'], services]])
    assert.match(catalogue, /Plant Health/)
    assert.match(catalogue, /Đặt đơn giá/)
    const intake = render(SurveyIntakePage, null, [[['public-survey-services'], services.map(service => ({ ...service, indicativePrice: service.currentPrice, isExperimental: false }))]])
    assert.match(intake, /Email nhận thông báo/)
    assert.match(intake, /Gửi yêu cầu khảo sát/)
    assert.match(intake, /Mã đơn vị/)
    assert.match(intake, /Tên đơn vị/)
    assert.doesNotMatch(intake, /Xác nhận mật khẩu/)
    const ownerIntake = render(SurveyIntakePage, 'OWNER', [[['public-survey-services'], services]], { owner: true })
    assert.match(ownerIntake, /Nông trại hiện có/)
    assert.doesNotMatch(ownerIntake, /Email nhận thông báo/)
    assert.doesNotMatch(ownerIntake, /Mã đơn vị/)
    const forbidden = render(SurveyIntakePage, 'MEMBER', [], { owner: true })
    assert.match(forbidden, /Bạn không có quyền truy cập/)
    const requests = render(RequestsPage, 'SYSTEM_ADMIN', [[['survey-requests', 1, { status: '', kind: '' }], { items: [{ id: 'request', requestNumber: 'SR-TEST', kind: 'NEW_CUSTOMER', status: 'SUBMITTED', farmName: 'Farm One', applicantName: 'PrivateApplicantName', tenantCode: 'ANPHU', tenantName: 'An Phu', surveyServiceCode: 'PLANT_HEALTH', createdAt: '2026-10-16T00:00:00Z', version: 9 }], totalCount: 1 }]])
    assert.match(requests, /SR-TEST/)
    assert.match(requests, /Chờ xét duyệt/)
    assert.match(requests, /ANPHU/)
    assert.match(requests, /An Phu/)
    assert.doesNotMatch(requests, /PrivateApplicantName/)
    const farms = render(ManagerFarmsPage, 'SYSTEM_MANAGER', [[['manager-assigned-farms'], [{ farmId: 'farm', tenantId: 'tenant', code: 'FARM', name: 'Farm One', address: null, areaHectares: null, assignedAt: '2026-10-16T00:00:00Z' }]]])
    assert.match(farms, /Farm One/)
    assert.match(farms, /Nông trại phụ trách/)
    assert.match(farms, /href="\/manager\/farms\/farm"/)
    assert.match(farms, /Xem chi tiết/)
    const assignment = { farmId: 'farm', tenantId: 'tenant', code: 'FARM', name: 'Farm One', address: 'Long An', areaHectares: 2.5, assignedAt: '2026-10-16T00:00:00Z' }
    const detail = { farmId: 'farm', tenantId: 'tenant', code: 'FARM', name: 'Farm One', address: 'Long An', areaHectares: 2.5, centerPoint: { type: 'Point', coordinates: [108.1, 10.9] }, approvedBoundary: null, zones: [], publishedBaseMap: null, version: 413, status: 'ACTIVE' }
    const renderDetail = (value, assignments = [assignment]) => render(ManagerFarmDetailPage, 'SYSTEM_MANAGER', [[['manager-assigned-farms'], assignments], [['manager-farm-context', 'farm'], value], [['farm-boundary-exceptions', 'farm', ''], []]], {}, '/manager/farms/farm')
    const farmDetail = renderDetail(detail)
    assert.match(farmDetail, /Kinh độ/)
    assert.match(farmDetail, /108,1/)
    assert.match(farmDetail, /10,9/)
    assert.match(farmDetail, /Chỉnh sửa nông trại/)
    assert.doesNotMatch(farmDetail, /Chưa thể sửa thông tin chung/)
    for (const error of [new ApiError(403, 'Forbidden', undefined, 'read-trace'), new ApiError(401, 'Tenant context required', 'Tenant.ContextRequired', 'read-trace')]) {
      const blocked = renderDetail(error)
      assert.match(blocked, /read-trace/)
      assert.doesNotMatch(blocked, /Chỉnh sửa nông trại/)
    }
    for (const changes of [{ version: undefined }, { centerPoint: undefined }, { tenantId: 'other' }]) {
      const incomplete = renderDetail({ ...detail, ...changes })
      assert.match(incomplete, /Thiếu phiên bản nông trại|Chưa thể sửa thông tin chung|không khớp phân công/)
    }
    const unassigned = renderDetail(detail, [])
    assert.match(unassigned, /không có trong danh sách bạn đang được phân công/)
    assert.doesNotMatch(unassigned, /Chỉnh sửa nông trại/)
    assert.match(renderDetail({ ...detail, status: 'INACTIVE' }), /disabled=""/)
    const mappedFarm = renderDetail({ ...detail, centerPoint: undefined, approvedBoundary: { id: 'boundary', versionNumber: 8, version: 3, geometry: { type: 'Polygon', coordinates: [[[108, 10], [109, 10], [109, 11], [108, 10]]] }, reviewedAt: null }, publishedBaseMap: { versionNumber: 2, publishedAt: null }, zones: [{ id: 'zone', code: 'ZONE-A', name: 'Zone A', status: 'ACTIVE', areaHectares: 1 }] })
    assert.match(mappedFarm, /Chưa thể sửa thông tin chung/)
    assert.match(mappedFarm, /Cập nhật ranh giới/)
    assert.match(mappedFarm, /Zone A/)
    assert.match(mappedFarm, /Bản đồ đã công bố: phiên bản 2/)
    const order = { surveyOrderId: 'order', orderNumber: 'SO-TEST', tenantId: 'tenant', farmId: 'farm', farmCode: 'FARM', farmName: 'Farm One', surveyServiceName: 'Plant Health', status: 'AWAITING_BASELINE_APPOINTMENT', orderVersion: 51, requiresBaselineMapping: true, currentAppointmentId: null, currentAppointmentVersion: null, currentAppointmentStatus: null, createdAt: '2026-10-19T00:00:00Z', updatedAt: '2026-10-19T00:00:00Z' }
    const orders = render(ManagerOrdersPage, 'SYSTEM_MANAGER', [[['manager-orders', 1, ''], { items: [order], totalCount: 1 }]])
    assert.match(orders, /SO-TEST/)
    assert.match(orders, /href="\/manager\/orders\/order"/)
    const scope = { surveyOrderId: 'order', orderNumber: 'SO-TEST', tenantId: 'tenant', farmId: 'farm', orderStatus: order.status, orderVersion: 51, requiresBaselineMapping: true, currentApprovedBoundary: null, zones: [] }
    const renderOrder = (nextOrder, nextScope) => render(ManagerOrderDetailPage, 'SYSTEM_MANAGER', [[['manager-order-context', 'order'], nextOrder], [['manager-order-scope', 'order'], nextScope]], {}, '/manager/orders/order')
    const baseline = renderOrder(order, scope)
    assert.match(baseline, /Đề xuất lịch/)
    assert.doesNotMatch(baseline, />Xác minh ranh giới</)
    const mapped = renderOrder({ ...order, status: 'PENDING_BOUNDARY_VERIFICATION', requiresBaselineMapping: false }, { ...scope, orderStatus: 'PENDING_BOUNDARY_VERIFICATION', requiresBaselineMapping: false })
    assert.match(mapped, />Xác minh ranh giới</)
    assert.doesNotMatch(mapped, /Đề xuất lịch/)
    const staleOrder = renderOrder({ ...order, orderVersion: 50 }, scope)
    assert.match(staleOrder, /Dữ liệu đơn vừa thay đổi/)
    assert.doesNotMatch(staleOrder, /Đề xuất lịch/)
    assert.match(renderOrder(null, scope), /Đơn không còn thuộc/)
    const renderStatus = status => renderOrder({ ...order, status }, { ...scope, orderStatus: status })
    assert.match(renderStatus('AWAITING_BASELINE_DEPOSIT'), /Chờ Owner thanh toán cọc bản đồ nền/)
    assert.doesNotMatch(renderStatus('AWAITING_BASELINE_DEPOSIT'), /Bắt đầu thu thập GPS/)
    assert.match(renderStatus('BASELINE_READY'), /Đơn chưa có phiên thu thập ranh giới/)
    assert.match(renderStatus('AWAITING_BASELINE_REVIEW'), /Đánh dấu 4 góc trên ảnh trực giao/)
    assert.doesNotMatch(renderStatus('AWAITING_BASELINE_APPOINTMENT'), /Đánh dấu 4 góc trên ảnh trực giao/)
    const health = render(PlantHealthPage, 'SYSTEM_ADMIN', [[['plant-health-master-data'], { labels: [{ id: 'label', code: 'SUSPECT', name: 'Suspected label', labelKind: 'SUSPECTED_DISEASE', datasetVersion: 'DATASET_V1', annotationRuleVersion: 'RULES_V1', teamLabelLimitation: 'Preliminary only' }], guidance: [], resultNature: 'PRELIMINARY', claimBoundary: 'Not a diagnosis' }], [['plant-health-guidance-history'], [{ id: 'guidance', code: 'GUIDE-1', versionNumber: 2, suspectedClassCode: 'SUSPECT', sourceTitle: 'Field reference', status: 'DRAFT', effectiveFrom: '2026-10-19T00:00:00Z', version: 31 }]]])
    assert.match(health, /Suspected label/)
    assert.match(health, /GUIDE-1/)
    assert.match(health, /Bản nháp/)
    assert.match(health, /Soạn hướng dẫn/)
    assert.match(health, /không thay thế chẩn đoán/)
    for (const client of clients) client.clear()
  } finally {
    if (originalStorage) Object.defineProperty(globalThis, 'sessionStorage', originalStorage)
    else delete globalThis.sessionStorage
    await server.close()
  }
})
