import { CheckOutlined, CopyOutlined } from '@ant-design/icons'
import { Button } from 'antd'
import { useState } from 'react'

// Keep human-written business codes, but omit UUIDs and generated hex identifiers
// such as SR-01a17..., SO-01a17... and FARM-01A17... from display text.
export function readableCode(value: string | null | undefined) {
  const text = value?.trim()
  return text && !/(?:[0-9a-f]{24,}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i.test(text) ? text : null
}

export function CopyReference({ value, label = 'Sao chép mã tra cứu' }: { value: string | null | undefined; label?: string }) {
  const [copied, setCopied] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  if (!value) return null
  return <><Button type="text" size="small" icon={copied === value ? <CheckOutlined /> : <CopyOutlined />} onClick={async () => {
    try { await navigator.clipboard.writeText(value); setCopied(value); setFailed(false) }
    catch { setFailed(true) }
  }}>{copied === value ? 'Đã sao chép' : label}</Button>{failed ? <span role="status" className="form-hint">Chưa sao chép được. Hãy cho phép trình duyệt truy cập bộ nhớ tạm rồi thử lại.</span> : null}</>
}
