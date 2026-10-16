import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Alert, Button, Form, Input } from 'antd'
import { useAuth } from '../features/auth/AuthContext'
import { previewInvitation, previewSystemManagerInvitation, type InvitationKind, type InvitationPreview, type SystemManagerInvitationPreview } from './api'
import { acceptAction } from './actions'
import { ActionModal } from './ActionModal'

export function InvitationPage({ kind = 'tenant' }: { kind?: InvitationKind }) {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  return <InvitationContent key={`${kind}:${token}`} initialToken={token} kind={kind} />
}

function InvitationContent({ initialToken, kind }: { initialToken: string; kind: InvitationKind }) {
  const auth = useAuth()
  const navigate = useNavigate()
  const [input, setInput] = useState(initialToken)
  const [token, setToken] = useState(initialToken.trim())
  const [open, setOpen] = useState(true)
  const [accepted, setAccepted] = useState(false)
  const preview = useQuery<InvitationPreview | SystemManagerInvitationPreview>({
    queryKey: ['invitation-preview', kind, token],
    queryFn: ({ signal }) => kind === 'system-manager' ? previewSystemManagerInvitation(token, signal) : previewInvitation(token, signal),
    enabled: Boolean(token) && !accepted,
    retry: false, gcTime: 0, refetchOnWindowFocus: false, refetchOnReconnect: false,
  })
  return <main className="login-page"><section className="login-main"><div className="login-card">
    <h1>{kind === 'system-manager' ? 'Nhận lời mời System Manager' : 'Tham gia đơn vị AgriDrone'}</h1>
    {accepted ? <Alert type="success" showIcon title="Đã chấp nhận lời mời" description={kind === 'system-manager' ? 'Tài khoản của email được mời đã nhận vai trò System Manager.' : 'Đăng nhập bằng tài khoản của email được mời để chọn đơn vị vừa tham gia.'} /> : <>
      <p>Mở liên kết trong email hoặc nhập mã lời mời để tiếp tục.</p>
      <Form layout="vertical" onFinish={() => { const next = input.trim(); if (!next) return; setOpen(true); if (next === token) void preview.refetch(); else setToken(next) }}>
        <Form.Item label="Mã lời mời" htmlFor="invitation-token" required>
          <Input id="invitation-token" value={input} maxLength={512} autoComplete="off" onChange={e => setInput(e.target.value)} />
        </Form.Item>
        <Button htmlType="submit" disabled={!input.trim()} loading={preview.isFetching}>Kiểm tra lời mời</Button>
      </Form>
      {preview.isError ? <Alert type="error" showIcon title="Không thể kiểm tra lời mời" description={preview.error.message} /> : null}
      {token && preview.isPending ? <p role="status">Đang kiểm tra lời mời…</p> : null}
      {preview.data && !preview.isError && !preview.isFetching && open ? <ActionModal
        key={`${kind}:${token}`}
        action={acceptAction(token, preview.data, () => setAccepted(true), kind)}
        close={() => setOpen(false)}
      /> : null}
    </>}
    <Button style={{ marginTop: 20 }} onClick={() => { auth.logout(); navigate('/login', { replace: true }) }}>Quay lại đăng nhập</Button>
  </div></section></main>
}
