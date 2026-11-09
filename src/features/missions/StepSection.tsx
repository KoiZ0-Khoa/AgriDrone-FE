import { Button } from 'antd'
import { useState, type ReactNode } from 'react'

export type StepSectionStatus = 'active' | 'done' | 'upcoming'

// Bọc ngoài 1 section đã có sẵn trong ManagerMissionDetailPage: bước đã xong tự thu gọn còn 1 dòng tóm tắt
// (bấm "Xem lại" để mở lại), bước đang làm luôn mở rộng, bước chưa tới không render. Không đổi logic bên trong.
export function StepSection({ title, status, summary, children }: {
  title: string; status: StepSectionStatus; summary?: string; children: ReactNode
}) {
  const [open, setOpen] = useState(status === 'active')
  if (status === 'upcoming') return null
  const collapsed = status === 'done' && !open
  return (
    <section className={`resource-panel workflow-section step-section${collapsed ? ' step-section-collapsed' : ''}`}>
      <div className="resource-panel-heading">
        <div><strong>{title}</strong>{collapsed ? <span>{summary ?? 'Đã hoàn tất'}</span> : null}</div>
        {status === 'done' ? <Button size="small" onClick={() => setOpen(value => !value)}>{open ? 'Thu gọn' : 'Xem lại'}</Button> : null}
      </div>
      {collapsed ? null : children}
    </section>
  )
}
