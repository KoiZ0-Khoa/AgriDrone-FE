import 'leaflet/dist/leaflet.css'
import { useQuery } from '@tanstack/react-query'
import { Alert, Button, Select, Space, Table, Tag } from 'antd'
import { useEffect, useState } from 'react'
import { CircleMarker, MapContainer, Polygon, Popup } from 'react-leaflet'
import { Link, useParams } from 'react-router-dom'
import { CommonState } from '../../components/CommonState'
import { MapBaseLayers } from '../../components/MapBaseLayers'
import { useAuth } from '../auth/AuthContext'
import {
  comparePublishedSurveys, getPublishedSurveyHistory, getPublishedSurveyImage, getPublishedSurveyResult,
  type PublishedSurveyResult, type PublishedSurveySummary, type SurveyPole,
} from './ownerSurveyResultApi'
import { getOwnerOrder } from './ownerOrderApi'
import { OwnerQualityRefundPanel } from './OwnerQualityRefundPanel'
import { ownerGuid } from './ownerOrderWorkflow'
import { PublishedPlantFindings, publishedFindingsByProfile } from './PublishedPlantFindings'
import { comboFindingLabel } from './resultReviewWorkflow'
import { SurveyMutationError } from './SurveyMutationError'

const dateInVietnam = (value: string) => new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
const resultUrl = (orderId: string) => `/survey-payments/${encodeURIComponent(orderId)}/result`
const polePosition = (pole: SurveyPole): [number, number] => [pole.latitude, pole.longitude]
const poleGrid = (pole: SurveyPole) => `${pole.row ?? '—'} / ${pole.column ?? '—'}`

export function OwnerSurveyResultPage() {
  const { session } = useAuth()
  const { orderId = '' } = useParams()
  if (session?.role !== 'OWNER' || !session.tenant) return <CommonState type="forbidden" />
  if (!ownerGuid(orderId)) return <CommonState type="error" description="Liên kết đơn khảo sát không hợp lệ." />
  return <PublishedResult key={session.tenant.id + ':' + orderId} tenantId={session.tenant.id} token={session.accessToken} orderId={orderId} />
}

function PublishedResult({ token, tenantId, orderId }: { token: string; tenantId: string; orderId: string }) {
  const query = useQuery({ queryKey: ['owner-published-result', tenantId, orderId], queryFn: ({ signal }) => getPublishedSurveyResult(token, orderId, signal), retry: false })
  const order = useQuery({ queryKey: ['owner-survey-order', tenantId, orderId], queryFn: ({ signal }) => getOwnerOrder(token, orderId, signal), retry: false })
  const back = <Link className="back-link" to={`/survey-payments/${encodeURIComponent(orderId)}`}>← Đơn khảo sát</Link>
  if (query.isPending) return <>{back}<CommonState type="loading" title="Đang tải kết quả đã phát hành" /></>
  if (query.isError) return <>{back}<CommonState type="error" description={query.error.message} retry={() => query.refetch()} /></>
  const result = query.data
  if (result && order.data && result.summary.farmId !== order.data.farmId) return <>{back}<CommonState type="error" description="Kết quả không khớp nông trại của đơn." /></>
  const polesByProfile = new Map(result?.poles.map(pole => [pole.plantProfileId, pole.plantCode]))
  const claims = order.data?.status === 'COMPLETED' && <OwnerQualityRefundPanel
    token={token} tenantId={tenantId} order={{ ...order.data, currency: 'VND' }}
    publishedResult={result} reloadPublication={() => { void query.refetch() }} />
  if (!result) return <>{back}<CommonState type="empty" title="Kết quả khảo sát chưa hiển thị"
    description="Kiểm tra trạng thái phát hành trên đơn khảo sát." actionLabel="Tải lại" action={() => { void query.refetch() }} />{claims}</>
  return <>{back}
    <section className="resource-page-heading">
      <div><span className="page-kicker">{result.summary.serviceCode} · {order.data?.farmName ?? 'Nông trại'}</span>
        <h1>Kết quả khảo sát</h1><p>Phát hành lúc {dateInVietnam(result.summary.publishedAt)} (giờ Việt Nam)</p></div>
      <Button loading={query.isFetching} onClick={() => { void query.refetch() }}>Tải lại</Button>
    </section>
    <section className="resource-panel">
      <div className="resource-panel-heading"><div><strong>Bản đồ và vị trí trụ</strong><span>{result.verifiedPoleCount.toLocaleString('vi-VN')} trụ đã xác minh</span></div></div>
      <PublishedSurveyMap key={result.summary.publicationId} result={result} />
    </section>
    {result.summary.serviceCode === 'COMBO' ? <section className="resource-panel workflow-section">
      <div className="resource-panel-heading"><div><strong>Sàng lọc sức khỏe</strong><span>{result.zones.length} vùng · {result.findings.length} phát hiện</span></div></div>
      {result.limitationNotice ? <Alert type="info" showIcon title={result.limitationNotice} /> : null}
      <Table rowKey="findingId" size="small" dataSource={result.findings} pagination={{ pageSize: 10 }} scroll={{ x: 620 }}
        locale={{ emptyText: 'Không ghi nhận phát hiện nghi bệnh trong kết quả đã phát hành.' }} columns={[
          { title: 'Trụ', render: (_, finding) => polesByProfile.get(finding.plantProfileId) ?? '—' },
          { title: 'Nhãn nghi ngờ', render: (_, finding) => comboFindingLabel(finding.suspectedClassCode) },
          { title: 'Độ tin cậy', render: (_, finding) => `${(finding.confidence * 100).toFixed(1)}%` },
          { title: 'Ghi nhận lúc', render: (_, finding) => dateInVietnam(finding.observedAt) },
          { title: 'Giới hạn', render: (_, finding) => finding.limitations.join(', ') || '—' },
        ]} />
    </section> : null}
    {result.imageIds.length ? <PublishedSurveyImages key={result.summary.publicationId} token={token} tenantId={tenantId} result={result} /> : null}
    <PublishedSurveyHistory key={result.summary.publicationId} token={token} tenantId={tenantId} current={result.summary} polesByProfile={polesByProfile} />
    {claims}
  </>
}

