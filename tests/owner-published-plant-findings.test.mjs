import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createServer } from 'vite'

const farmId = '10000000-0000-4000-8000-000000000001'
const orderId = '10000000-0000-4000-8000-000000000002'
const versionId = '10000000-0000-4000-8000-000000000003'
const profileId = '10000000-0000-4000-8000-00000000000a'
const healthyProfileId = '10000000-0000-4000-8000-00000000000b'
const tenantId = 'tenant'
const scopeKey = 'OWNER:tenant:owner@example.test'
const summary = { farmId, orderId, mapVersionId: versionId, baselineMapVersionId: versionId, serviceCode: 'COMBO',
  publicationId: 'publication', publishedAt: '2026-11-28T14:00:00Z' }
const poles = [
  { plantProfileId: profileId, plantCode: 'P01', latitude: 10.4, longitude: 106.4, row: 1, column: 1 },
  { plantProfileId: healthyProfileId, plantCode: 'P02', latitude: 10.401, longitude: 106.4, row: 1, column: 2 },
]
const finding = { findingId: 'finding-1', plantProfileId: profileId.toUpperCase(), suspectedClassCode: 'DISEASE_SOFT_ROT',
  confidence: 0.82, observedAt: summary.publishedAt, limitations: [] }
const healthy = { ...finding, findingId: 'finding-2', plantProfileId: healthyProfileId, suspectedClassCode: 'HEALTHY_FRUIT_GREEN' }
const result = { summary, verifiedPoleCount: 2, boundaryGeoJson: null, poles, findings: [finding, healthy], zones: [], imageIds: [] }
const map = { farmId, versionId, versionNumber: 1, sourceSurveyOrderId: orderId, status: 'PUBLISHED', totalPoles: 2,
  bounds: null, boundaryGeoJson: null, previewUrl: null,
  plants: poles.map(pole => ({ plantId: `plant-${pole.plantCode}`, plantCode: pole.plantCode, plantProfileId: pole.plantProfileId,
    lat: pole.latitude, lon: pole.longitude, row: pole.row, col: pole.column, lifecycleStatus: 'ACTIVE' })) }

test('Owner maps highlight only released findings attached to the matching plant profile and map version', async () => {
  const server = await createServer({
    configFile: false, logLevel: 'silent', server: { middlewareMode: true, hmr: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
    resolve: { alias: [
      { find: /^leaflet$/, replacement: 'virtual:test-leaflet' },
      { find: 'react-leaflet', replacement: 'virtual:test-map' },
    ] },
    plugins: [{
      name: 'stub-client-only-map',
      resolveId: id => ['virtual:test-map', 'virtual:test-leaflet'].includes(id) ? '\0' + id : null,
      load: id => id === '\0virtual:test-leaflet' ? 'export const divIcon = () => ({})'
        : id === '\0virtual:test-map' ? `
          import { createElement } from 'react'
          export const MapContainer = ({ children }) => children
          export const CircleMarker = ({ children, pathOptions }) => createElement('div', { 'data-marker': pathOptions.color }, children)
          export const Popup = ({ children }) => children
          export const GeoJSON = () => null, ImageOverlay = () => null, Marker = () => null, useMapEvents = () => null
          export const Polygon = () => null, LayersControl = () => null, TileLayer = () => null
          LayersControl.BaseLayer = () => null
        ` : null,
    }],
  })
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage')
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity } } })
  try {
    const { AuthProvider } = await server.ssrLoadModule('/src/features/auth/AuthContext.tsx')
    const { MapVersionPanel } = await server.ssrLoadModule('/src/features/baseMaps/MapVersionPanel.tsx')
    const { OwnerSurveyResultPage } = await server.ssrLoadModule('/src/features/surveys/OwnerSurveyResultPage.tsx')
    const { PublishedPlantFindings, publishedFindingsByProfile } = await server.ssrLoadModule('/src/features/surveys/PublishedPlantFindings.tsx')
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: { getItem: () => JSON.stringify({
      role: 'OWNER', fullName: 'Owner', email: 'owner@example.test', accessToken: 'fixture',
      expiresAt: '2099-01-01T00:00:00Z', tenant: { id: tenantId, name: 'Tam Vu' },
    }) } })

    const resultKey = ['owner-published-result', tenantId, orderId]
    const historyKey = ['owner-published-history', tenantId, farmId]
    client.setQueryData(['farm-map-version', scopeKey, farmId, versionId], map)
    client.setQueryData(historyKey, [summary])
    client.setQueryData(resultKey, result)

    function render(element, path = '/', route = '/') {
      return renderToStaticMarkup(h(QueryClientProvider, { client }, h(MemoryRouter, { initialEntries: [path] },
        h(AuthProvider, null, h(Routes, null, h(Route, { path: route, element }))))))
    }

    const byProfile = publishedFindingsByProfile(result)
    assert.deepEqual([...byProfile.keys()], [profileId])
    assert.match(renderToStaticMarkup(h(PublishedPlantFindings, { findings: byProfile.get(profileId) })), /Thối mềm · 82\.0%/)
    const farmMap = h(MapVersionPanel, { token: 'fixture', scopeKey, farmId, versionId, farmName: 'Tam Vu', path: '/farms', manager: false })
    const resultPath = `/survey-payments/${orderId}/result`
    for (const html of [render(farmMap), render(h(OwnerSurveyResultPage), resultPath, '/survey-payments/:orderId/result')]) {
      assert.match(html, /Trụ màu đỏ có dấu hiệu nghi bệnh/)
      assert.match(html, /data-marker="#b42318"><strong>P01<\/strong>/)
      assert.doesNotMatch(html, /data-marker="#b42318"><strong>P02<\/strong>/)
      assert.match(html, /Thối mềm · 82\.0%/)
    }

    client.setQueryData(resultKey, { ...result, findings: [healthy] })
    assert.doesNotMatch(render(farmMap), /Trụ màu đỏ/)
    client.setQueryData(resultKey, { ...result, summary: { ...summary, mapVersionId: 'different-map' } })
    assert.doesNotMatch(render(farmMap), /Trụ màu đỏ/)
    client.setQueryData(resultKey, result)
    client.setQueryData(historyKey, [{ ...summary, mapVersionId: 'different-map' }])
    assert.doesNotMatch(render(farmMap), /Trụ màu đỏ/)
    assert.equal(publishedFindingsByProfile({ ...result, summary: { ...summary, serviceCode: 'MAP' } }).size, 0)
  } finally {
    client.clear()
    if (originalStorage) Object.defineProperty(globalThis, 'sessionStorage', originalStorage)
    else delete globalThis.sessionStorage
    await server.close()
  }
})
