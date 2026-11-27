import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, App, Button, Form, Input, Modal, Select, Space, Spin } from 'antd'
import { lazy, Suspense, useRef, useState } from 'react'
import { CommonState } from '../../components/CommonState'
import { ApiError } from '../../api/client'
import { mutationNeedsReload, SurveyMutationError } from './SurveyMutationError'
import { getOwnerRefunds, getRefundClaimWindow, getRefundFarmPlants, refundIssueLabels, reportRefund, type ReportRefundBody, type RefundIssue } from './qualityRefundApi'
import { QualityRefundCaseCard, RefundCaseDetailsView, RefundEvidenceButton } from './QualityRefundCaseCard'
import type { PublishedSurveyResult } from './ownerSurveyResultApi'
import { workflowError } from './workflow'

const RefundPlantMap = lazy(() => import('./RefundPlantMap'))
type Props = { publishedResult?: PublishedSurveyResult | null; reloadPublication?: () => void; token: string; tenantId: string; order: { surveyOrderId: string; orderNumber: string; farmId: string; farmName: string; currency: string } }
type IssueDraft = { issueType?: RefundIssue['issueType']; details?: string }
type ReportFields = Omit<ReportRefundBody, 'issues'> & { plants: string[]; issues: Record<string, IssueDraft> }

