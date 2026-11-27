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

test('G5 restores capture review and shows the grid from the matching draft or YOLO result', async () => {
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
        ? 'export const CircleMarker = null, ImageOverlay = null, MapContainer = () => null, Polygon = null, Polyline = null, Popup = null, useMapEvents = null, LayersControl = null, TileLayer = null'
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
    const render = ({
      orderStatus = 'AWAITING_CAPTURE_UPLOAD', pointCount = 0, attempt = {}, missionStatus = 'UPLOADING',
      missionCode = 'V3CAP-TEST', orderParam = orderId, yoloGrid, baseMapDraft,
    } = {}) => {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity } } })
      client.setQueryData(['mission-detail', farmId, missionId], {
        id: missionId, farmId, missionCode, status: missionStatus,
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
      if (yoloGrid) {
        const bounds = { minLat: 10, minLon: 106, maxLat: 10.1, maxLon: 106.1 }
        client.setQueryData(['mission-orthophoto-status', farmId, missionId], { status: 'COMPLETED', previewUrl: '/preview.png', bounds })
        client.setQueryData(['mission-tiling-job', farmId, missionId], {
          status: 'COMPLETED', jobId: 'tiling-1', missionId,
          polygonGeoJson: { type: 'Polygon', coordinates: [[[106, 10], [106.1, 10], [106, 10.1], [106, 10]]] },
          result: { isSuccess: true, totalTiles: 1, manifestStorageKey: 'manifest', tiles: [] },
        })
        client.setQueryData(['mission-yolo-job', farmId, missionId], {
          status: 'COMPLETED', jobId: 'yolo-1', missionId, tilingJobId: 'tiling-1', createdAt: '2026-11-26T08:00:00Z',
          result: { missionId, totalUniqueTrees: 1, totalTilesScanned: 1, totalMissingTrees: 0, activeTrees: [], missingTrees: [], ...yoloGrid },
        })
        if (baseMapDraft) {
          client.setQueryData(['mission-plant-gps', farmId, missionId], { missionId, savedCount: 1, trees: [] })
          client.setQueryData(['manager-current-base-map-draft', farmId, orderId], baseMapDraft)
        }
      }
      try {
        return renderToStaticMarkup(h(QueryClientProvider, { client },
          h(MemoryRouter, { initialEntries: ['/missions/' + farmId + '/' + missionId + (orderParam ? '?orderId=' + orderParam : '')] },
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

    const orderHex = orderId.replaceAll('-', '')
    for (const prefix of ['V3CAP', 'V3R2']) {
      const directLink = render({ missionCode: prefix + '-' + orderHex, orderParam: '' })
      assert.match(directLink, /Chọn tệp/)
      assert.match(directLink, /Decode &amp; Import Telemetry/)
      assert.doesNotMatch(directLink, /Mở nhiệm vụ từ đơn khảo sát để tải dữ liệu lần bay/)
    }

    const mismatchedAttempt = render({ missionCode: 'V3CAP-' + orderHex, orderParam: '', attempt: { missionId: 'another-mission' } })
    assert.match(mismatchedAttempt, /Nhiệm vụ không thuộc lần bay của đơn này/)
    assert.doesNotMatch(mismatchedAttempt, /Chọn tệp|Decode &amp; Import Telemetry/)

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
    assert.match(approved, /<span>Khôi phục để ghép bản đồ<\/span>/)
    assert.doesNotMatch(approved, /<span>Ghép bản đồ<\/span><\/button>/)

    const ready = render({ orderStatus: 'PROCESSING', missionStatus: 'READY_FOR_PROCESSING', attempt: { ...frozen, status: 'PROCESSING' } })
    assert.match(ready, /<span>Ghép bản đồ<\/span><\/button>/)
    assert.doesNotMatch(ready, /Khôi phục để ghép bản đồ/)

    for (const prefix of ['V3DIS', 'V3R3']) {
      const diseaseCode = `${prefix}-${orderHex}`
      const diseaseAttempt = { ...frozen, mappingSourceAttemptId: '10000000-0000-0000-0000-000000000007' }
      const toReview = render({ orderStatus: 'AWAITING_INPUT_REVIEW', missionCode: diseaseCode, orderParam: '', attempt: diseaseAttempt })
      assert.match(toReview, /Nhiệm vụ bay bệnh COMBO/)
      assert.match(toReview, /<span>Duyệt bộ dữ liệu<\/span>/)
      const approvedDisease = render({ orderStatus: 'PROCESSING', missionStatus: 'READY_FOR_PROCESSING', missionCode: diseaseCode, orderParam: '',
        attempt: { ...diseaseAttempt, status: 'PROCESSING' } })
      assert.match(approvedDisease, /Mở bước nhận diện và duyệt bệnh/)
      assert.match(approvedDisease, new RegExp(`/manager/orders/${orderId}/result-review`))
      assert.doesNotMatch(approvedDisease, /Ghép bản đồ|GPS cây \(lưu nháp\)/)
    }
    assert.doesNotMatch(currentManifest, /Khôi phục để ghép bản đồ/)
    assert.doesNotMatch(withoutTelemetry, /Khôi phục để ghép bản đồ/)

    const withYolo = {
      orderStatus: 'PROCESSING', missionStatus: 'READY_FOR_PROCESSING', attempt: { ...frozen, status: 'PROCESSING' },
      yoloGrid: { suggestedRowSpacing: 2.81, suggestedColSpacing: 2.68 },
    }
    const suggested = render(withYolo)
    assert.match(suggested, /Thông số gợi ý từ YOLO/)
    assert.match(suggested, /Khoảng cách hàng <strong>2,81 m<\/strong>/)
    assert.match(suggested, /Góc lưới <strong>Chưa có gợi ý<\/strong>/)
    assert.match(suggested, /<details><summary>Chỉnh thông số dự phòng<\/summary>/)
    assert.doesNotMatch(suggested, /Kiểm tra bản nháp/)

    const mapGrid = { sourceMissionId: missionId, rowSpacingM: 2.95, plantSpacingM: 2.75, gridBearingDeg: 270.4 }
    const saved = render({ ...withYolo, baseMapDraft: mapGrid })
    assert.match(saved, /Thông số đã lưu trên bản nháp/)
    assert.match(saved, /Góc lưới <strong>270,4°<\/strong>/)
    assert.match(saved, /Kiểm tra bản nháp/)
    assert.doesNotMatch(saved, /Thông số gợi ý từ YOLO/)

    const otherMission = render({ ...withYolo, baseMapDraft: { ...mapGrid, sourceMissionId: attemptId } })
    assert.match(otherMission, /Thông số gợi ý từ YOLO/)
    assert.match(otherMission, /Bản nháp đang mở thuộc lần bay khác/)
    assert.doesNotMatch(otherMission, /270,4°/)
  } finally {
    if (originalStorage) Object.defineProperty(globalThis, 'sessionStorage', originalStorage)
    else delete globalThis.sessionStorage
    await server.close()
  }
})