function PublishedSurveyMap({ result }: { result: PublishedSurveyResult }) {
  let boundary: [number, number][][] = []
  try {
    const polygon = result.boundaryGeoJson ? JSON.parse(result.boundaryGeoJson) : null
    if (polygon?.type === 'Polygon' && Array.isArray(polygon.coordinates)) {
      boundary = polygon.coordinates.map((ring: [number, number][]) => ring.map(([lng, lat]) => [lat, lng]))
    }
  } catch { /* Các vị trí trụ vẫn hiển thị nếu không đọc được ranh giới. */ }
  const points = [...boundary.flat(), ...result.poles.map(polePosition)]
  if (!points.length) return <p>Chưa có tọa độ bản đồ cho đợt khảo sát này.</p>
  const mapProps = points.length === 1 ? { center: points[0], zoom: 17 } : { bounds: points, boundsOptions: { padding: [20, 20] as [number, number], maxZoom: 19 } }
  const findingsByProfile = publishedFindingsByProfile(result)
  return <>
    {result.poles.some(pole => findingsByProfile.has(pole.plantProfileId.toLowerCase())) ? <p className="form-hint">Trụ màu đỏ có dấu hiệu nghi bệnh. Bấm vào trụ để xem chi tiết.</p> : null}
    <MapContainer {...mapProps} maxZoom={22} style={{ height: 440, width: '100%' }}>
      <MapBaseLayers />
      {boundary.length ? <Polygon positions={boundary} pathOptions={{ color: '#147658', fillOpacity: 0.08 }} /> : null}
      {result.zones.map(zone => <Polygon key={zone.sourceProposalId} positions={zone.geometry.coordinates.map(ring => ring.map(([lng, lat]): [number, number] => [lat, lng]))}
        pathOptions={{ color: '#ae620e', fillOpacity: 0.22 }}><Popup>Vùng nghi bệnh · {comboFindingLabel(zone.suspectedClassCode)}</Popup></Polygon>)}
      {result.poles.map(pole => {
        const findings = findingsByProfile.get(pole.plantProfileId.toLowerCase())
        return <CircleMarker key={pole.plantProfileId} center={polePosition(pole)} radius={findings ? 6 : 4}
          pathOptions={{ color: findings ? '#b42318' : '#147658', fillOpacity: 0.75 }}>
          <Popup><strong>{pole.plantCode}</strong> · Hàng / cột {poleGrid(pole)}
            {findings ? <PublishedPlantFindings findings={findings} /> : null}
          </Popup>
        </CircleMarker>
      })}
    </MapContainer>
  </>
}

function PublishedSurveyImages({ token, tenantId, result }: { token: string; tenantId: string; result: PublishedSurveyResult }) {
  const [imageId, selectImage] = useState<string | undefined>()
  const [src, setSrc] = useState<{ imageId: string; url: string } | null>(null)
  const orderId = result.summary.orderId
  const image = useQuery({
    queryKey: ['owner-published-image', tenantId, orderId, result.summary.publicationId, imageId],
    queryFn: ({ signal }) => getPublishedSurveyImage(token, orderId, imageId!, signal),
    enabled: !!imageId, gcTime: 0, retry: false, refetchOnWindowFocus: false,
  })
  useEffect(() => {
    if (!imageId || !image.data) return
    const url = URL.createObjectURL(image.data)
    setSrc({ imageId, url })
    return () => URL.revokeObjectURL(url)
  }, [image.data, imageId])
  return <section className="resource-panel workflow-section">
    <div className="resource-panel-heading"><strong>Ảnh khảo sát</strong></div>
    <Select aria-label="Chọn ảnh khảo sát" placeholder="Chọn ảnh để xem" value={imageId} onChange={selectImage}
      options={result.imageIds.map((id, index) => ({ value: id, label: `Ảnh ${index + 1}` }))} style={{ minWidth: 190 }} />
    {imageId && image.isPending ? <p>Đang tải ảnh…</p> : null}
    <SurveyMutationError error={image.error} />
    {imageId && src?.imageId === imageId && image.isSuccess ? <img className="workflow-notice" src={src.url} alt="Ảnh từ đợt khảo sát đã chọn" style={{ display: 'block', maxWidth: '100%', maxHeight: 620 }} /> : null}
  </section>
}

