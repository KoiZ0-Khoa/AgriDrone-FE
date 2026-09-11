import { useState } from 'react'
import { Button, Space } from 'antd'
import { useAuth } from '../features/auth/AuthContext'
import { ActionModal } from './ActionModal'
import { passwordAction, profileAction, type Action } from './actions'

export function AccountPage() {
  const { session, updateProfile, logout } = useAuth()
  const [action, setAction] = useState<Action | null>(null)
  if (!session) return null
  return <><section className="resource-page-heading"><div><span className="page-kicker">TÀI KHOẢN</span><h1>Hồ sơ cá nhân</h1><p>Quản lý thông tin liên hệ và mật khẩu của bạn.</p></div></section>
    <section className="resource-panel"><dl className="detail-list"><div><dt>Họ và tên</dt><dd>{session.fullName}</dd></div><div><dt>Email</dt><dd>{session.email}</dd></div><div><dt>Điện thoại</dt><dd>{session.phone ?? 'Chưa cập nhật'}</dd></div></dl>
      <Space wrap><Button type="primary" onClick={() => setAction(profileAction(session.accessToken, session, updateProfile))}>Chỉnh sửa hồ sơ</Button><Button onClick={() => setAction(passwordAction(session.accessToken, logout))}>Đổi mật khẩu</Button></Space>
    </section>{action ? <ActionModal action={action} close={() => setAction(null)} /> : null}</>
}
