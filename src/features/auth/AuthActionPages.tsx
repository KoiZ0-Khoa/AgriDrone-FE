import { useMutation } from '@tanstack/react-query'
import { Alert, Button, Form, Input } from 'antd'
import type { ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ApiError } from '../../api/client'
import { BrandMark } from '../../components/BrandMark'
import { forgotPassword, registerUser, resetPassword } from './authApi'
import type { RegisterUserRequest } from './types'

type RegistrationForm = RegisterUserRequest & { confirmPassword: string }

function getErrorMessage(error: Error) {
  if (error instanceof ApiError && error.status === 409) return 'Email hoặc mã đơn vị đã được sử dụng.'
  if (error instanceof TypeError) return 'Không kết nối được tới máy chủ. Hãy kiểm tra backend đang chạy.'
  return error.message || 'Không thể xử lý yêu cầu. Vui lòng thử lại.'
}

function AuthPageShell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <main className="login-page">
      <a className="skip-link" href="#auth-form">Chuyển đến biểu mẫu</a>
      <section className={`login-main ${wide ? 'has-wide-card' : ''}`} id="auth-form">
        <div className="login-brand"><BrandMark /></div>
        <div className={`login-card auth-action-card ${wide ? 'is-wide' : ''}`}>
          {children}
        </div>
      </section>
    </main>
  )
}

export function RegisterPage() {
  const mutation = useMutation({
    mutationFn: ({ confirmPassword: _confirmPassword, ...request }: RegistrationForm) => registerUser(request),
  })

  return (
    <AuthPageShell wide>
      <div className="form-heading">
        <span className="step-label">TẠO KHÔNG GIAN LÀM VIỆC</span>
        <h1>Đăng ký AgriDrone</h1>
        <p>Tạo tài khoản chủ sở hữu và đơn vị đầu tiên của bạn.</p>
      </div>

      {mutation.isSuccess ? (
        <div className="auth-success" aria-live="polite">
          <Alert type="success" showIcon title="Đăng ký thành công" description="Tài khoản và đơn vị đã được tạo. Bạn có thể đăng nhập ngay." />
          <Link className="auth-primary-link" to="/login">Đi đến đăng nhập</Link>
        </div>
      ) : (
        <>
          {mutation.error ? <Alert type="error" showIcon title={getErrorMessage(mutation.error)} /> : null}
          <Form<RegistrationForm> layout="vertical" requiredMark={false} onFinish={(values) => mutation.mutate(values)}>
            <div className="auth-form-grid">
              <Form.Item label="Họ và tên" name="fullName" rules={[{ required: true, message: 'Vui lòng nhập họ và tên.' }, { max: 150, message: 'Họ và tên tối đa 150 ký tự.' }]}>
                <Input placeholder="Nguyễn Văn An…" autoComplete="name" />
              </Form.Item>
              <Form.Item label="Số điện thoại" name="phone" rules={[{ required: true, message: 'Vui lòng nhập số điện thoại.' }, { max: 11, message: 'Số điện thoại tối đa 11 số.' }]}>
                <Input type="tel" inputMode="tel" placeholder="0901234567…" autoComplete="tel" />
              </Form.Item>
              <Form.Item label="Email" name="email" rules={[{ required: true, message: 'Vui lòng nhập email.' }, { type: 'email', message: 'Email chưa đúng định dạng.' }]}>
                <Input type="email" placeholder="ten@nongtrai.vn…" autoComplete="email" spellCheck={false} />
              </Form.Item>
              <Form.Item label="Mã đơn vị" name="tenantCode" rules={[{ required: true, message: 'Vui lòng nhập mã đơn vị.' }, { max: 30, message: 'Mã đơn vị tối đa 30 ký tự.' }]}>
                <Input placeholder="ANPHU…" autoComplete="off" spellCheck={false} />
              </Form.Item>
              <Form.Item label="Tên đơn vị" name="tenantName" className="auth-grid-full" rules={[{ required: true, message: 'Vui lòng nhập tên đơn vị.' }, { max: 150, message: 'Tên đơn vị tối đa 150 ký tự.' }]}>
                <Input placeholder="Nông trại An Phú…" autoComplete="organization" />
              </Form.Item>
              <Form.Item label="Mật khẩu" name="password" rules={[{ required: true, message: 'Vui lòng nhập mật khẩu.' }, { min: 8, message: 'Mật khẩu cần ít nhất 8 ký tự.' }]}>
                <Input.Password placeholder="Ít nhất 8 ký tự…" autoComplete="new-password" />
              </Form.Item>
              <Form.Item label="Xác nhận mật khẩu" name="confirmPassword" dependencies={['password']} rules={[{ required: true, message: 'Vui lòng nhập lại mật khẩu.' }, ({ getFieldValue }) => ({ validator(_, value) { return !value || getFieldValue('password') === value ? Promise.resolve() : Promise.reject(new Error('Mật khẩu xác nhận chưa khớp.')) } })]}>
                <Input.Password placeholder="Nhập lại mật khẩu…" autoComplete="new-password" />
              </Form.Item>
            </div>
            <Button type="primary" htmlType="submit" loading={mutation.isPending} block>Đăng ký</Button>
          </Form>
        </>
      )}

      <div className="login-card-footer">
        <span>Đã có tài khoản?</span>
        <Link to="/login">Đăng nhập</Link>
      </div>
    </AuthPageShell>
  )
}

