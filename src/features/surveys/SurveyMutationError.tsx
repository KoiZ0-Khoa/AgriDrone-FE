import { Alert } from 'antd'
import { ApiError } from '../../api/client'
import { workflowError } from './workflow'

export const mutationNeedsReload = (error: Error | null) => error instanceof ApiError && [401, 403, 404, 409].includes(error.status)
export function SurveyMutationError({ error }: { error: Error | null }) {
  return error ? <Alert className="workflow-notice" showIcon type="error" title={workflowError(error)} description={error instanceof ApiError ? <><p>{error.message}</p><p>Mã lỗi: <code>{error.code ?? `HTTP ${error.status}`}</code></p>{error.traceId ? <p>Mã tra cứu: <code>{error.traceId}</code></p> : null}{mutationNeedsReload(error) ? <p>Đóng biểu mẫu và tải lại dữ liệu trước khi tiếp tục.</p> : null}</> : error.message} /> : null
}
