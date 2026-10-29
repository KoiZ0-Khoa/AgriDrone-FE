import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createServer } from 'vite'
import { candidate, draft, draftId, farmId } from './base-map-fixtures.mjs'

test('Manager base-map UI checks assignment, renders real draft candidates and keeps publish locked until validation', async () => {
  const server = await createServer({ configFile: false, logLevel: 'silent', server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } })
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage')
  const clients = []
  try {
    const { AuthProvider } = await server.ssrLoadModule('/src/features/auth/AuthContext.tsx')
    const { ManagerBaseMapsPage } = await server.ssrLoadModule('/src/features/surveys/ManagerBaseMapsPage.tsx')
    const { ApiError } = await server.ssrLoadModule('/src/api/client.ts')
    function render(snapshot, { role = 'SYSTEM_MANAGER', assigned = true, index = false, invalid = false } = {}) {
      Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: { getItem: () => JSON.stringify({ role, fullName: 'Manager', email: 'manager@example.test', phone: null, accessToken: 'fixture', expiresAt: '2099-01-01T00:00:00Z', tenant: null }) } })
      const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false, gcTime: Infinity, staleTime: Infinity } } })
      clients.push(client)
      client.setQueryData(['manager-assigned-farms'], assigned ? [{ farmId, name: 'Nông trại Long An' }] : [])
      const key = ['manager-base-map-draft', farmId, draftId]
      if (snapshot instanceof Error) client.getQueryCache().build(client, { queryKey: key }).setState({ status: 'error', error: snapshot, fetchStatus: 'idle' })
      else client.setQueryData(key, snapshot)
      const path = `/manager/farms/${invalid ? 'invalid-id' : farmId}/base-map-drafts${index ? '' : `/${draftId}`}`
      return renderToStaticMarkup(h(QueryClientProvider, { client }, h(MemoryRouter, { initialEntries: [path] }, h(AuthProvider, null, h(Routes, null,
        h(Route, { path: '/manager/farms/:farmId/base-map-drafts', element: h(ManagerBaseMapsPage) }),
        h(Route, { path: '/manager/farms/:farmId/base-map-drafts/:draftId', element: h(ManagerBaseMapsPage) }),
      )))))
    }
    const html = render(draft)
    assert.match(html, /tree_r1_c2/)
    assert.match(html, /108\.12/)
    assert.match(html, /Trong ranh giới/)
    assert.match(html, /Chưa duyệt/)
    assert.match(html, /Kiểm tra bản đồ/)
    assert.match(html, /<button[^>]*disabled=""[^>]*><span>Phát hành bản đồ<\/span>/)
    assert.match(html, new RegExp(`/manager/orders/${draft.sourceSurveyOrderId}`))
    const published = render({ ...draft, status: 'Published', batchStatus: 'Approved', pendingCount: 0, zones: [{ ...draft.zones[0], candidates: [{ ...candidate, reviewDecision: 'CreateNew' }] }] })
    assert.match(published, /Bản đồ hiện chỉ được xem/)
    assert.match(published, /Đã phát hành/)
    assert.doesNotMatch(published, /ant-checkbox-input/)
    assert.match(render(draft, { index: true }), /Mã bản đồ nháp/)
    assert.match(render(draft, { assigned: false }), /không thuộc phân công/)
    assert.doesNotMatch(render(draft, { assigned: false }), /tree_r1_c2/)
    for (const role of ['OWNER', 'MEMBER', 'SYSTEM_ADMIN']) assert.match(render(draft, { role }), /Bạn không có quyền truy cập/)
    assert.match(render(draft, { invalid: true }), /Liên kết bản đồ nháp không hợp lệ/)
    const error = render(new ApiError(404, 'Draft not found', 'FarmBaseMapDraft.NotFound', 'draft-trace'))
    assert.match(error, /draft-trace/)
    assert.doesNotMatch(error, /tree_r1_c2/)
  } finally {
    clients.forEach(client => client.clear())
    if (originalStorage) Object.defineProperty(globalThis, 'sessionStorage', originalStorage)
    else delete globalThis.sessionStorage
    await server.close()
  }
})
