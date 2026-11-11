import { readableCode } from '../../components/RecordReference'
import { ArrowLeftOutlined, EditOutlined, EnvironmentOutlined, ReloadOutlined } from '@ant-design/icons'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Button, Space, Table } from 'antd'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CommonState } from '../../components/CommonState'
import { ActionModal } from '../../management/ActionModal'
import { farmAction, isActive, type Action } from '../../management/actions'
import { useAuth } from '../auth/AuthContext'
import { getAssignedFarms } from './api'
import { FarmBoundaryExceptions } from './FarmBoundaryExceptions'
import { FarmBoundaryModal } from './FarmBoundaryModals'
import { getFarmContext } from './farmOperationsApi'
import { SurveyMutationError } from './SurveyMutationError'
import { dateTime, workflowError } from './workflow'
import { getFarmMissions } from '../missions/missionApi'
import type { MissionListItem } from '../missions/missionTypes'
import { missionStatusLabel } from '../missions/missionWorkflow'

export function ManagerFarmDetailPage() {
  const { farmId = '' } = useParams()
  const token = useAuth().session!.accessToken
  const client = useQueryClient()
  const [action, setAction] = useState<Action | null>(null)
  const [boundaryOpen, setBoundaryOpen] = useState(false)
  const assigned = useQuery({ queryKey: ['manager-assigned-farms'], queryFn: ({ signal }) => getAssignedFarms(token, signal) })
  const assignment = assigned.data?.find(farm => farm.farmId === farmId)
  const detail = useQuery({ queryKey: ['manager-farm-context', farmId], queryFn: ({ signal }) => getFarmContext(token, farmId, signal), enabled: Boolean(assignment), retry: false })
  // Danh sách đầy đủ, không phụ thuộc việc suy ra Mission từ Order (missionCode prefix) — luôn là đường vào Mission dù Mission
  // có gắn đúng Order hay không (BE chưa có GET 1 Mission riêng, xem ghi chú trong mission-flight-plan-2026-10-30.md).
  const missionsQuery = useQuery({ queryKey: ['manager-farm-missions', farmId], queryFn: ({ signal }) => getFarmMissions(token, farmId, 1, 50, signal), enabled: Boolean(assignment) })
  async function refresh() { await Promise.all([client.invalidateQueries({ queryKey: ['manager-farm-context', farmId] }), client.invalidateQueries({ queryKey: ['manager-assigned-farms'] }), client.invalidateQueries({ queryKey: ['farm-boundary-exceptions', farmId] }), client.invalidateQueries({ queryKey: ['manager-order-scope'] })]) }
  const back = <Link className="back-link" to="/manager"><ArrowLeftOutlined /> Nông trại phụ trách</Link>
  if (assigned.isPending) return <CommonState type="loading" title="Đang kiểm tra phân công nông trại" />
  if (assigned.isError) return <CommonState type="error" description={workflowError(assigned.error)} retry={() => assigned.refetch()} />
  if (!assignment) return <>{back}<CommonState type="forbidden" description="Nông trại không có trong danh sách bạn đang được phân công." /></>
  if (detail.isPending) return <>{back}<CommonState type="loading" title="Đang tải nông trại" /></>
  if (detail.isError) return <>{back}<SurveyMutationError error={detail.error} /><Button onClick={() => { void refresh() }}>Tải lại nông trại</Button></>
  const farm = detail.data
  if (farm.farmId !== farmId || farm.tenantId !== assignment.tenantId) return <>{back}<CommonState type="error" description="Thông tin nông trại không khớp phân công hiện tại." retry={refresh} /></>
  const validVersion = Number.isSafeInteger(farm.version) && farm.version > 0
  const busy = detail.isFetching || assigned.isFetching
  const active = isActive(farm.status)
  const canEdit = validVersion && active && farm.centerPoint !== undefined
  const coordinates = farm.centerPoint?.coordinates
  const boundary = farm.approvedBoundary
  return <>
    {back}
    <section className="resource-page-heading detail-heading"><div><span className="page-kicker">{readableCode(farm.code)}</span><h1>{farm.name}</h1><p>{farm.address ?? 'Chưa cập nhật địa chỉ'}</p></div>
      <Space wrap><Button icon={<ReloadOutlined />} loading={busy} onClick={() => { void refresh() }}>Tải lại</Button><Button type="primary" icon={<EditOutlined />} disabled={!canEdit || busy} onClick={() => {
        if (!canEdit) return
        setAction({ ...farmAction(token, farm.farmId, { name: farm.name, address: farm.address, areaHectares: farm.areaHectares, boundary: boundary?.geometry ?? null, centerPoint: farm.centerPoint!, expectedVersion: farm.version }), after: refresh })
      }}>Chỉnh sửa nông trại</Button></Space>
    </section>
    {!validVersion ? <Alert className="workflow-notice" showIcon type="warning" title="Thiếu phiên bản nông trại. Tải lại trước khi cập nhật." /> : null}
    {farm.centerPoint === undefined ? <Alert className="workflow-notice" showIcon type="info" title="Chưa thể sửa thông tin chung" description="Thông tin vị trí tâm chưa được cung cấp đầy đủ. Chức năng chỉnh sửa tạm khóa để tránh làm mất tọa độ đã lưu. Bạn vẫn có thể xem và xử lý ranh giới bên dưới." /> : null}
    <div className="detail-layout"><section className="resource-panel detail-main-panel"><div className="resource-panel-heading"><div><strong>Thông tin nông trại</strong><span>Thông tin hiện tại của nông trại được phân công</span></div></div>
      <dl className="detail-list">{readableCode(farm.code) ? <div><dt>Mã nông trại</dt><dd>{readableCode(farm.code)}</dd></div> : null}<div><dt>Trạng thái</dt><dd>{active ? 'Đang hoạt động' : farm.status}</dd></div><div><dt>Diện tích</dt><dd>{farm.areaHectares == null ? 'Chưa cập nhật' : `${farm.areaHectares.toLocaleString('vi-VN')} ha`}</dd></div><div><dt>Kinh độ</dt><dd>{coordinates ? coordinates[0].toLocaleString('vi-VN', { maximumFractionDigits: 7 }) : farm.centerPoint === undefined ? 'Chưa có dữ liệu vị trí tâm' : 'Chưa cập nhật'}</dd></div><div><dt>Vĩ độ</dt><dd>{coordinates ? coordinates[1].toLocaleString('vi-VN', { maximumFractionDigits: 7 }) : farm.centerPoint === undefined ? 'Chưa có dữ liệu vị trí tâm' : 'Chưa cập nhật'}</dd></div><div><dt>Phân công từ</dt><dd>{dateTime(assignment.assignedAt)}</dd></div></dl>
    </section><aside className="resource-panel boundary-panel"><span className="resource-icon"><EnvironmentOutlined aria-hidden="true" /></span><strong>Ranh giới đã duyệt</strong><p>{boundary ? `Phiên bản ${boundary.versionNumber} · ${boundary.geometry?.coordinates[0]?.length ?? 0} điểm` : 'Chưa xác lập ranh giới. Thu thập tại buổi khảo sát bản đồ nền.'}</p>{boundary ? <><p>{boundary.reviewReason}</p><p>{dateTime(boundary.reviewedAt)}</p><Button icon={<EditOutlined />} disabled={busy || !active || !validVersion || !boundary.geometry || !Number.isSafeInteger(boundary.versionNumber) || boundary.versionNumber < 1} onClick={() => setBoundaryOpen(true)}>Cập nhật ranh giới</Button></> : <Link className="workflow-detail-link" to="/manager/orders">Mở công việc khảo sát →</Link>}</aside></div>
    <section className="resource-panel workflow-section"><div className="resource-panel-heading"><div><strong>Khu vực và bản đồ nền</strong><span>{farm.publishedBaseMap ? `Bản đồ đã công bố: phiên bản ${farm.publishedBaseMap.versionNumber} · ${dateTime(farm.publishedBaseMap.publishedAt)}` : 'Chưa có bản đồ nền đã công bố'}</span></div></div><Table rowKey="id" dataSource={farm.zones} pagination={false} locale={{ emptyText: 'Chưa có khu vực.' }} columns={[{ title: 'Mã', render: (_, zone) => readableCode(zone.code) ?? '—' }, { title: 'Khu vực', dataIndex: 'name' }, { title: 'Diện tích', render: (_, zone) => zone.areaHectares == null ? 'Chưa cập nhật' : `${zone.areaHectares} ha` }, { title: 'Trạng thái', render: (_, zone) => isActive(zone.status) ? 'Đang hoạt động' : zone.status }]} /></section>
    <section className="resource-panel workflow-section"><div className="resource-panel-heading"><div><strong>Nhiệm vụ bay</strong><span>Toàn bộ nhiệm vụ bay của nông trại này — bấm "Xem →" để mở checklist/upload/ghép bản đồ của từng nhiệm vụ.</span></div><Button size="small" icon={<ReloadOutlined />} loading={missionsQuery.isFetching} onClick={() => { void missionsQuery.refetch() }}>Tải lại</Button></div>
      {missionsQuery.isError ? <CommonState type="error" description={workflowError(missionsQuery.error)} retry={() => missionsQuery.refetch()} />
        : <Table<MissionListItem> rowKey="id" size="small" loading={missionsQuery.isPending} dataSource={missionsQuery.data?.items ?? []} pagination={false} locale={{ emptyText: 'Chưa có nhiệm vụ bay nào.' }} columns={[
          { title: 'Mã nhiệm vụ', render: (_, mission) => readableCode(mission.missionCode) ?? mission.missionCode },
          { title: 'Trạng thái', render: (_, mission) => missionStatusLabel(mission.status) },
          { title: 'Lịch bay', render: (_, mission) => mission.scheduledAt ? dateTime(mission.scheduledAt) : 'Chưa lên lịch' },
          { title: 'Tạo lúc', render: (_, mission) => dateTime(mission.createdAt) },
          { title: 'Thao tác', render: (_, mission) => <Link className="workflow-detail-link" to={`/manager/farms/${encodeURIComponent(farmId)}/missions/${encodeURIComponent(mission.id)}`}>Xem →</Link> },
        ]} />}
    </section>
    <section className="resource-panel workflow-section"><div className="resource-panel-heading"><div><strong>Bản đồ và trụ cây</strong><span>Xem các phiên bản bản đồ và lịch sử vòng đời trụ.</span></div><Link className="workflow-detail-link" to={`/manager/farms/${encodeURIComponent(farmId)}/base-maps`}>Mở bản đồ →</Link></div></section>
    <section className="resource-panel workflow-section"><div className="resource-panel-heading"><div><strong>Duyệt bản đồ nền</strong><span>Kiểm tra kết quả nhận diện cây/trụ và phát hành bản đồ chính thức.</span></div><Link className="workflow-detail-link" to={`/manager/farms/${encodeURIComponent(farmId)}/base-map-drafts`}>Mở bản đồ nháp →</Link></div></section>
    <section className="resource-panel workflow-section"><div className="resource-panel-heading"><div><strong>Bản đồ sức khỏe cây</strong><span>Tổng hợp tình trạng cây trồng từ các chuyến bay quét bệnh.</span></div><Link className="workflow-detail-link" to={`/manager/farms/${encodeURIComponent(farmId)}/plant-health`}>Mở bản đồ sức khỏe cây →</Link></div></section>
    <FarmBoundaryExceptions key={farmId} token={token} farm={farm} disabled={busy || !active || !validVersion} />
    {boundaryOpen ? <FarmBoundaryModal token={token} farm={farm} close={() => { setBoundaryOpen(false); void refresh() }} done={async () => { setBoundaryOpen(false); await refresh() }} /> : null}
    {action ? <ActionModal action={action} close={() => { setAction(null); void refresh() }} /> : null}
  </>
}
