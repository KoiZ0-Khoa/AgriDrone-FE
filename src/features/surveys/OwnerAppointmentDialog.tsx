import { FormSubmit } from '../../components/FormSubmit'
import { useMutation } from '@tanstack/react-query'
import { Alert, Form, Input, Modal } from 'antd'
import { useRef } from 'react'
import { confirmOwnerAppointment, requestOwnerReschedule } from './ownerOrderApi'
import type { OwnerSurveyOrder } from './ownerOrderTypes'
import { canConfirmOwnerAppointment, canRescheduleOwnerAppointment, ownerAppointmentBody, ownerOrderFingerprint } from './ownerOrderWorkflow'
import type { PaymentHistory } from './paymentWorkflow'
import { SurveyMutationError } from './SurveyMutationError'
import { dateTime } from './workflow'

export type OwnerAppointmentAction = { kind: 'confirm' | 'reschedule'; snapshot: OwnerSurveyOrder }
export function OwnerAppointmentDialog({ token, tenantId, action, current, history, disabled, close, done }: {
  token: string; tenantId: string; action: OwnerAppointmentAction; current: OwnerSurveyOrder; history: PaymentHistory | undefined; disabled: boolean; close: () => void; done: () => Promise<unknown>
}) {
  const [form] = Form.useForm<{ reason?: string }>()
  const submitting = useRef(false)
  const { snapshot, kind } = action
  const stale = ownerOrderFingerprint(snapshot) !== ownerOrderFingerprint(current)
  const mutation = useMutation({ mutationKey: ['owner-order-write', tenantId, snapshot.surveyOrderId], retry: false, mutationFn: async ({ reason }: { reason?: string }) => {
    if (stale) throw new Error('Đơn hoặc lịch hẹn đã thay đổi. Đóng và tải lại trước khi tiếp tục.')
    const body = ownerAppointmentBody(snapshot), appointmentId = snapshot.currentAppointment!.appointmentId
    if (kind === 'confirm') {
      if (!canConfirmOwnerAppointment(snapshot)) throw new Error('Lịch hẹn không còn ở trạng thái cho phép xác nhận.')
      return confirmOwnerAppointment(token, snapshot.surveyOrderId, appointmentId, body)
    }
    if (!canRescheduleOwnerAppointment(snapshot, history)) throw new Error('Lịch hẹn chưa cho phép đổi hoặc đơn đang có giao dịch cần xử lý.')
    const trimmed = reason?.trim() ?? ''
    if (!trimmed || trimmed.length > 1000) throw new Error('Nhập lý do đổi lịch từ 1 đến 1.000 ký tự.')
    return requestOwnerReschedule(token, snapshot.surveyOrderId, appointmentId, { ...body, reason: trimmed })
  }, onSuccess: done, onSettled: () => { submitting.current = false } })
  const blocked = stale || disabled || mutation.isError
  return <Modal open title={kind === 'confirm' ? 'Xác nhận lịch khảo sát' : 'Yêu cầu đổi lịch'} okText={kind === 'confirm' ? 'Xác nhận lịch' : 'Gửi yêu cầu đổi lịch'} cancelText="Hủy" confirmLoading={mutation.isPending} closable={!mutation.isPending} mask={{ closable: !mutation.isPending }} cancelButtonProps={{ disabled: mutation.isPending }} okButtonProps={{ disabled: blocked || mutation.isPending, autoFocus: kind === 'confirm' }} onCancel={() => { if (!mutation.isPending) close() }} onOk={() => form.submit()}>
    <p><strong>{snapshot.farmName}</strong></p><p>{dateTime(snapshot.currentAppointment!.startAt)} – {dateTime(snapshot.currentAppointment!.endAt)}</p>
    {stale ? <Alert showIcon type="warning" title="Đơn hoặc lịch đã thay đổi. Đóng biểu mẫu và kiểm tra lại." /> : null}
    <Form form={form} layout="vertical" disabled={blocked || mutation.isPending} onFinish={values => { if (blocked || mutation.isPending || submitting.current) return; submitting.current = true; mutation.mutate(values) }}>
      <FormSubmit disabled={blocked || mutation.isPending} />
      {kind === 'reschedule' ? <><p>Manager sẽ xem yêu cầu và đề xuất lại thời gian. Lịch mới cần được bạn xác nhận.</p><Form.Item name="reason" label="Lý do đổi lịch" rules={[{ required: true, whitespace: true, message: 'Nhập lý do đổi lịch.' }, { max: 1000 }]}><Input.TextArea rows={4} showCount maxLength={1000} /></Form.Item></> : <p>Sau khi xác nhận, bạn có thể thanh toán khoản cần trả khi đơn đủ điều kiện.</p>}
    </Form>
    <SurveyMutationError error={mutation.error} />
    {mutation.isError ? <p className="form-hint">Đóng biểu mẫu và tải lại để kiểm tra trạng thái trước khi thử lại.</p> : null}
  </Modal>
}
