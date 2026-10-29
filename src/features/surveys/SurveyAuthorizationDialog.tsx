import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Button, Form, Input, Modal, Radio, Space } from 'antd'
import { useState } from 'react'
import { ApiError } from '../../api/client'
import { CommonState } from '../../components/CommonState'
import * as api from './systemOrderApi'
import type { AuthorizationType, CaptureAuthorization, VerifyAuthorizationValues } from './systemOrderTypes'
import { dateTime, workflowError } from './workflow'

export const authorizationLabels: Record<AuthorizationType, string> = { WRITTEN_DATA_USE_CONSENT: 'Đồng ý sử dụng dữ liệu', FLIGHT_PERMISSION: 'Giấy phép bay' }
export const authorizationStatusLabels: Record<string, string> = { PENDING: 'Chờ xác minh', VERIFIED: 'Đã xác minh', REVOKED: 'Đã thu hồi' }

function ErrorNotice({ error }: { error: Error | null }) {
  return error ? <Alert className="workflow-notice" type="error" showIcon title={workflowError(error)} description={error instanceof ApiError ? <><p>{error.message}</p><p>Mã lỗi: <code>{error.code ?? `HTTP ${error.status}`}</code></p>{error.traceId ? <p>Mã tra cứu: <code>{error.traceId}</code></p> : null}</> : undefined} /> : null
}

function EvidenceFileInput({ id, disabled, onChange }: { id?: string; disabled?: boolean; value?: File; onChange?: (file: File | undefined) => void }) {
  return <input id={id} disabled={disabled} type="file" accept=".jpg,.jpeg,.png,.pdf" onChange={event => onChange?.(event.target.files?.[0])} />
}

export function AuthorizationDialog({ token, orderId, type, close }: { token: string; orderId: string; type: AuthorizationType; close: () => void }) {
  const query = useQuery({ queryKey: ['survey-authorization', orderId, type], queryFn: async ({ signal }) => {
    const item = await api.getCaptureAuthorization(token, orderId, type, signal)
    api.assertAuthorization(item, orderId, type)
    return item
  }, staleTime: 0, refetchOnMount: 'always', refetchOnReconnect: false, refetchOnWindowFocus: false })
  const [busy, setBusy] = useState(false)
  return <Modal open width={680} title={authorizationLabels[type]} footer={null} onCancel={() => { if (!busy) close() }} closable={!busy} keyboard={!busy} mask={{ closable: !busy }}>
    {query.isPending || query.isFetching ? <CommonState type="loading" /> : query.isError ? <CommonState type="error" description={workflowError(query.error)} retry={() => query.refetch()} /> : <AuthorizationEditor token={token} authorization={query.data} close={close} setBusy={setBusy} />}
  </Modal>
}

