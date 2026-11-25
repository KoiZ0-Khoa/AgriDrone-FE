import { ArrowLeftOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, App, Button, Checkbox, Form, Input, Modal, Pagination, Table, Tag } from 'antd'
import { useRef, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { CommonState } from '../../components/CommonState'
import { ActionModal } from '../../management/ActionModal'
import { text, type Action } from '../../management/actions'
import { useAuth } from '../auth/AuthContext'
import { ownerGuid, validOwnerVersion } from './ownerOrderWorkflow'
import { money } from './paymentWorkflow'
import { mutationNeedsReload, SurveyMutationError } from './SurveyMutationError'
import { decideRefund, getAdminRefundQueue, getAdminRefunds, recordRefundTransfer, uploadRefundEvidence, type RefundCaseDetails, type RefundQueueItem } from './qualityRefundApi'
import { QualityRefundCaseCard, RefundCaseDetailsView, RefundEvidenceButton, refundStatusLabel } from './QualityRefundCaseCard'
import { dateTime, workflowError } from './workflow'

const queuePath = '/system/survey-orders/quality-refunds'

export function AdminQualityRefundPage() {
  const { orderId } = useParams()
  const session = useAuth().session!
  if (!orderId) return <RefundQueue token={session.accessToken} actor={session.email} />
  if (!ownerGuid(orderId)) return <CommonState type="error" description="Mã đơn khảo sát không hợp lệ." />
  return <RefundOrderDetail key={orderId} token={session.accessToken} actor={session.email} orderId={orderId} />
}

function RefundQueue({ token, actor }: { token: string; actor: string }) {
  const [page, setPage] = useState(1)
  const query = useQuery({ queryKey: ['quality-refunds', 'admin', actor, 'queue', page], queryFn: ({ signal }) => getAdminRefundQueue(token, page, signal), retry: false })
  return <>
    <Link className="back-link" to="/system/survey-orders"><ArrowLeftOutlined /> Đơn khảo sát</Link>
    <section className="resource-page-heading"><div><h1>Hồ sơ hoàn tiền khảo sát</h1></div><Button loading={query.isFetching} onClick={() => void query.refetch()}>Tải lại</Button></section>
    <section className="resource-panel">
      {query.isError ? <CommonState type="error" description={workflowError(query.error)} retry={() => query.refetch()} /> : <>
        <Table<RefundQueueItem> rowKey={row => row.refundCase.id} dataSource={query.data?.items ?? []} loading={query.isPending} pagination={false} scroll={{ x: 650 }} locale={{ emptyText: 'Chưa có hồ sơ hoàn tiền.' }} columns={[
          { title: 'Mã đơn', render: (_, row) => <Link to={`${queuePath}/${encodeURIComponent(row.refundCase.surveyOrderId)}`} state={{ orderNumber: row.orderNumber }}>{row.orderNumber}</Link> },
          { title: 'Số trụ được báo', render: (_, row) => row.refundCase.issues.length },
          { title: 'Trạng thái', render: (_, row) => <Tag>{refundStatusLabel(row.refundCase)}</Tag> },
          { title: 'Cập nhật', render: (_, row) => dateTime(row.refundCase.updatedAt) },
        ]} />
        <Pagination current={page} pageSize={20} total={query.data?.totalCount ?? 0} showSizeChanger={false} onChange={setPage} />
      </>}
    </section>
  </>
}

function RefundOrderDetail({ token, actor, orderId }: { token: string; actor: string; orderId: string }) {
  const { state } = useLocation()
  const queryClient = useQueryClient()
  const [decision, setDecision] = useState<Action | null>(null)
  const [transfer, setTransfer] = useState<RefundCaseDetails | null>(null)
  const queryKey = ['quality-refunds', 'admin', actor, orderId]
  const query = useQuery({ queryKey, queryFn: ({ signal }) => getAdminRefunds(token, orderId, signal), retry: false })
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['quality-refunds'] })
  function openDecision(item: RefundCaseDetails, approve: boolean) {
    setDecision({
      title: approve ? 'Duyệt hoàn tiền' : 'Từ chối hoàn tiền',
      description: approve ? 'Khi duyệt, hệ thống sẽ thu hồi kết quả Plant Health của đơn và xác định số tiền được hoàn.' : undefined,
      fields: [{ key: 'reason', label: 'Lý do quyết định', kind: 'multiline', max: 2000 }],
      danger: approve,
      success: approve ? 'Đã duyệt hoàn tiền. Chờ chuyển khoản.' : 'Đã từ chối hoàn tiền.',
      run: values => decideRefund(token, orderId, item.id, { approve, reason: text(values, 'reason'), expectedVersion: item.version }),
    })
  }
  const order = query.data
  return <>
    <Link className="back-link" to={queuePath}><ArrowLeftOutlined /> Hồ sơ hoàn tiền khảo sát</Link>
    <section className="resource-page-heading">
      <div><h1>Hoàn tiền khảo sát</h1>{typeof state?.orderNumber === 'string' ? <p>Đơn {state.orderNumber}</p> : null}</div>
      <Button loading={query.isFetching} onClick={() => void query.refetch()}>Tải lại</Button>
    </section>
    {query.isError ? <CommonState type="error" description={workflowError(query.error)} retry={() => query.refetch()} /> : query.isPending ? <CommonState type="loading" /> : null}
    {order ? <>
      <section className="resource-panel"><dl className="detail-list">
        <div><dt>Tổng đã thanh toán</dt><dd>{money(order.grossPaid, order.currency)}</dd></div>
        <div><dt>Đã hoàn</dt><dd>{money(order.refunded, order.currency)}</dd></div>
        <div><dt>Thực thu</dt><dd>{money(order.netCollected, order.currency)}</dd></div>
      </dl></section>
      {order.cases.length === 0 ? <p className="form-hint">Đơn chưa có hồ sơ hoàn tiền.</p> : null}
      {order.cases.map(item => {
        const canDecide = item.status === 'SUBMITTED' && Boolean(item.managerVerifiedAt)
        const disabled = query.isFetching || query.isError || !validOwnerVersion(item.version)
        return <QualityRefundCaseCard key={item.id} item={item} details={<>
          <RefundCaseDetailsView item={item} currency={order.currency} />
          {item.status === 'APPROVED' ? <RefundRecipient item={item} /> : null}
        </>} actions={canDecide ? <>
          <Button type="primary" disabled={disabled || !item.managerFindings?.some(finding => finding.confirmedError)} onClick={() => openDecision(item, true)}>Duyệt hoàn tiền</Button>
          <Button disabled={disabled} onClick={() => openDecision(item, false)}>Từ chối</Button>
        </> : item.status === 'APPROVED' ? <Button type="primary" disabled={disabled || item.approvedAmount == null || item.approvedAmount <= 0} onClick={() => setTransfer(item)}>Ghi nhận chuyển khoản</Button>
          : item.status === 'REFUNDED' && item.transferEvidenceReference ? <RefundEvidenceButton token={token} role="admin" item={item} /> : undefined} />
      })}
      {transfer ? <RecordTransferDialog token={token} item={transfer} currency={order.currency} close={() => setTransfer(null)} refresh={async () => {
        await Promise.all([refresh(), queryClient.invalidateQueries({ queryKey: ['revenue-report'] })])
      }} /> : null}
    </> : null}
    {decision ? <ActionModal action={decision} close={() => setDecision(null)} /> : null}
  </>
}

