import { Alert } from 'antd'
import { Link } from 'react-router-dom'
import { CommonState } from '../../components/CommonState'
import { workflowError } from '../surveys/workflow'
import { isPaymentLocked } from './workflow'

export function MapReadError({ error, retry, owner = false }: { error: unknown; retry: () => unknown; owner?: boolean }) {
  if (isPaymentLocked(error)) return <Alert showIcon type="info" title="Kết quả khảo sát đang chờ thanh toán" description={owner ? <>Hoàn tất khoản thanh toán của đơn khảo sát để mở kết quả.<br /><Link className="workflow-detail-link" to="/survey-payments">Xem đơn và thanh toán →</Link></> : 'Kết quả này chưa được mở khóa. Kiểm tra trạng thái đơn khảo sát.'} />
  return <CommonState type="error" description={workflowError(error)} retry={retry} />
}
