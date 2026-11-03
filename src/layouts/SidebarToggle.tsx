import { MenuFoldOutlined, MenuUnfoldOutlined } from '@ant-design/icons'
import { useState } from 'react'

const storageKey = 'agridrone.sidebar.collapsed'

export function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(storageKey) === 'true' } catch { return false }
  })

  function toggleSidebar() {
    const next = !collapsed
    setCollapsed(next)
    try { localStorage.setItem(storageKey, String(next)) } catch { /* Keep the control usable when storage is unavailable. */ }
  }

  return { collapsed, toggleSidebar }
}

export function SidebarToggle({ collapsed, onToggle, controls }: { collapsed: boolean; onToggle: () => void; controls: string }) {
  const label = collapsed ? 'Mở rộng thanh bên' : 'Thu gọn thanh bên'
  return <button className="sidebar-toggle" type="button" aria-label={label} title={label} aria-controls={controls} aria-expanded={!collapsed} onClick={onToggle}>
    {collapsed ? <MenuUnfoldOutlined aria-hidden="true" /> : <MenuFoldOutlined aria-hidden="true" />}
  </button>
}
