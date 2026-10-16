import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
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
    const sessionFor = role => ({ role, fullName: 'Test user', email: 'test@example.test', phone: null, accessToken: 'test-token', expiresAt: '2099-01-01T00:00:00Z', tenant: role === 'OWNER' || role === 'MEMBER' ? { id: 'tenant', code: 'TEST', name: 'Test tenant' } : null })
    const clients = []
    function render(Component, role, data, props = {}) {
      Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: { getItem: () => role ? JSON.stringify(sessionFor(role)) : null } })
      const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
      clients.push(client)
      for (const [key, value] of data) client.setQueryData(key, value)
      return renderToStaticMarkup(h(QueryClientProvider, { client }, h(MemoryRouter, null, h(AuthProvider, null, h(Component, props)))))
    }
    const services = [{ surveyServiceId: 'service', code: 'PLANT_HEALTH', name: 'Plant Health', description: 'Khảo sát sức khỏe cây', serviceType: 'PLANT_HEALTH', status: 'ACTIVE', version: 123, currentPrice: { priceVersionId: 'price', amountPerPole: 1500, currency: 'VND', effectiveFrom: '2026-10-16T00:00:00Z', effectiveTo: null } }]
    const manager = { id: 'manager', userId: 'user', email: 'manager@example.test', fullName: 'Manager One', status: 'ACTIVE', availability: 'AVAILABLE', qualificationStatus: 'QUALIFIED', qualificationExpiresAt: '2099-01-01T00:00:00Z', version: 7 }
    const managers = render(ManagersPage, 'SYSTEM_ADMIN', [[['system-managers', 1, { status: '', availability: '', qualificationStatus: '' }], { items: [manager], totalCount: 1 }]])
    assert.match(managers, /Manager One/)
    assert.match(managers, /Mời System Manager/)
    const catalogue = render(ServicesPage, 'SYSTEM_ADMIN', [[['survey-services'], services]])
    assert.match(catalogue, /Plant Health/)
    assert.match(catalogue, /Đặt đơn giá/)
    const intake = render(SurveyIntakePage, null, [[['public-survey-services'], services.map(service => ({ ...service, indicativePrice: service.currentPrice, isExperimental: false }))]])
    assert.match(intake, /Email nhận thông báo/)
    assert.match(intake, /Gửi yêu cầu khảo sát/)
    assert.doesNotMatch(intake, /Xác nhận mật khẩu/)
    const ownerIntake = render(SurveyIntakePage, 'OWNER', [[['public-survey-services'], services]], { owner: true })
    assert.match(ownerIntake, /Nông trại hiện có/)
    assert.doesNotMatch(ownerIntake, /Email nhận thông báo/)
    const forbidden = render(SurveyIntakePage, 'MEMBER', [], { owner: true })
    assert.match(forbidden, /Bạn không có quyền truy cập/)
    const requests = render(RequestsPage, 'SYSTEM_ADMIN', [[['survey-requests', 1, { status: '', kind: '' }], { items: [{ id: 'request', requestNumber: 'SR-TEST', kind: 'NEW_CUSTOMER', status: 'SUBMITTED', farmName: 'Farm One', applicantName: 'Customer', surveyServiceCode: 'PLANT_HEALTH', createdAt: '2026-10-16T00:00:00Z', version: 9 }], totalCount: 1 }]])
    assert.match(requests, /SR-TEST/)
    assert.match(requests, /Chờ xét duyệt/)
    const farms = render(ManagerFarmsPage, 'SYSTEM_MANAGER', [[['manager-assigned-farms'], [{ farmId: 'farm', tenantId: 'tenant', code: 'FARM', name: 'Farm One', address: null, areaHectares: null, assignedAt: '2026-10-16T00:00:00Z' }]]])
    assert.match(farms, /Farm One/)
    assert.match(farms, /Nông trại phụ trách/)
    for (const client of clients) client.clear()
  } finally {
    if (originalStorage) Object.defineProperty(globalThis, 'sessionStorage', originalStorage)
    else delete globalThis.sessionStorage
    await server.close()
  }
})
