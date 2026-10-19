import { ArrowLeftOutlined, EditOutlined, EnvironmentOutlined, ReloadOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { Alert, Button, Space } from 'antd'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ApiError } from '../../api/client'
import { CommonState } from '../../components/CommonState'
import { ActionModal } from '../../management/ActionModal'
import { farmAction, isActive, type Action } from '../../management/actions'
import { useAuth } from '../auth/AuthContext'
import { getFarm } from '../farms/farmsApi'
import { getAssignedFarms } from './api'
import { dateTime, workflowError } from './workflow'

export function ManagerFarmDetailPage() {
  const { farmId = '' } = useParams()
  const token = useAuth().session!.accessToken
  const [action, setAction] = useState<Action | null>(null)
  const assigned = useQuery({ queryKey: ['manager-assigned-farms'], queryFn: ({ signal }) => getAssignedFarms(token, signal) })
  const assignment = assigned.data?.find(farm => farm.farmId === farmId)
  const detail = useQuery({ queryKey: ['manager-farm', farmId], queryFn: ({ signal }) => getFarm(token, farmId, signal), enabled: Boolean(assignment), retry: false })

  if (assigned.isPending) return <CommonState type="loading" title="Đang kiểm tra phân công nông trại" />
  if (assigned.isError) return <CommonState type="error" description={workflowError(assigned.error)} retry={() => assigned.refetch()} />
  if (!assignment) return <><Link className="back-link" to="/manager"><ArrowLeftOutlined /> Nông trại phụ trách</Link><CommonState type="forbidden" description="Nông trại không có trong danh sách bạn đang được phân công. Kiểm tra lại với quản trị hệ thống." /></>

  const farm = detail.data?.id === assignment.farmId && detail.data.tenantId === assignment.tenantId ? detail.data : undefined
  const hasSnapshot = Boolean(farm && Number.isSafeInteger(farm.version) && farm.version > 0 && farm.address !== undefined && farm.areaHectares !== undefined && farm.boundary !== undefined && farm.centerPoint !== undefined)
  const canEdit = detail.isSuccess && hasSnapshot && farm && isActive(farm.status)
  const coordinates = farm?.centerPoint?.coordinates
  const area = farm ? farm.areaHectares : assignment.areaHectares
  const accessBlocked = detail.error instanceof ApiError && (detail.error.status === 403 || detail.error.code === 'Tenant.ContextRequired')
  const pointLabel = (index: number) => coordinates ? coordinates[index].toLocaleString('vi-VN', { maximumFractionDigits: 7 }) : farm ? 'Chưa cập nhật' : 'Chưa tải được'

  return <>
    <Link className="back-link" to="/manager"><ArrowLeftOutlined /> Nông trại phụ trách</Link>
    <section className="resource-page-heading detail-heading">
      <div><span className="page-kicker">{assignment.code}</span><h1>{farm?.name ?? assignment.name}</h1><p>{(farm ? farm.address : assignment.address) ?? 'Chưa cập nhật địa chỉ'}</p></div>
      <Space wrap><Button icon={<ReloadOutlined />} loading={detail.isFetching || assigned.isFetching} onClick={() => { void assigned.refetch(); void detail.refetch() }}>Tải lại</Button><Button type="primary" icon={<EditOutlined />} disabled={!canEdit || detail.isFetching || assigned.isFetching} onClick={() => {
        if (!canEdit || !farm) return
        setAction({ ...farmAction(token, farm.id, { name: farm.name, address: farm.address, areaHectares: farm.areaHectares, boundary: farm.boundary, centerPoint: farm.centerPoint, expectedVersion: farm.version }), success: 'Đã cập nhật thông tin nông trại' })
      }}>Chỉnh sửa nông trại</Button></Space>
    </section>
    {detail.isPending ? <CommonState type="loading" title="Đang tải chi tiết nông trại" /> : null}
    {detail.isError ? <Alert className="workflow-notice" showIcon type="error" title={accessBlocked ? 'Chưa được cấp quyền đọc chi tiết nông trại' : 'Không thể tải chi tiết nông trại'} description={<>
      <p>{accessBlocked ? 'Chưa thể đọc chi tiết bằng phiên System Manager. Hãy tải lại để kiểm tra phân công; nếu lỗi vẫn còn, liên hệ quản trị viên kiểm tra quyền truy cập. Chỉnh sửa tạm khóa đến khi tải được dữ liệu đầy đủ.' : workflowError(detail.error)}</p>
      {detail.error instanceof ApiError ? <><p>Lý do từ máy chủ: {detail.error.message}</p><p>Mã lỗi: <code>{detail.error.code ?? `HTTP ${detail.error.status}`}</code></p>{detail.error.traceId ? <p>Mã tra cứu: <code>{detail.error.traceId}</code></p> : null}</> : null}
    </>} /> : null}
    {detail.isSuccess && !hasSnapshot ? <Alert className="workflow-notice" showIcon type="error" title="Chưa đủ dữ liệu để chỉnh sửa" description="Thông tin trả về thiếu version, dữ liệu vị trí hoặc không khớp Farm được phân công. Hãy tải lại và liên hệ nhóm BE nếu lỗi vẫn còn." /> : null}
    <div className="detail-layout">
      <section className="resource-panel detail-main-panel">
        <div className="resource-panel-heading"><div><strong>Thông tin nông trại</strong><span>{farm ? 'Thông tin chi tiết hiện tại' : 'Thông tin từ danh sách được phân công'}</span></div></div>
        <dl className="detail-list"><div><dt>Mã nông trại</dt><dd>{assignment.code}</dd></div><div><dt>Diện tích</dt><dd>{area == null ? 'Chưa cập nhật' : `${area.toLocaleString('vi-VN')} ha`}</dd></div><div><dt>Kinh độ</dt><dd>{pointLabel(0)}</dd></div><div><dt>Vĩ độ</dt><dd>{pointLabel(1)}</dd></div><div><dt>Phân công từ</dt><dd>{dateTime(assignment.assignedAt)}</dd></div>{farm ? <div><dt>Cập nhật lần cuối</dt><dd>{dateTime(farm.updatedAt)}</dd></div> : null}</dl>
      </section>
      <aside className="resource-panel boundary-panel"><span className="resource-icon"><EnvironmentOutlined aria-hidden="true" /></span><strong>Ranh giới canh tác</strong><p>{!farm ? 'Chưa tải được thông tin ranh giới.' : farm.boundary ? `Đã lưu ${farm.boundary.coordinates[0]?.length ?? 0} điểm ranh giới.` : 'Chưa thiết lập ranh giới.'}</p><p>Biểu mẫu chỉnh sửa giữ nguyên ranh giới đã lưu. Diện tích nhập theo ha; kinh độ và vĩ độ xác định vị trí tâm nông trại.</p></aside>
    </div>
    {action ? <ActionModal action={action} close={() => setAction(null)} /> : null}
  </>
}
