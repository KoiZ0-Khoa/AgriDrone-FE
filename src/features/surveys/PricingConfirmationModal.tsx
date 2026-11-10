import { useMutation, useQuery } from '@tanstack/react-query'
import { Alert, Form, Input, Modal } from 'antd'
import { useRef, useState } from 'react'
import { CommonState } from '../../components/CommonState'
import { FormSubmit } from '../../components/FormSubmit'
import { getFarmContext } from './farmOperationsApi'
import { confirmOrderPricing } from './orderApi'
import type { AssignedOrder, ConfirmedPricing, OrderScope } from './orderTypes'
import { pricingConfirmationBody, pricingSnapshotError } from './orderWorkflow'
import { mutationNeedsReload, SurveyMutationError } from './SurveyMutationError'
import { dateTime, workflowError } from './workflow'

export function PricingConfirmationModal({ token, order, scope, close, done }: {
  token: string; order: AssignedOrder; scope: OrderScope; close: () => void; done: (result: ConfirmedPricing) => Promise<void>
}) {
  const [snapshot] = useState(() => ({ order, scope }))
  const [form] = Form.useForm<{ evidence: string }>()
  const submitting = useRef(false)
  const farm = useQuery({ queryKey: ['manager-farm-context', snapshot.scope.farmId], queryFn: ({ signal }) => getFarmContext(token, snapshot.scope.farmId, signal), retry: false, staleTime: 0, refetchOnMount: 'always', refetchOnWindowFocus: false })
  const mutation = useMutation({ retry: false, mutationFn: ({ evidence }: { evidence: string }) => {
    if (!farm.data || farm.isFetching || farm.isError) throw new Error('Chờ tải đầy đủ thông tin bản đồ hiện hành trước khi xác nhận.')
    return confirmOrderPricing(token, snapshot.scope.surveyOrderId, pricingConfirmationBody(snapshot.order, snapshot.scope, farm.data, evidence))
  }, onSuccess: done, onSettled: () => { submitting.current = false } })
  const problem = farm.data ? pricingSnapshotError(snapshot.order, snapshot.scope, farm.data) : null
  const locked = mutationNeedsReload(mutation.error)
  const disabled = !farm.data || farm.isFetching || farm.isError || !!problem || mutation.isPending || locked
  const map = farm.data?.publishedBaseMap
  return <Modal open title="Xác nhận số trụ và giá" okText="Xác nhận số trụ và giá" cancelText={locked ? 'Đóng và tải lại' : 'Hủy'} confirmLoading={mutation.isPending} okButtonProps={{ disabled }} onOk={() => form.submit()} onCancel={() => { if (!mutation.isPending) close() }} closable={!mutation.isPending} mask={{ closable: !mutation.isPending }}>
    <p><strong>{snapshot.order.farmName}</strong> · {snapshot.order.surveyServiceName}</p>
    {farm.isPending || farm.isFetching ? <CommonState type="loading" title="Đang kiểm tra bản đồ hiện hành" /> : farm.isError ? <CommonState type="error" description={workflowError(farm.error)} retry={() => farm.refetch()} /> : problem ? <Alert showIcon type="warning" title={problem} /> : map ? <>
      <p>Bản đồ đã phát hành: <strong>phiên bản {map.versionNumber}</strong> · {dateTime(map.publishedAt)}</p>
      <Alert className="workflow-notice" showIcon type="info" title="Hệ thống xác định số trụ và tổng tiền" description="Máy chủ sẽ đếm trụ đang hoạt động trong phạm vi đã duyệt và áp dụng đơn giá đang hiệu lực. Kết quả chính thức sẽ hiển thị sau khi xác nhận." />
    </> : null}
    <Form form={form} layout="vertical" disabled={disabled} onFinish={values => {
      if (disabled || submitting.current) return
      submitting.current = true
      mutation.mutate(values)
    }}>
      <FormSubmit disabled={disabled} />
      <Form.Item name="evidence" label="Bằng chứng xác nhận" rules={[{ required: true, whitespace: true, message: 'Nhập bằng chứng hoặc ghi chú đã kiểm tra số trụ trên bản đồ.' }, { max: 1000 }]}>
        <Input.TextArea rows={3} maxLength={1000} showCount placeholder="Ví dụ: Đã đối chiếu số trụ trong ranh giới và các khu vực trên bản đồ đã phát hành." />
      </Form.Item>
    </Form>
    <SurveyMutationError error={mutation.error} />
  </Modal>
}
