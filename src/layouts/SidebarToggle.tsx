import { MenuFoldOutlined, MenuUnfoldOutlined } from '@ant-design/icons'
import { useEffect, useRef, useState } from 'react'

const storageKey = 'agridrone.sidebar.collapsed'
const focusableSelector = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'

// Drawer menu mobile (sidebar đổ full-screen): bẫy focus bên trong, đóng bằng Esc,
// và trả focus về nút đã mở nó khi đóng, để người dùng bàn phím/trình đọc màn hình
// không bị kẹt hoặc lạc hướng ra ngoài lớp phủ.
export function useMobileDrawer() {
  const [menuOpen, setMenuOpen] = useState(false)
  const asideRef = useRef<HTMLElement>(null)
  const triggerRef = useRef<HTMLElement | null>(null)

  function openMenu() {
    triggerRef.current = document.activeElement as HTMLElement | null
    setMenuOpen(true)
  }

  function closeMenu() {
    setMenuOpen(false)
  }

  useEffect(() => {
    if (!menuOpen) return

    const aside = asideRef.current
    if (!aside) return
    aside.querySelector<HTMLElement>(focusableSelector)?.focus()

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') { closeMenu(); return }
      if (event.key !== 'Tab') return
      const items = Array.from(aside!.querySelectorAll<HTMLElement>(focusableSelector))
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      // Chạy sau khi DOM đã bỏ `inert` khỏi nội dung phía sau (render của menuOpen=false
      // đã commit), nên nút trigger nhận lại focus được — gọi sớm hơn (vd. ngay trong
      // onClick đóng drawer) sẽ là no-op vì nút đó vẫn còn inert tại thời điểm đó.
      triggerRef.current?.focus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuOpen])

  return { menuOpen, openMenu, closeMenu, asideRef }
}

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
