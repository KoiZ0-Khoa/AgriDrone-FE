import { ArrowRightOutlined } from '@ant-design/icons'
import { useMutation } from '@tanstack/react-query'
import { Alert, Button, Form, Input } from 'antd'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ApiError } from '../../api/client'
import { BrandMark } from '../../components/BrandMark'
import { useAuth } from './AuthContext'
import type { LoginCredentials } from './types'

const roleLabels: Record<string | number, string> = {
  0: 'Chủ tenant',
  1: 'Quản trị tenant',
  2: 'Thành viên',
  Owner: 'Chủ tenant',
  TenantAdmin: 'Quản trị tenant',
  Member: 'Thành viên',
  OWNER: 'Chủ tenant',
  TENANT_ADMIN: 'Quản trị tenant',
  MEMBER: 'Thành viên',
}

function getErrorMessage(error: Error) {
  if (error instanceof ApiError && error.status === 401) return 'Email hoặc mật khẩu không đúng.'
  if (error instanceof TypeError) return 'Không kết nối được tới máy chủ. Hãy kiểm tra backend đang chạy.'
  return error.message || 'Đăng nhập không thành công. Vui lòng thử lại.'
}

export function LoginPage() {
  const auth = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const destination = (location.state as { from?: string } | null)?.from ?? '/dashboard'

  const loginMutation = useMutation({
    mutationFn: auth.login,
    onSuccess: (outcome) => {
      if (outcome === 'authenticated') navigate(destination, { replace: true })
    },
  })
  const tenantMutation = useMutation({
    mutationFn: auth.selectTenant,
    onSuccess: () => navigate(destination, { replace: true }),
  })

  if (auth.session) return <Navigate to="/dashboard" replace />

  return (
    <main className="login-page">
      <a className="skip-link" href="#login-form">Chuyển đến biểu mẫu đăng nhập</a>
      <section className="login-main" id="login-form" aria-labelledby="login-title">
        <div className="login-brand"><BrandMark /></div>
        <div className="login-card">
          {auth.tenantSelection ? (
            <>
              <div className="form-heading">
                <span className="step-label">BƯỚC 2 / 2</span>
                <h1 id="login-title">Chọn đơn vị làm việc</h1>
                <p>Chọn phạm vi bạn muốn sử dụng trong phiên đăng nhập này.</p>
              </div>
              {tenantMutation.error ? <Alert type="error" showIcon title={getErrorMessage(tenantMutation.error)} /> : null}
              <div className="tenant-options">
                {auth.tenantSelection.tenants.map((tenant) => (
                  <button
                    className="tenant-option"
                    key={tenant.id}
                    type="button"
                    disabled={tenantMutation.isPending}
                    onClick={() => tenantMutation.mutate(tenant.id)}
                  >
                    <span className="tenant-avatar">{tenant.name.slice(0, 1).toUpperCase()}</span>
                    <span className="tenant-copy">
                      <strong>{tenant.name}</strong>
                      <small>{tenant.code} · {roleLabels[tenant.role]}</small>
                    </span>
                    <ArrowRightOutlined aria-hidden="true" />
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="form-heading">
                <span className="step-label">CHÀO MỪNG TRỞ LẠI</span>
                <h1 id="login-title">Đăng nhập</h1>
                <p>Nhập thông tin tài khoản AgriDrone của bạn.</p>
              </div>
              {loginMutation.error ? <Alert type="error" showIcon title={getErrorMessage(loginMutation.error)} /> : null}
              <Form<LoginCredentials>
                layout="vertical"
                requiredMark={false}
                onFinish={(values) => loginMutation.mutate(values)}
              >
                <Form.Item
                  label="Email"
                  name="email"
                  rules={[
                    { required: true, message: 'Vui lòng nhập email.' },
                    { type: 'email', message: 'Email chưa đúng định dạng.' },
                  ]}
                >
                  <Input
                    type="email"
                    placeholder="ten@nongtrai.vn…"
                    autoComplete="email"
                    spellCheck={false}
                  />
                </Form.Item>
                <div className="password-label-row">
                  <span>Mật khẩu</span>
                  <Link to="/forgot-password">Quên mật khẩu?</Link>
                </div>
                <Form.Item
                  name="password"
                  rules={[{ required: true, message: 'Vui lòng nhập mật khẩu.' }]}
                >
                  <Input.Password
                    aria-label="Mật khẩu"
                    placeholder="Nhập mật khẩu…"
                    autoComplete="current-password"
                  />
                </Form.Item>
                <Button type="primary" htmlType="submit" loading={loginMutation.isPending} block>
                  Đăng nhập
                </Button>
              </Form>
            </>
          )}
          <div className="login-card-footer">
            <span>Chưa có tài khoản?</span>
            <Link to="/register">Đăng ký</Link>
            <Link to="/invitation">Có lời mời?</Link>
          </div>
        </div>
      </section>
    </main>
  )
}
