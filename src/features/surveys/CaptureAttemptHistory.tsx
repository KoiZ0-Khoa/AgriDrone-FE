import { Alert, Tag, Timeline } from 'antd'
import { Link } from 'react-router-dom'
import { CommonState } from '../../components/CommonState'
import type { V3CaptureAttempt } from './v3Types'
import { captureAttemptActionLabels, captureAttemptStatusLabels, isActiveCaptureAttempt } from './v3Workflow'
import { dateTime, workflowError } from './workflow'

const statusColor = (status: string) =>
  status === 'ACCEPTED' ? 'success' : status === 'FLIGHT_FAILED' || status === 'CANCELLED' ? 'error' : status === 'REFLIGHT_REQUIRED' ? 'warning' : 'processing'
const statusLabel = (status: string | null) => status ? captureAttemptStatusLabels[status as keyof typeof captureAttemptStatusLabels] ?? status : 'Mới tạo'

// G6 — lịch sử chuyến bay của đơn V3, đọc từ GET capture-attempts. Lần mới nhất ở trên; mỗi lần có dòng thời gian chuyển trạng thái.
export function CaptureAttemptHistory({ attempts, error, loading, farmId, orderId }: {
  attempts: readonly V3CaptureAttempt[] | undefined; error: unknown; loading: boolean; farmId: string; orderId: string
}) {
  const byId = new Map((attempts ?? []).map(attempt => [attempt.captureAttemptId, attempt]))
  const newestFirst = [...(attempts ?? [])].sort((a, b) => b.attemptIndex - a.attemptIndex)
  return <section className="resource-panel workflow-section" aria-label="Lịch sử chuyến bay">
    <div className="resource-panel-heading"><div><strong>Lịch sử chuyến bay</strong><span>Mỗi lần bay lại là một lần bay và nhiệm vụ riêng; ảnh của các lần không trộn với nhau.</span></div></div>
    {error ? <Alert type="warning" showIcon title="Không tải được lịch sử chuyến bay" description={workflowError(error)} />
      : loading ? <CommonState type="loading" />
      : newestFirst.length === 0 ? <p className="form-hint">Chưa có lần bay nào.</p>
      : newestFirst.map(attempt => {
        const parent = attempt.parentAttemptId ? byId.get(attempt.parentAttemptId) : undefined
        const mappingSource = attempt.mappingSourceAttemptId ? byId.get(attempt.mappingSourceAttemptId) : undefined
        return <article key={attempt.captureAttemptId} className="workflow-section">
          <p>
            <strong>Lần bay {attempt.attemptIndex}</strong>{' '}
            {attempt.mappingSourceAttemptId ? <Tag>Bay bệnh{mappingSource ? ` · Dùng bản đồ lần ${mappingSource.attemptIndex}` : ''}</Tag> : null}
            <Tag color={statusColor(attempt.status)}>{statusLabel(attempt.status)}</Tag>
            {isActiveCaptureAttempt(attempt) ? <Tag>Đang hoạt động</Tag> : null}
            {attempt.parentAttemptId ? <span className="form-hint"> · Bay lại từ lần {parent?.attemptIndex ?? '?'}</span> : null}
          </p>
          <dl className="detail-list">
            <div><dt>Bắt đầu bay</dt><dd>{dateTime(attempt.startedAt)}</dd></div>
            <div><dt>Kết thúc / gặp lỗi</dt><dd>{dateTime(attempt.endedAt)}</dd></div>
            <div><dt>Nhiệm vụ</dt><dd>{attempt.missionId
              ? <Link className="workflow-detail-link" to={`/manager/farms/${encodeURIComponent(farmId)}/missions/${encodeURIComponent(attempt.missionId)}?orderId=${encodeURIComponent(orderId)}`}>Mở nhiệm vụ của lần {attempt.attemptIndex} →</Link>
              : 'Chưa gắn nhiệm vụ'}</dd></div>
          </dl>
          {attempt.history?.length ? <Timeline items={[...attempt.history].sort((a, b) => a.transitionSequence - b.transitionSequence).map(item => ({
            key: item.transitionSequence,
            color: item.toStatus === 'FLIGHT_FAILED' || item.toStatus === 'CANCELLED' ? 'red' : item.toStatus === 'ACCEPTED' ? 'green' : 'blue',
            content: <>
              <strong>{captureAttemptActionLabels[item.action] ?? item.action}</strong>
              <span className="form-hint"> · {dateTime(item.createdAt)} · {statusLabel(item.fromStatus)} → {statusLabel(item.toStatus)}</span>
              {item.reason ? <div className="form-hint">{item.reason}</div> : null}
            </>,
          }))} /> : null}
        </article>
      })}
  </section>
}
