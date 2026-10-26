import { ConfigProvider } from 'antd'
import type { ReactNode } from 'react'
import '../styles/workspace.css'

export function WorkspaceTheme({ children }: { children: ReactNode }) {
  return <ConfigProvider theme={{
    token: { fontSize: 16, controlHeight: 44, colorPrimary: '#08764e', colorInfo: '#08764e', colorSuccess: '#08764e', colorText: '#182c22', colorTextSecondary: '#68746c', colorBorder: '#dce3dc', borderRadius: 7 },
    components: { Button: { controlHeight: 44, fontSize: 16, fontWeight: 600, borderRadius: 7 }, Input: { controlHeight: 44, borderRadius: 7 }, Table: { fontSize: 16 }, Tag: { fontSizeSM: 14 } },
  }}>{children}</ConfigProvider>
}
