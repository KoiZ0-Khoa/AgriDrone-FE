import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createServer } from 'vite'

test('Owner/Admin Farm detail no longer mounts legacy member requests that return 404 when navigating to payments', async () => {
  const server = await createServer({ configFile: false, logLevel: 'silent', server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } })
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage')
  const clients = []
  try {
    const { AuthProvider } = await server.ssrLoadModule('/src/features/auth/AuthContext.tsx')
    const { FarmDetailPage } = await server.ssrLoadModule('/src/features/farms/FarmsPage.tsx')
    for (const role of ['OWNER', 'TENANT_ADMIN']) {
      Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: { getItem: () => JSON.stringify({ role, fullName: 'Owner', email: 'owner@example.test', phone: null, accessToken: 'test-token', expiresAt: '2099-01-01T00:00:00Z', tenant: { id: 'tenant', name: 'An Phu', code: 'ANPHU' } }) } })
      const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false, gcTime: Infinity, staleTime: Infinity } } })
      clients.push(client)
      client.setQueryData(['farm', 'tenant', 'farm'], { id: 'farm', tenantId: 'tenant', name: 'Long An', code: 'F01', status: 'ACTIVE', address: 'Long An', centerPoint: null, boundary: null, areaHectares: 2.5, version: 41, createdAt: '2026-10-20T00:00:00Z' })
      const html = renderToStaticMarkup(h(QueryClientProvider, { client }, h(MemoryRouter, { initialEntries: ['/farms/farm'] }, h(AuthProvider, null, h(Routes, null, h(Route, { path: '/farms/:farmId', element: h(FarmDetailPage) }))))))
      assert.match(html, /Long An/)
      assert.doesNotMatch(html, /Phân công thành viên|Thành viên nông trại|Mời thành viên vào đơn vị/)
      assert.equal(client.getQueryCache().getAll().some(query => ['farm-members', 'assignable-users'].includes(query.queryKey[0])), false)
      if (role === 'OWNER') assert.match(html, /href="\/survey-payments"/)
    }
  } finally {
    clients.forEach(client => client.clear())
    if (originalStorage) Object.defineProperty(globalThis, 'sessionStorage', originalStorage)
    else delete globalThis.sessionStorage
    await server.close()
  }
})
