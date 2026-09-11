import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Button } from 'antd'
import { acceptAction } from './actions'
import { ActionModal } from './ActionModal'

export function InvitationPage() {
  const [params] = useSearchParams()
  const [open, setOpen] = useState(true)
  return <section className="resource-panel"><h1>Tham gia đơn vị AgriDrone</h1><p>Dùng mã từ email mời để kích hoạt quyền tham gia đơn vị.</p><Button onClick={() => setOpen(true)}>Nhập mã lời mời</Button> <Link to="/login">Đăng nhập</Link>{open ? <ActionModal action={acceptAction(params.get('token') ?? '')} close={() => setOpen(false)} /> : null}</section>
}
