import { ApiError } from '../../api/client'
import { text, type Action } from '../../management/actions'
import type { AdminCancellationBody, SystemOrder } from './systemOrderTypes'
import { decideOrderCancellation } from './v3Api'
import { v3OperationFor, v3ServiceKind, type V3Operation } from './v3Workflow'
import { workflowError } from './workflow'

const cancellationStatuses = new Set([
  'AWAITING_APPOINTMENT', 'AWAITING_DEPOSIT', 'READY_FOR_CAPTURE', 'AWAITING_CAPTURE_UPLOAD',
  'AWAITING_INPUT_REVIEW', 'AWAITING_PROCESSING', 'PROCESSING', 'AWAITING_REFLIGHT_DECISION', 'AWAITING_SETTLEMENT',
])

export const canCancelSystemOrder = (order: SystemOrder) =>
  v3ServiceKind(order.surveyServiceCode) !== null && cancellationStatuses.has(order.status)
  && Number.isInteger(order.orderVersion) && order.orderVersion > 0 && order.orderVersion <= 4_294_967_295

export function systemOrderCancellationAction(token: string, requesterId: string, order: SystemOrder): Action {
  let operation: V3Operation | null = null
  return {
    title: `Hủy đơn khảo sát · ${order.farmName}`,
    description: 'Đơn sẽ chuyển sang Đã hủy. Hệ thống tính khoản phải hoàn theo chính sách đã chốt của đơn và ghi nhận nghĩa vụ hoàn nếu có.',
    danger: true,
    fields: [
      { key: 'kind', label: 'Trường hợp hủy', kind: 'select', options: [
        { label: 'Hoãn do vận hành', value: 'OPERATIONAL_POSTPONEMENT' },
        { label: 'Dịch vụ thất bại', value: 'SERVICE_FAILURE' },
      ] },
      { key: 'reason', label: 'Lý do hủy', kind: 'multiline', max: 500 },
    ],
    run: async values => {
      if (!canCancelSystemOrder(order)) throw new Error('Trạng thái đơn chưa cho phép hủy. Hãy tải lại và kiểm tra.')
      const decisionKind = text(values, 'kind')
      if (decisionKind !== 'OPERATIONAL_POSTPONEMENT' && decisionKind !== 'SERVICE_FAILURE') throw new Error('Hãy chọn trường hợp hủy.')
      const body = {
        requesterId,
        decisionKind,
        requestedRetentionAmount: 0,
        reasonCode: decisionKind,
        reasonDescription: text(values, 'reason'),
        expectedOrderVersion: order.orderVersion,
      } satisfies Omit<AdminCancellationBody, 'operationId' | 'payloadFingerprint'>
      operation = await v3OperationFor(operation, body)
      try {
        return await decideOrderCancellation(token, order.surveyOrderId, {
          ...body, operationId: operation.operationId, payloadFingerprint: operation.payloadFingerprint,
        })
      } catch (error) {
        if (!(error instanceof ApiError)) throw error
        throw new ApiError(error.status, workflowError(error), error.code, error.traceId, error.validationErrors)
      }
    },
    success: 'Đã hủy đơn khảo sát',
  }
}
