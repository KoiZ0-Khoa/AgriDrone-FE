import { ReloadOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { Button } from 'antd'
import { Link } from 'react-router-dom'
import { CommonState } from '../../components/CommonState'
import { useAuth } from '../auth/AuthContext'
import { getAssignedFarms } from './api'
import { dateTime, workflowError } from './workflow'

export function ManagerFarmsPage() {
  const token = useAuth().session!.accessToken
  const query = useQuery({ queryKey: ['manager-assigned-farms'], queryFn: ({ signal }) => getAssignedFarms(token, signal) })
  return <>
    <section className="resource-page-heading"><div><span className="page-kicker">SYSTEM MANAGER</span><h1>Nông trại phụ trách</h1><p>Các nông trại bạn đang được phân công quản lý trên toàn hệ thống.</p></div><Button icon={<ReloadOutlined />} onClick={() => { void query.refetch() }}>Tải lại</Button></section>
    {query.isPending ? <CommonState type="loading" /> : query.isError ? <CommonState type="error" description={workflowError(query.error)} retry={() => query.refetch()} /> : query.data.length === 0 ? <CommonState type="empty" title="Chưa có nông trại được phân công" description="Quản trị hệ thống có thể phân công trực tiếp hoặc khi phê duyệt yêu cầu khảo sát." /> : <section className="resource-grid" aria-label="Nông trại được phân công">{query.data.map(farm => <Link className="resource-card" to={`/manager/farms/${encodeURIComponent(farm.farmId)}`} key={farm.farmId}><span className="page-kicker">{farm.code}</span><h2>{farm.name}</h2><p>{farm.address ?? 'Chưa có địa chỉ'}</p><dl className="detail-list"><div><dt>Diện tích</dt><dd>{farm.areaHectares == null ? 'Chưa có' : `${farm.areaHectares.toLocaleString('vi-VN')} ha`}</dd></div><div><dt>Phân công từ</dt><dd>{dateTime(farm.assignedAt)}</dd></div></dl><span className="resource-card-link">Xem chi tiết & chỉnh sửa <span aria-hidden="true">→</span></span></Link>)}</section>}
  </>
}
