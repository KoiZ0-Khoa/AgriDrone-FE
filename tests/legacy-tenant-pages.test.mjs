import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createServer } from 'vite'

test('tenant member/assignment pages and sidebar do not mount requests removed from BE', async () => {
  const server = await createServer({ configFile: false, logLevel: 'silent', server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } })
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage')
  const clients = []
  try {
    const { AuthProvider } = await server.ssrLoadModule('/src/features/auth/AuthContext.tsx')
    const { TeamPage } = await server.ssrLoadModule('/src/management/TeamPage.tsx')
    const { MyFarmsPage } = await server.ssrLoadModule('/src/management/MyFarmsPage.tsx')
    const { FarmsPage } = await server.ssrLoadModule('/src/features/farms/FarmsPage.tsx')
    const { ZonesPage } = await server.ssrLoadModule('/src/features/farms/ZonesPage.tsx')
    const { AppLayout } = await server.ssrLoadModule('/src/layouts/AppLayout.tsx')
    function render(Component, role, path) {
      Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: { getItem: () => JSON.stringify({ role, fullName: 'Tenant user', email: 'owner@example.test', phone: null, accessToken: 'fixture', expiresAt: '2099-01-01T00:00:00Z', tenant: { id: 'tenant', name: 'An Phu', code: 'ANPHU' } }) } })
      const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
      clients.push(client)
      const html = renderToStaticMarkup(h(QueryClientProvider, { client }, h(MemoryRouter, { initialEntries: [path] }, h(AuthProvider, null, h(Routes, null, h(Route, { path: '*', element: h(Component) }))))))
      assert.equal(client.getQueryCache().getAll().some(query => ['my-farm-assignments', 'members', 'farm-members', 'assignable-users'].includes(query.queryKey[0])), false)
      return html
    }
    for (const role of ['OWNER', 'TENANT_ADMIN']) {
      const team = render(TeamPage, role, '/team')
      assert.match(team, /Quản lý thành viên chưa sẵn sàng/)
      assert.doesNotMatch(team, /Mời thành viên|Đổi vai trò|Ngừng truy cập|Chưa có thành viên/)
      render(MyFarmsPage, role, '/my-farms')
      const navigation = render(AppLayout, role, '/dashboard')
      assert.doesNotMatch(navigation, /href="\/team"|href="\/my-farms"/)
      if (role === 'OWNER') assert.match(navigation, /href="\/survey-payments"/)
    }
    assert.match(render(TeamPage, 'MEMBER', '/team'), /Bạn không có quyền truy cập/)
    for (const [Component, path] of [[MyFarmsPage, '/my-farms'], [FarmsPage, '/farms'], [ZonesPage, '/zones']]) {
      const member = render(Component, 'MEMBER', path)
      assert.match(member, /Thông tin phân công chưa sẵn sàng/)
      assert.doesNotMatch(member, /Chưa có nông trại được giao/)
    }
  } finally {
    clients.forEach(client => client.clear())
    if (originalStorage) Object.defineProperty(globalThis, 'sessionStorage', originalStorage)
    else delete globalThis.sessionStorage
    await server.close()
  }
})
