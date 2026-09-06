import { Button, Result, Skeleton } from 'antd'

type CommonStateProps =
  | { type: 'loading'; title?: string }
  | { type: 'empty'; title: string; description?: string; action?: () => void; actionLabel?: string }
  | { type: 'error'; title?: string; description: string; retry?: () => void }
  | { type: 'forbidden'; description?: string }
  | { type: 'conflict'; reload: () => void }

export function CommonState(props: CommonStateProps) {
  if (props.type === 'loading') {
    return (
      <div className="common-state-loading" aria-label={props.title ?? 'Đang tải dữ liệu'}>
        <Skeleton active paragraph={{ rows: 4 }} />
      </div>
    )
  }

  if (props.type === 'empty') {
    return (
      <Result
        status="info"
        title={props.title}
        subTitle={props.description}
        extra={props.action ? <Button type="primary" onClick={props.action}>{props.actionLabel ?? 'Tạo mới'}</Button> : undefined}
      />
    )
  }

  if (props.type === 'forbidden') {
    return (
      <Result
        status="403"
        title="Bạn không có quyền truy cập"
        subTitle={props.description ?? 'Hãy kiểm tra lại role hoặc phạm vi Farm/Zone được phân công.'}
      />
    )
  }

  if (props.type === 'conflict') {
    return (
      <Result
        status="warning"
        title="Dữ liệu vừa được người khác cập nhật"
        subTitle="Tải lại dữ liệu mới nhất trước khi tiếp tục chỉnh sửa."
        extra={<Button type="primary" onClick={props.reload}>Tải lại dữ liệu</Button>}
      />
    )
  }

  return (
    <Result
      status="error"
      title={props.title ?? 'Không thể tải dữ liệu'}
      subTitle={props.description}
      extra={props.retry ? <Button type="primary" onClick={props.retry}>Thử lại</Button> : undefined}
    />
  )
}
