import assert from 'node:assert/strict'
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createServer } from 'vite'
import { createCache, extractStyle, StyleProvider } from '@ant-design/cssinjs'

test('Dashboards render real query shapes, scoped role actions, empty/error/partial states and preview artifacts', async () => {
  const server = await createServer({ configFile: false, logLevel: 'silent', server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } })
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage')
  const clients = []
  try {
    const { AuthProvider } = await server.ssrLoadModule('/src/features/auth/AuthContext.tsx')
    const { DashboardPage } = await server.ssrLoadModule('/src/pages/DashboardPage.tsx')
    const { SystemDashboardPage } = await server.ssrLoadModule('/src/management/SystemDashboardPage.tsx')
    const { ManagerFarmsPage } = await server.ssrLoadModule('/src/features/surveys/ManagerFarmsPage.tsx')
    const { ManagerOrdersPage } = await server.ssrLoadModule('/src/features/surveys/ManagerOrdersPage.tsx')
    const { ManagerFarmDetailPage } = await server.ssrLoadModule('/src/features/surveys/ManagerFarmDetailPage.tsx')
    const { FarmsPage } = await server.ssrLoadModule('/src/features/farms/FarmsPage.tsx')
    const { AccountPage } = await server.ssrLoadModule('/src/management/AccountPage.tsx')
    const { SystemManagerLayout } = await server.ssrLoadModule('/src/layouts/SystemManagerLayout.tsx')
    const { AppLayout } = await server.ssrLoadModule('/src/layouts/AppLayout.tsx')
    const { SystemAdminLayout } = await server.ssrLoadModule('/src/layouts/SystemAdminLayout.tsx')
    const { ApiError } = await server.ssrLoadModule('/src/api/client.ts')
    const tenant = { id: 'tenant', name: 'Đơn vị canh tác An Phú', code: 'ANPHU' }
    const session = role => ({ role, fullName: 'Người dùng kiểm thử', email: 'dashboard@example.test', accessToken: 'fixture-token', expiresAt: '2099-01-01T00:00:00Z', tenant: ['SYSTEM_ADMIN', 'SYSTEM_MANAGER'].includes(role) ? null : tenant })
    function render(Component, role, data, layout = false, override = {}, routePath) {
      Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: { getItem: () => JSON.stringify({ ...session(role), ...override }) } })
      const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false, staleTime: Infinity, gcTime: Infinity } } })
      clients.push(client)
      for (const [key, value] of data) {
        if (value instanceof Error) client.getQueryCache().build(client, { queryKey: key }).setState({ status: 'error', error: value, fetchStatus: 'idle' })
        else client.setQueryData(key, value)
      }
      const path = routePath ?? (role === 'SYSTEM_ADMIN' ? '/system' : role === 'SYSTEM_MANAGER' ? '/manager' : '/dashboard')
      const Layout = role === 'SYSTEM_ADMIN' ? SystemAdminLayout : role === 'SYSTEM_MANAGER' ? SystemManagerLayout : AppLayout
      const element = layout ? h(Routes, null, h(Route, { element: h(Layout) }, h(Route, { path: path.startsWith('/manager/farms/') ? '/manager/farms/:farmId' : path, element: h(Component) }))) : h(Component)
      const styleCache = createCache()
      const markup = renderToStaticMarkup(h(StyleProvider, { cache: styleCache }, h(QueryClientProvider, { client }, h(MemoryRouter, { initialEntries: [path] }, h(AuthProvider, null, element)))))
      if (Component === DashboardPage) {
        assert.equal(client.getQueryCache().getAll().some(query => ['dashboard-members', 'my-farm-assignments'].includes(query.queryKey[0])), false, 'Dashboard must not request endpoints removed from the current BE')
      }
      return extractStyle(styleCache) + markup
    }
    const farm = { id: 'farm-a', tenantId: 'tenant', code: 'AP-01', name: 'Nông trại An Phú', address: 'Bình Thuận', areaHectares: 2.5, centerPoint: { type: 'Point', coordinates: [108, 11] }, boundary: { type: 'Polygon', coordinates: [[[108, 11], [108.01, 11], [108.01, 11.01], [108, 11]]] }, status: 'ACTIVE', createdAt: '2026-10-20T08:00:00Z' }
    const farms = [farm, { ...farm, id: 'farm-b', code: 'AP-02', name: 'Nông trại Hàm Thuận', address: 'Hàm Thuận Bắc, Bình Thuận', areaHectares: 1.25, boundary: null }, { ...farm, id: 'farm-c', code: 'AP-03', name: 'Nông trại Tân An', address: null, areaHectares: null, boundary: null }]
    const ownerData = [[['api-health'], true], [['farms', 'tenant', 1], { items: farms, totalCount: 24 }]]
    const owner = render(DashboardPage, 'OWNER', ownerData, true)
    assert.match(owner, /Nông trại An Phú/)
    assert.match(owner, /3,75/)
    assert.match(owner, /Từ 2 nông trại/)
    assert.match(owner, /Đăng ký khảo sát/)
    assert.match(owner, /3 \/ 24 nông trại/)
    assert.doesNotMatch(owner, /Thành viên đơn vị|một ngày tốt lành|KHÔNG GIAN LÀM VIỆC/)
    assert.doesNotMatch(owner, /TỔNG SỐ CÂY|Xu hướng bệnh|API danh sách|Nhiệm vụ gần đây/)
    const adminTenant = render(DashboardPage, 'TENANT_ADMIN', ownerData)
    assert.doesNotMatch(adminTenant, /Đăng ký khảo sát|Tạo yêu cầu khảo sát/)
    assert.match(adminTenant, /Xem khu vực/)
    const memberData = [[['api-health'], true]]
    const member = render(DashboardPage, 'MEMBER', memberData, true)
    assert.match(member, /Phân công chưa khả dụng/)
    assert.match(member, /Tài khoản của tôi/)
    assert.doesNotMatch(member, /Đăng ký khảo sát|Thành viên đơn vị|href="\/team"/)
    const forbidden = render(DashboardPage, 'OWNER', [], false, { tenant: null })
    assert.match(forbidden, /Chọn đơn vị làm việc/)
    assert.doesNotMatch(forbidden, /Đăng ký khảo sát/)

    const request = { id: 'request-a', requestNumber: 'SR-2026-0012', kind: 'NEW_CUSTOMER', status: 'SUBMITTED', tenantName: 'Canh tác An Phú', farmName: 'Vườn thanh long Hàm Liêm', surveyServiceCode: 'PLANT_HEALTH', createdAt: '2026-10-26T08:00:00Z' }
    const order = { surveyOrderId: 'order-a', orderNumber: 'SO-2026-0038', farmName: 'Nông trại An Phú', surveyServiceName: 'Khảo sát sức khỏe cây', status: 'AWAITING_BASELINE_APPOINTMENT', createdAt: '2026-10-25T08:00:00Z' }
    const adminData = [[['api-health'], true], [['system-tenants', 1], { totalCount: 18, items: [] }], [['system-managers', 1, {}], { totalCount: 6, items: [] }], [['survey-requests', 1, { status: 'SUBMITTED' }], { totalCount: 12, items: [request, { ...request, id: 'request-b', requestNumber: 'SR-2026-0011', farmName: 'Nông trại Tân An', tenantName: 'Canh tác Tân An' }, { ...request, id: 'request-c', requestNumber: 'SR-2026-0010', farmName: 'Vườn thanh long ruột đỏ', kind: 'EXISTING_TENANT_NEW_FARM' }] }], [['survey-requests', 1, { status: 'UNDER_REVIEW' }], { totalCount: 5, items: [] }], [['system-survey-orders', 1, { status: '', tenantId: '', farmId: '' }], { totalCount: 38, items: [order, { ...order, surveyOrderId: 'order-b', orderNumber: 'SO-2026-0037', farmName: 'Nông trại Hàm Thuận', status: 'AWAITING_BASELINE_DEPOSIT' }, { ...order, surveyOrderId: 'order-c', orderNumber: 'SO-2026-0036', farmName: 'Nông trại Tân An', status: 'COMPLETED' }] }], [['survey-services'], [{ status: 'ACTIVE', currentPrice: { amountPerPole: 1500 } }]]]
    const admin = render(SystemDashboardPage, 'SYSTEM_ADMIN', adminData, true)
    assert.match(admin, /Tổng quan vận hành/)
    assert.match(admin, /SR-2026-0012/)
    assert.match(admin, /href="\/system\/survey-requests\/request-a"/)
    assert.match(admin, /href="\/system\/survey-orders\/order-a\/authorizations"/)
    assert.match(admin, /38/)
    assert.match(admin, /Đang xét duyệt/)
    const failure = new ApiError(503, 'Dịch vụ đang tạm gián đoạn.', 'Service.Unavailable')
    const partialData = adminData.map(([key, value]) => [key, key[0] === 'survey-requests' && key[2]?.status === 'SUBMITTED' ? failure : value])
    const partial = render(SystemDashboardPage, 'SYSTEM_ADMIN', partialData, true)
    assert.match(partial, /Một số dữ liệu chưa tải được/)
    assert.match(partial, /Dịch vụ đang tạm gián đoạn/)
    assert.match(partial, /SO-2026-0038/)
    const emptyData = ownerData.map(([key, value]) => [key, key[0] === 'farms' ? { items: [], totalCount: 0 } : value])
    const empty = render(DashboardPage, 'OWNER', emptyData, true)
    assert.match(empty, /Chưa có nông trại/)
    const loading = render(DashboardPage, 'OWNER', [[['api-health'], true]], true)
    assert.match(loading, /Đang tải dữ liệu/)
    const errorData = ownerData.map(([key, value]) => [key, key[0] === 'farms' ? failure : value])
    const error = render(DashboardPage, 'OWNER', errorData, true)
    assert.match(error, /Thử tải lại/)
    const longData = ownerData.map(([key, value]) => [key, key[0] === 'farms' ? { ...value, items: [{ ...farm, name: 'Nông trại hợp tác xã sản xuất thanh long công nghệ cao Hàm Thuận Bắc và vùng canh tác mở rộng', code: 'FARM-' + 'A'.repeat(50) }] } : value])
    const long = render(DashboardPage, 'OWNER', longData, true, { fullName: 'Nguyễn Người Dùng Có Họ Tên Rất Dài' })

    const managerFarms = farms.map(farm => ({ ...farm, farmId: farm.id, assignedAt: '2026-10-20T08:00:00Z' }))
    const managerOrders = { totalCount: 38, items: [{ ...order, farmId: 'farm-a', farmCode: 'AP-01', tenantId: 'tenant' }] }
    const managerData = [[['api-health'], true], [['manager-assigned-farms'], managerFarms], [['manager-orders', 1, ''], managerOrders]]
    const manager = render(ManagerFarmsPage, 'SYSTEM_MANAGER', managerData, true)
    assert.match(manager, /Công việc của bạn/)
    assert.match(manager, /href="\/manager\/farms\/farm-a"/)
    assert.match(manager, /href="\/manager\/orders\/order-a"/)
    assert.doesNotMatch(manager, /href="\/farms\/farm-a"|href="\/system\/survey-requests/)
    const managerPartial = render(ManagerFarmsPage, 'SYSTEM_MANAGER', managerData.map(([key, value]) => [key, key[0] === 'manager-orders' ? failure : value]), true)
    assert.match(managerPartial, /Nông trại An Phú/)
    assert.match(managerPartial, /Thử tải lại/)
    const managerEmpty = render(ManagerFarmsPage, 'SYSTEM_MANAGER', [[['api-health'], true], [['manager-assigned-farms'], []], [['manager-orders', 1, ''], { totalCount: 0, items: [] }]], true)
    const managerLoading = render(ManagerFarmsPage, 'SYSTEM_MANAGER', [[['api-health'], true]], true)
    const managerError = render(ManagerFarmsPage, 'SYSTEM_MANAGER', [[['api-health'], true], [['manager-assigned-farms'], failure], [['manager-orders', 1, ''], failure]], true)
    assert.match(managerEmpty, /Chưa có nông trại/)
    assert.match(managerLoading, /Đang tải dữ liệu/)
    assert.match(managerError, /Chưa tải được dữ liệu/)
    const farmCatalogue = render(FarmsPage, 'OWNER', ownerData, true, {}, '/farms')
    assert.match(farmCatalogue, /Đã lưu trữ/)
    assert.match(farmCatalogue, /Xem chi tiết/)
    const managerOrderList = render(ManagerOrdersPage, 'SYSTEM_MANAGER', managerData, true, {}, '/manager/orders')
    const context = { farmId: 'farm-a', tenantId: 'tenant', code: 'AP-01', name: 'Nông trại An Phú', address: 'Bình Thuận', areaHectares: 2.5, centerPoint: { type: 'Point', coordinates: [108.1, 10.9] }, approvedBoundary: null, zones: [], publishedBaseMap: null, version: 413, status: 'ACTIVE' }
    const managerFarmDetail = render(ManagerFarmDetailPage, 'SYSTEM_MANAGER', [...managerData, [['manager-farm-context', 'farm-a'], context], [['farm-boundary-exceptions', 'farm-a', ''], []]], true, {}, '/manager/farms/farm-a')
    const account = render(AccountPage, 'SYSTEM_MANAGER', [], true, {}, '/manager/account')

    const root = new URL('../docs/dashboard-redesign-2026-10-26/', import.meta.url)
    mkdirSync(root, { recursive: true })
    copyFileSync(new URL('../public/brand/emblem.png', import.meta.url), new URL('emblem.png', root))
    for (const range of ['latin', 'vietnamese']) copyFileSync(new URL('../node_modules/@fontsource-variable/inter/files/inter-' + range + '-wght-normal.woff2', import.meta.url), new URL('inter-' + range + '.woff2', root))
    const fonts = '@font-face{font-family:"Inter Variable";font-style:normal;font-weight:100 900;src:url("inter-latin.woff2")}@font-face{font-family:"Inter Variable";font-style:normal;font-weight:100 900;src:url("inter-vietnamese.woff2");unicode-range:U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB}'
    const css = fonts + readFileSync(new URL('../src/styles/global.css', import.meta.url), 'utf8') + readFileSync(new URL('../src/styles/workspace.css', import.meta.url), 'utf8') + readFileSync(new URL('../src/components/dashboard/dashboard.css', import.meta.url), 'utf8')
    for (const [name, markup] of Object.entries({ owner, admin, member, partial, empty, loading, error, long, manager, 'manager-partial': managerPartial, 'manager-empty': managerEmpty, 'manager-loading': managerLoading, 'manager-error': managerError, 'farm-catalogue': farmCatalogue, 'manager-order-list': managerOrderList, 'manager-farm-detail': managerFarmDetail, account, permission: forbidden })) {
      const html = '<!doctype html><html lang="vi"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AgriDrone dashboard — ' + name + ' fixture</title><style>' + css + '</style></head><body><div id="app">' + markup.replaceAll('src="/brand/emblem.png"', 'src="emblem.png"') + '</div><script>document.fonts.ready.then(()=>{document.documentElement.dataset.overflow=String(document.documentElement.scrollWidth>innerWidth);document.documentElement.dataset.viewport=innerWidth+"x"+innerHeight;document.documentElement.dataset.unlabelled=String([...document.querySelectorAll(".workspace-dashboard a,.workspace-dashboard button")].filter(e=>!e.textContent.trim()&&!e.getAttribute("aria-label")).length)})</script></body></html>'
      writeFileSync(new URL(name + '.html', root), html)
    }
    console.log('Dashboard preview artifacts: ' + fileURLToPath(root))
  } finally {
    for (const client of clients) client.clear()
    if (originalStorage) Object.defineProperty(globalThis, 'sessionStorage', originalStorage)
    else delete globalThis.sessionStorage
    await server.close()
  }
})