export function AuthorizationEditor({ token, authorization, close, setBusy }: { token: string; authorization: CaptureAuthorization; close: () => void; setBusy: (busy: boolean) => void }) {
  const [snapshot] = useState(authorization)
  const [action, setAction] = useState<'verify' | 'revoke' | null>(null)
  const [form] = Form.useForm<VerifyAuthorizationValues & { reason: string }>()
  const [mode, setMode] = useState<'file' | 'mock'>('file')
  const client = useQueryClient()
  const mutation = useMutation({ retry: false, mutationFn: (values: VerifyAuthorizationValues & { reason: string }) => {
    if (action === 'verify') return api.verifyCaptureAuthorization(token, snapshot.surveyOrderId, snapshot.type, snapshot, { ...values, mode })
    if (action === 'revoke') return api.revokeCaptureAuthorization(token, snapshot.surveyOrderId, snapshot.type, snapshot, values.reason)
    throw new Error('Chọn thao tác trước khi xác nhận.')
  }, onMutate: () => setBusy(true), onSuccess: async () => {
    await Promise.all([client.invalidateQueries({ queryKey: ['survey-authorizations', snapshot.surveyOrderId] }), client.invalidateQueries({ queryKey: ['system-survey-orders'] })])
    close()
  }, onSettled: () => setBusy(false) })
  const evidence = useMutation({ retry: false, mutationFn: async () => {
    const result = await api.getAuthorizationEvidence(token, snapshot.surveyOrderId, snapshot.type)
    return { result, url: api.evidenceDownloadUrl(snapshot, result) }
  } })
  const locked = mutation.error instanceof ApiError && [401, 403, 404, 409].includes(mutation.error.status)
  const canVerify = snapshot.status === 'PENDING' || snapshot.status === 'VERIFIED'
  const expired = snapshot.expiresAt !== null && Date.parse(snapshot.expiresAt) <= Date.now()
  return <>
    <dl className="detail-list">
      <div><dt>Trạng thái</dt><dd>{authorizationStatusLabels[snapshot.status] ?? snapshot.status}{expired ? ' · Đã hết hạn' : ''}</dd></div>
      <div><dt>Ngày cấp</dt><dd>{dateTime(snapshot.issuedAt)}</dd></div><div><dt>Ngày hết hạn</dt><dd>{dateTime(snapshot.expiresAt)}</dd></div>
      <div><dt>Đã xác minh lúc</dt><dd>{dateTime(snapshot.verifiedAt)}</dd></div><div><dt>Đã thu hồi lúc</dt><dd>{dateTime(snapshot.revokedAt)}</dd></div>
      <div><dt>Bằng chứng</dt><dd>{snapshot.evidenceReference ?? 'Chưa có bằng chứng'}</dd></div>
    </dl>
    {snapshot.evidenceReference ? <><Button className="workflow-notice" loading={evidence.isPending} onClick={() => evidence.mutate()}>Lấy liên kết xem bằng chứng</Button>
      {evidence.data ? <Alert className="workflow-notice" type="info" showIcon title={evidence.data.result.isMock ? 'Bằng chứng giả lập, không có file đính kèm' : evidence.data.url ? 'Liên kết bằng chứng đã sẵn sàng' : 'Chưa có liên kết tải bằng chứng'} description={<>{evidence.data.result.note}{evidence.data.url ? <p><a className="workflow-detail-link" href={evidence.data.url} target="_blank" rel="noopener noreferrer">Mở bằng chứng ↗</a><br />Hết hạn: {dateTime(evidence.data.result.urlExpiresAt)}</p> : null}</>} /> : null}
      <ErrorNotice error={evidence.error} />
    </> : null}
    {snapshot.status === 'REVOKED' ? <Alert className="workflow-notice" type="warning" showIcon title="Giấy tờ đã thu hồi không thể xác minh lại." /> : null}
    {!action ? <Space className="workflow-toolbar" wrap>{canVerify ? <Button type="primary" onClick={() => setAction('verify')}>{snapshot.status === 'VERIFIED' ? 'Cập nhật xác minh' : 'Xác minh giấy tờ'}</Button> : null}{snapshot.status === 'VERIFIED' ? <Button danger onClick={() => setAction('revoke')}>Thu hồi giấy tờ</Button> : null}<Button onClick={close}>Đóng</Button></Space> : <>
      <Form form={form} className="workflow-section" layout="vertical" disabled={mutation.isPending || locked} onFinish={values => { if (!mutation.isPending && !locked) mutation.mutate(values) }}>
        {action === 'verify' ? <>
          <Form.Item label="Bằng chứng xác minh"><Radio.Group value={mode} onChange={event => { setMode(event.target.value); form.setFieldValue('file', undefined); form.setFieldValue('mockReference', undefined) }} options={[{ value: 'file', label: 'Tải file' }, { value: 'mock', label: 'Giả lập để demo' }]} /></Form.Item>
          {mode === 'file' ? <Form.Item name="file" label="Ảnh hoặc tài liệu scan" rules={[{ required: true, message: 'Chọn file bằng chứng' }]}><EvidenceFileInput disabled={mutation.isPending || locked} /></Form.Item> : <><Alert className="workflow-notice" type="warning" showIcon title="Chế độ demo: mã giả lập vẫn được BE dùng để xác minh giấy tờ." /><Form.Item name="mockReference" label="Mã bằng chứng giả lập" rules={[{ required: true, whitespace: true }, { max: 200 }]}><Input maxLength={200} /></Form.Item></>}
          <p className="form-hint">JPG, PNG hoặc PDF, tối đa 10 MB. Xác nhận sau khi đã kiểm tra nội dung và thời hạn giấy tờ.</p>
          <Form.Item name="issuedAt" label="Ngày cấp (giờ địa phương)" rules={[{ required: true }]}><Input type="datetime-local" /></Form.Item>
          <Form.Item name="expiresAt" label="Ngày hết hạn (giờ địa phương, nếu có)"><Input type="datetime-local" /></Form.Item>
        </> : <><Alert className="workflow-notice" type="warning" showIcon title="Thu hồi sẽ làm mất hiệu lực giấy tờ đối với điều kiện thu thập dữ liệu." /><Form.Item name="reason" label="Lý do thu hồi" rules={[{ required: true, whitespace: true }, { max: 2000 }]}><Input.TextArea rows={3} maxLength={2000} showCount /></Form.Item></>}
        <Space wrap><Button type="primary" danger={action === 'revoke'} htmlType="submit" loading={mutation.isPending} disabled={locked}>{action === 'verify' ? 'Xác nhận xác minh' : 'Xác nhận thu hồi'}</Button><Button disabled={mutation.isPending} onClick={close}>{locked ? 'Đóng và tải lại' : 'Hủy'}</Button></Space>
      </Form>
      <ErrorNotice error={mutation.error} />
    </>}
  </>
}