export function ForgotPasswordPage() {
  const mutation = useMutation({ mutationFn: forgotPassword })

  return (
    <AuthPageShell>
      <div className="form-heading">
        <span className="step-label">KHÔI PHỤC TÀI KHOẢN</span>
        <h1>Quên mật khẩu</h1>
        <p>Nhập email của bạn để nhận liên kết đặt lại mật khẩu.</p>
      </div>
      {mutation.isSuccess ? (
        <div className="auth-success" aria-live="polite">
          <Alert type="success" showIcon title="Kiểm tra email của bạn" description="Nếu tài khoản tồn tại, hệ thống đã gửi liên kết đặt lại mật khẩu." />
          <Link className="auth-primary-link" to="/login">Quay lại đăng nhập</Link>
        </div>
      ) : (
        <>
          {mutation.error ? <Alert type="error" showIcon title={getErrorMessage(mutation.error)} /> : null}
          <Form<{ email: string }> layout="vertical" requiredMark={false} onFinish={({ email }) => mutation.mutate(email)}>
            <Form.Item label="Email" name="email" rules={[{ required: true, message: 'Vui lòng nhập email.' }, { type: 'email', message: 'Email chưa đúng định dạng.' }]}>
              <Input type="email" placeholder="ten@nongtrai.vn…" autoComplete="email" spellCheck={false} />
            </Form.Item>
            <Button type="primary" htmlType="submit" loading={mutation.isPending} block>Gửi liên kết đặt lại</Button>
          </Form>
        </>
      )}
      <div className="login-card-footer"><span>Đã nhớ mật khẩu?</span><Link to="/login">Đăng nhập</Link></div>
    </AuthPageShell>
  )
}

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const mutation = useMutation({
    mutationFn: ({ confirmPassword, newPassword }: { newPassword: string; confirmPassword: string }) => resetPassword({ token, newPassword, confirmPassword }),
  })

  return (
    <AuthPageShell>
      <div className="form-heading">
        <span className="step-label">BẢO MẬT TÀI KHOẢN</span>
        <h1>Đặt lại mật khẩu</h1>
        <p>Tạo mật khẩu mới có ít nhất 8 ký tự.</p>
      </div>
      {!token ? <Alert type="error" showIcon title="Liên kết không hợp lệ" description="Liên kết đặt lại mật khẩu đang thiếu token. Hãy yêu cầu một liên kết mới." /> : null}
      {mutation.error ? <Alert type="error" showIcon title={getErrorMessage(mutation.error)} /> : null}
      {mutation.isSuccess ? (
        <div className="auth-success" aria-live="polite">
          <Alert type="success" showIcon title="Đổi mật khẩu thành công" description="Bạn có thể đăng nhập bằng mật khẩu mới." />
          <Link className="auth-primary-link" to="/login">Đi đến đăng nhập</Link>
        </div>
      ) : token ? (
        <Form<{ newPassword: string; confirmPassword: string }> layout="vertical" requiredMark={false} onFinish={(values) => mutation.mutate(values)}>
          <Form.Item label="Mật khẩu mới" name="newPassword" rules={[{ required: true, message: 'Vui lòng nhập mật khẩu mới.' }, { min: 8, message: 'Mật khẩu cần ít nhất 8 ký tự.' }]}>
            <Input.Password placeholder="Ít nhất 8 ký tự…" autoComplete="new-password" />
          </Form.Item>
          <Form.Item label="Xác nhận mật khẩu" name="confirmPassword" dependencies={['newPassword']} rules={[{ required: true, message: 'Vui lòng nhập lại mật khẩu.' }, ({ getFieldValue }) => ({ validator(_, value) { return !value || getFieldValue('newPassword') === value ? Promise.resolve() : Promise.reject(new Error('Mật khẩu xác nhận chưa khớp.')) } })]}>
            <Input.Password placeholder="Nhập lại mật khẩu…" autoComplete="new-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={mutation.isPending} block>Đặt lại mật khẩu</Button>
        </Form>
      ) : null}
      <div className="login-card-footer"><span>Cần một liên kết mới?</span><Link to="/forgot-password">Gửi lại email</Link></div>
    </AuthPageShell>
  )
}
