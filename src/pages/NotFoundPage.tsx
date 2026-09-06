import { Result } from 'antd'
import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <Result
      status="404"
      title="Không tìm thấy trang"
      subTitle="Đường dẫn không tồn tại hoặc đã được thay đổi."
      extra={<Link className="not-found-link" to="/">Về trang tổng quan</Link>}
    />
  )
}