function PublishedSurveyHistory({ token, tenantId, current, polesByProfile }: {
  token: string; tenantId: string; current: PublishedSurveySummary; polesByProfile: Map<string, string>
}) {
  const [previousId, setPreviousId] = useState<string | undefined>()
  const history = useQuery({ queryKey: ['owner-published-history', tenantId, current.farmId],
    queryFn: ({ signal }) => getPublishedSurveyHistory(token, current.farmId, signal), retry: false })
  const historyItems = history.data?.filter(item => item.orderId !== current.orderId) ?? []
  const comparable = historyItems.filter(item => item.baselineMapVersionId === current.baselineMapVersionId && Date.parse(item.publishedAt) < Date.parse(current.publishedAt))
  const compare = useQuery({ queryKey: ['owner-compare-surveys', tenantId, current.farmId, previousId, current.orderId],
    queryFn: ({ signal }) => comparePublishedSurveys(token, current.farmId, previousId!, current.orderId, signal),
    enabled: comparable.some(item => item.orderId === previousId), retry: false })
  const changes = compare.data
  return <section className="resource-panel workflow-section">
    <div className="resource-panel-heading"><strong>Lịch sử kết quả nông trại</strong></div>
    <SurveyMutationError error={history.error} />
    {history.isPending ? <p>Đang tải lịch sử…</p> : null}
    {history.isSuccess && !historyItems.length ? <p>Chưa có đợt khảo sát nào khác đã phát hành.</p> : null}
    {historyItems.length ? <Table rowKey="orderId" size="small" dataSource={historyItems} pagination={{ pageSize: 10 }} columns={[
      { title: 'Dịch vụ', dataIndex: 'serviceCode' },
      { title: 'Thời điểm phát hành', render: (_, item) => dateInVietnam(item.publishedAt) },
      { title: 'Kết quả', render: (_, item) => <Link to={resultUrl(item.orderId)}>Xem kết quả →</Link> },
    ]} /> : null}
    {comparable.length ? <Select aria-label="So sánh với đợt khảo sát trước" placeholder="So sánh với đợt khảo sát trước"
      value={previousId} onChange={setPreviousId} style={{ minWidth: 245 }} allowClear
      options={comparable.map(item => ({ value: item.orderId, label: `${item.serviceCode} · ${dateInVietnam(item.publishedAt)}` }))} /> : null}
    {compare.isFetching ? <p>Đang so sánh…</p> : null}
    <SurveyMutationError error={compare.error} />
    {changes ? <div className="workflow-notice">
      <Space wrap><Tag>Trụ mới {changes.addedPoles.length}</Tag><Tag>Trụ không còn {changes.missingPoles.length}</Tag><Tag>Trụ thay đổi {changes.changedPoles.length}</Tag><Tag>Thay đổi ghi nhận sức khỏe {changes.healthChanges.length}</Tag></Space>
      <Table rowKey="id" size="small" pagination={{ pageSize: 10 }} dataSource={[
        ...changes.addedPoles.map(pole => ({ id: pole.plantProfileId, code: pole.plantCode, label: 'Trụ mới', before: '—', after: poleGrid(pole) })),
        ...changes.missingPoles.map(pole => ({ id: pole.plantProfileId, code: pole.plantCode, label: 'Trụ không còn', before: poleGrid(pole), after: '—' })),
        ...changes.changedPoles.map(({ from, to }) => ({ id: to.plantProfileId, code: to.plantCode, label: 'Vị trí hoặc mã trụ thay đổi',
          before: `${poleGrid(from)} · ${from.latitude}, ${from.longitude}`, after: `${poleGrid(to)} · ${to.latitude}, ${to.longitude}` })),
        ...changes.healthChanges.map(item => ({ id: 'health-' + item.plantProfileId, code: polesByProfile.get(item.plantProfileId) ?? '—',
          label: 'Thay đổi ghi nhận sức khỏe', before: item.fromSuspectedClasses.join(', ') || '—', after: item.toSuspectedClasses.join(', ') || '—' })),
      ]} locale={{ emptyText: 'Không có thay đổi giữa hai đợt khảo sát.' }} columns={[
        { title: 'Mã trụ', dataIndex: 'code' }, { title: 'Thay đổi', dataIndex: 'label' },
        { title: 'Trước', dataIndex: 'before' }, { title: 'Sau', dataIndex: 'after' },
      ]} />
    </div> : null}
  </section>
}