export function OwnerQualityRefundPanel({ token, tenantId, order, publishedResult, reloadPublication }: Props) {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()
  const orderId = order.surveyOrderId
  const queryKey = ['quality-refunds', 'owner', tenantId, orderId]
  const cases = useQuery({ queryKey: [...queryKey, 'cases'], queryFn: ({ signal }) => getOwnerRefunds(token, orderId, signal), retry: false })
  const claim = useQuery({ queryKey: [...queryKey, 'claim-window'], queryFn: ({ signal }) => getRefundClaimWindow(token, orderId, signal), retry: false })
  const error = cases.error ?? claim.error
  const publicationMatches = publishedResult === undefined || Boolean(publishedResult && claim.data?.v3PublicationId === publishedResult.summary.publicationId)
  const eligible = claim.data?.canReport === true && publicationMatches && !error
  const refresh = async () => {
    reloadPublication?.()
    await queryClient.invalidateQueries({ queryKey })
  }
  return <>
    <section className="resource-panel workflow-section">
      <div className="resource-panel-heading">
        <div><strong>Báo sai kết quả và hoàn tiền</strong><span>Theo dõi hồ sơ của đơn khảo sát này.</span></div>
        <Space wrap>
          <Button loading={cases.isFetching || claim.isFetching} onClick={() => void refresh()}>Tải lại hồ sơ</Button>
          {eligible ? <Button type="primary" disabled={Boolean(error) || cases.isFetching || claim.isFetching || cases.data?.some(item => item.status !== 'REJECTED')} onClick={() => setOpen(true)}>Báo sai kết quả</Button> : null}
        </Space>
      </div>
      {error ? <CommonState type="error" description={workflowError(error)} retry={refresh} /> : null}
      {!error && (cases.isPending || claim.isPending) ? <Spin /> : null}
      {claim.data?.deadlineExclusive ? <p>Hạn gửi báo cáo trước <strong>{new Date(claim.data.deadlineExclusive).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</strong> (giờ Việt Nam).</p> : null}
      {publishedResult && claim.data?.canReport && !publicationMatches ? <Alert type="warning" title="Kết quả đã thay đổi. Tải lại hồ sơ để chọn đúng phiên bản." /> : null}
      {claim.data && !claim.data.canReport ? <p className="form-hint">{claim.data.reason}</p> : null}
      {cases.data?.length === 0 ? <p className="form-hint">Chưa có báo cáo sai kết quả cho đơn này.</p> : null}
    </section>
    {cases.data?.map(item => <QualityRefundCaseCard key={item.id} item={item}
      details={<RefundCaseDetailsView item={item} currency={order.currency} />}
      actions={item.status === 'REFUNDED' && item.transferEvidenceReference ? <RefundEvidenceButton token={token} role="owner" item={item} /> : undefined} />)}
    {open ? <ReportRefundDialog token={token} tenantId={tenantId} order={order} publishedResult={publishedResult} eligible={eligible} close={() => setOpen(false)} refresh={refresh} /> : null}
  </>
}

function ReportRefundDialog({ token, tenantId, order, publishedResult, eligible, close, refresh }: Props & { eligible: boolean; close: () => void; refresh: () => Promise<void> }) {
  const { message } = App.useApp()
  const [form] = Form.useForm<ReportFields>()
  const [showMap, setShowMap] = useState(false)
  const submitting = useRef(false)
  const selected = Form.useWatch('plants', form) ?? []
  const plants = useQuery({
    queryKey: ['quality-refund-farm-plants', tenantId, order.farmId],
    queryFn: ({ signal }) => getRefundFarmPlants(token, order.farmId, signal),
    enabled: publishedResult === undefined, retry: false, refetchOnMount: 'always',
    select: plants => Array.from(new Map(plants.map(plant => [plant.plantCode.trim().toUpperCase(), plant])).values()).filter(plant => plant.plantCode.trim()),
  })
  const plantOptions = publishedResult === undefined ? plants.data ?? [] : publishedResult?.poles.map(pole => ({
    id: pole.plantProfileId, plantCode: pole.plantCode, zoneId: null, row: pole.row, col: pole.column,
    lat: pole.latitude, lon: pole.longitude, lifecycleStatus: 'ACTIVE',
  })) ?? []
  const mutation = useMutation({
    mutationFn: (values: ReportFields) => {
      const codes = new Map(plantOptions.map(plant => [plant.id, plant.plantCode]))
      const issues = values.plants.map(id => {
        const poleCode = codes.get(id)
        const entry = values.issues[id]
        if (!poleCode || !entry?.issueType || !entry.details?.trim()) throw new Error('Kiểm tra lại loại sai sót và mô tả của từng trụ đã chọn.')
        return { poleCode, issueType: entry.issueType, details: entry.details.trim() }
      })
      return reportRefund(token, order.surveyOrderId, {
        ...(publishedResult ? { publicationId: publishedResult.summary.publicationId } : {}),
        issues, description: values.description.trim(), recipientBankName: values.recipientBankName.trim(),
        recipientAccountNumber: values.recipientAccountNumber.trim(), recipientAccountName: values.recipientAccountName.trim(),
      })
    },
    retry: false,
    onSuccess: async () => {
      close()
      void message.success('Đã gửi báo cáo. Manager sẽ xác minh từng trụ.')
      await refresh()
    },
    onSettled: () => { submitting.current = false },
  })
  const conflict = mutationNeedsReload(mutation.error) || (mutation.error instanceof ApiError && mutation.error.code === 'QualityRefund.PublicationChanged')
  const invalidPoles = mutation.error instanceof ApiError && mutation.error.code === 'QualityRefund.PoleOutsideReleasedResult'
  const blocked = !eligible || plants.isFetching || plants.isError || plantOptions.length === 0 || conflict || mutation.isPending
  const byId = new Map(plantOptions.map(plant => [plant.id, plant]))
  return <Modal open title="Báo sai kết quả cây" width={820} okText="Gửi báo cáo" cancelText={conflict ? 'Đóng và tải lại' : 'Hủy'}
    confirmLoading={mutation.isPending} okButtonProps={{ disabled: blocked }} cancelButtonProps={{ disabled: mutation.isPending }}
    closable={!mutation.isPending} keyboard={!mutation.isPending} mask={{ closable: false }}
    onOk={() => form.submit()} onCancel={() => { if (conflict) void refresh(); close() }}>
    <p><strong>{order.farmName}</strong> · Đơn {order.orderNumber}</p>
    {plants.isError ? <CommonState type="error" description={workflowError(plants.error)} retry={() => plants.refetch()} /> : null}
    {!plants.isFetching && plantOptions.length === 0 ? <Alert type="info" title="Nông trại chưa có dữ liệu cây để báo sai." /> : null}
    <Form form={form} layout="vertical" disabled={blocked} initialValues={{ plants: [] }} onFinish={values => {
      if (blocked || submitting.current) return
      submitting.current = true
      mutation.mutate(values)
    }}>
      <Form.Item name="plants" label="Trụ có kết quả sai" validateStatus={invalidPoles ? 'error' : undefined}
        extra={publishedResult ? 'Chọn theo mã trụ trong kết quả đã phát hành.' : 'Đối chiếu mã trụ với kết quả đã phát hành của đơn này.'}
        rules={[{ type: 'array', required: true, min: 1, message: 'Chọn ít nhất một trụ.' }]}>
        <Select mode="multiple" loading={plants.isFetching} placeholder="Tìm theo mã trụ hoặc hàng, cột" maxTagCount={4} showSearch={{ optionFilterProp: 'label' }}
          options={plantOptions.map(plant => ({ value: plant.id, label: plant.row != null && plant.col != null ? `${plant.plantCode} · Hàng ${plant.row}, cột ${plant.col}` : plant.plantCode }))} />
      </Form.Item>
      {plantOptions.some(plant => plant.lat != null && plant.lon != null) ? <div className="workflow-section">
        <Button onClick={() => setShowMap(value => !value)}>{showMap ? 'Ẩn bản đồ' : 'Chọn trên bản đồ'}</Button>
        {showMap ? <>
          <p className="form-hint">Chọn các trụ có kết quả sai trong đơn {order.orderNumber}.</p>
          <Suspense fallback={<Spin />}><RefundPlantMap plants={plantOptions} selected={selected} disabled={blocked} toggle={id => form.setFieldValue('plants', selected.includes(id) ? selected.filter(item => item !== id) : [...selected, id])} /></Suspense>
        </> : null}
      </div> : null}
      {selected.map(id => <fieldset key={id} className="workflow-section">
        <legend>{byId.get(id)?.plantCode ?? 'Trụ không còn trong danh sách'}</legend>
        <Form.Item name={['issues', id, 'issueType']} label="Loại sai sót" rules={[{ required: true, message: 'Chọn loại sai sót.' }]}>
          <Select placeholder="Chọn loại sai sót" options={Object.entries(refundIssueLabels).filter(([value]) => publishedResult?.summary.serviceCode !== 'MAP' || value === 'WRONG_POLE').map(([value, label]) => ({ value, label }))} />
        </Form.Item>
        <Form.Item name={['issues', id, 'details']} label="Chi tiết" rules={[{ required: true, whitespace: true, message: 'Nhập chi tiết sai sót.' }]}>
          <Input.TextArea rows={2} maxLength={1000} />
        </Form.Item>
      </fieldset>)}
      <Form.Item name="description" label="Mô tả chung" rules={[{ required: true, whitespace: true, message: 'Nhập mô tả chung.' }]}>
        <Input.TextArea rows={3} maxLength={2000} />
      </Form.Item>
      <Space orientation="vertical" style={{ width: '100%' }}>
        <strong>Tài khoản nhận hoàn tiền</strong>
        <Form.Item name="recipientBankName" label="Ngân hàng" rules={[{ required: true, whitespace: true, message: 'Nhập tên ngân hàng.' }]}>
          <Input maxLength={150} />
        </Form.Item>
        <Form.Item name="recipientAccountNumber" label="Số tài khoản" rules={[{ required: true, transform: (value: string) => value?.trim(), pattern: /^[0-9]{4,34}$/, message: 'Số tài khoản phải có 4–34 chữ số.' }]}>
          <Input inputMode="numeric" maxLength={34} autoComplete="off" />
        </Form.Item>
        <Form.Item name="recipientAccountName" label="Tên chủ tài khoản" rules={[{ required: true, whitespace: true, message: 'Nhập tên chủ tài khoản.' }]}>
          <Input maxLength={150} />
        </Form.Item>
      </Space>
    </Form>
    {!eligible && !conflict ? <Alert type="warning" title="Đơn hiện không thể gửi báo cáo. Đóng biểu mẫu để kiểm tra trạng thái mới." /> : null}
    <SurveyMutationError error={mutation.error} />
  </Modal>
}