function RefundRecipient({ item }: { item: RefundCaseDetails }) {
  return <dl className="detail-list">
    <div><dt>Ngân hàng nhận</dt><dd>{item.recipientBankName}</dd></div>
    <div><dt>Số tài khoản</dt><dd>{item.recipientAccountNumber}</dd></div>
    <div><dt>Tên chủ tài khoản</dt><dd>{item.recipientAccountName}</dd></div>
  </dl>
}

function RecordTransferDialog({ token, item, currency, close, refresh }: {
  token: string; item: RefundCaseDetails; currency: string; close: () => void; refresh: () => Promise<void>
}) {
  const { message } = App.useApp()
  const [reference, setReference] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const uploaded = useRef<string | null>(null)
  const submitting = useRef(false)
  const mutation = useMutation({
    mutationFn: async () => {
      if (!file || !confirmed || !reference.trim()) throw new Error('Nhập mã giao dịch và đính kèm ảnh biên lai đã chuyển khoản.')
      uploaded.current ??= await uploadRefundEvidence(token, item.surveyOrderId, item.id, file)
      return recordRefundTransfer(token, item.surveyOrderId, item.id, {
        bankTransferReference: reference.trim(),
        transferEvidenceReference: uploaded.current,
        expectedVersion: item.version,
      })
    },
    retry: false,
    onSuccess: async () => {
      close()
      void message.success('Đã ghi nhận hoàn tiền.')
      await refresh()
    },
    onSettled: () => { submitting.current = false },
  })
  const conflict = mutationNeedsReload(mutation.error)
  const blocked = mutation.isPending || conflict
  return <Modal open title="Ghi nhận chuyển khoản hoàn tiền" okText="Ghi nhận đã chuyển" cancelText={conflict ? 'Đóng và tải lại' : 'Hủy'}
    confirmLoading={mutation.isPending} okButtonProps={{ disabled: blocked || !confirmed || !file || !reference.trim() }}
    cancelButtonProps={{ disabled: mutation.isPending }} closable={!mutation.isPending} keyboard={!mutation.isPending} mask={{ closable: false }}
    onOk={() => { if (!blocked && confirmed && file && reference.trim() && !submitting.current) { submitting.current = true; mutation.mutate() } }}
    onCancel={() => { if (conflict) void refresh(); close() }}>
    <Alert type="info" showIcon title={`Số tiền được duyệt: ${money(item.approvedAmount ?? 0, currency)}`} description="Chuyển tiền trong ứng dụng ngân hàng trước, sau đó ghi nhận giao dịch tại đây." />
    <RefundRecipient item={item} />
    <Form layout="vertical" disabled={blocked}>
      <Form.Item label="Mã giao dịch ngân hàng" required htmlFor="refund-transfer-reference">
        <Input id="refund-transfer-reference" value={reference} maxLength={150} autoComplete="off" onChange={event => setReference(event.target.value)} />
      </Form.Item>
      <Form.Item label="Ảnh biên lai (PNG/JPEG, tối đa 5 MB)" required htmlFor="refund-transfer-file" validateStatus={fileError ? 'error' : undefined} help={fileError || undefined}>
        <input id="refund-transfer-file" type="file" accept="image/png,image/jpeg" disabled={blocked} onChange={event => {
          const chosen = event.target.files?.[0] ?? null
          uploaded.current = null
          const imageType = chosen?.type ? ['image/png', 'image/jpeg'].includes(chosen.type) : /\.(png|jpe?g)$/i.test(chosen?.name ?? '')
          const invalid = chosen && (!imageType || chosen.size === 0 || chosen.size > 5 * 1024 * 1024)
          setFileError(invalid ? 'Chọn ảnh PNG hoặc JPEG hợp lệ, dung lượng tối đa 5 MB.' : '')
          setFile(invalid ? null : chosen)
        }} />
      </Form.Item>
      <Checkbox checked={confirmed} onChange={event => setConfirmed(event.target.checked)}>Ngân hàng đã xác nhận chuyển khoản thành công.</Checkbox>
    </Form>
    <SurveyMutationError error={mutation.error} />
  </Modal>
}
