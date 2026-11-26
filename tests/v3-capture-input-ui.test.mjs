import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createServer } from 'vite'

const orderId = '10000000-0000-0000-0000-000000000001'
const attemptId = '10000000-0000-0000-0000-000000000002'
const missionId = '10000000-0000-0000-0000-000000000003'
const farmId = '10000000-0000-0000-0000-000000000004'
const frozen = {
  status: 'UPLOADED',
  manifestId: '10000000-0000-0000-0000-000000000005',
  manifestFingerprint: 'A'.repeat(64),
  processingJobId: '10000000-0000-0000-0000-000000000006',
}
const disabledButton = label => new RegExp('<button[^>]*disabled[^>]*><span>' + label + '</span></button>')

test('G5 reviews the current manifest and restores the telemetry requirement after reopening', async () => {
  const server = await createServer({
    configFile: false,
    logLevel: 'silent',
    server: { middlewareMode: true, hmr: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
    resolve: { alias: { 'react-leaflet': 'virtual:test-map' } },
    plugins: [{
      name: 'stub-client-only-map',
      resolveId: id => id === 'virtual:test-map' ? '\0test-map' : null,
      load: id => id === '\0test-map'
        ? 'export const CircleMarker = null, ImageOverlay = null, MapContainer = null, Polygon = null, Polyline = null, Popup = null, useMapEvents = null, LayersControl = null, TileLayer = null'
        : null,
    }],
  })
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage')
  try {
    const { AuthProvider } = await server.ssrLoadModule('/src/features/auth/AuthContext.tsx')
    const { ManagerMissionDetailPage } = await server.ssrLoadModule('/src/features/missions/ManagerMissionDetailPage.tsx')
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true, value: { getItem: () => JSON.stringify({
        role: 'SYSTEM_MANAGER', fullName: 'Manager', accessToken: 'test-token', expiresAt: '2099-01-01T00:00:00Z',
      }) },
    })
    const render = ({ orderStatus = 'AWAITING_CAPTURE_UPLOAD', pointCount = 0, attempt = {} } = {}) => {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity } } })
      client.setQueryData(['mission-detail', farmId, missionId], {
        id: missionId, farmId, missionCode: 'V3CAP-TEST', status: 'UPLOADING',
        version: 42, droneId: 'drone', preflightConfirmedAt: '2026-11-26T08:00:00Z',
      })
      client.setQueryData(['manager-order-context', orderId], {
        surveyOrderId: orderId, farmId, surveyServiceCode: 'MAP', orderVersion: 10, status: orderStatus,
      })
      client.setQueryData(['capture-attempts', orderId], [{
        captureAttemptId: attemptId, missionId, status: 'AWAITING_UPLOAD', version: 8, orderVersion: 10, ...attempt,
      }])
      client.setQueryData(['mission-readiness', farmId, missionId], {
        missionId, missionVersion: 42, rawImageCount: 190, rawVideoCount: 0,
        telemetryPointCount: pointCount, hasActiveUploadSessions: false,
      })
      try {
        return renderToStaticMarkup(h(QueryClientProvider, { client },
          h(MemoryRouter, { initialEntries: ['/missions/' + farmId + '/' + missionId + '?orderId=' + orderId] },
            h(AuthProvider, null, h(Routes, null, h(Route, {
              path: '/missions/:farmId/:missionId', element: h(ManagerMissionDetailPage),
            }))))))
      } finally {
        client.clear()
      }
    }

    const withoutTelemetry = render()
    assert.match(withoutTelemetry, /Cần nhập telemetry trước khi chốt/)
    assert.match(withoutTelemetry, disabledButton('Chốt bộ dữ liệu'))
    assert.doesNotMatch(withoutTelemetry, /Mở lại bộ dữ liệu<\/span>/)

    const withTelemetry = render({ pointCount: 1170 })
    assert.match(withTelemetry, /<span>Chốt bộ dữ liệu<\/span>/)
    assert.doesNotMatch(withTelemetry, disabledButton('Chốt bộ dữ liệu'))
    assert.doesNotMatch(withTelemetry, /Cần nhập telemetry trước khi chốt/)

    const review = attempt => render({ orderStatus: 'AWAITING_INPUT_REVIEW', attempt })
    const oldManifest = review({ ...frozen, processingJobId: null })
    assert.match(oldManifest, /Bộ dữ liệu chưa có đủ thông tin để duyệt/)
    assert.match(oldManifest, disabledButton('Duyệt bộ dữ liệu'))
    assert.match(oldManifest, /<span>Mở lại bộ dữ liệu<\/span>/)
    assert.doesNotMatch(oldManifest, disabledButton('Mở lại bộ dữ liệu'))

    const currentManifest = review(frozen)
    assert.match(currentManifest, /<span>Duyệt bộ dữ liệu<\/span>/)
    assert.doesNotMatch(currentManifest, disabledButton('Duyệt bộ dữ liệu'))

    const staleManifest = review({ ...frozen, orderVersion: 9 })
    assert.match(staleManifest, disabledButton('Duyệt bộ dữ liệu'))
    assert.match(staleManifest, disabledButton('Mở lại bộ dữ liệu'))

    const approved = render({ orderStatus: 'PROCESSING', attempt: { ...frozen, status: 'PROCESSING' } })
    assert.match(approved, /Chờ nhiệm vụ sẵn sàng ghép bản đồ/)
    assert.doesNotMatch(approved, /<span>Ghép bản đồ<\/span><\/button>/)
  } finally {
    if (originalStorage) Object.defineProperty(globalThis, 'sessionStorage', originalStorage)
    else delete globalThis.sessionStorage
    await server.close()
  }
})
