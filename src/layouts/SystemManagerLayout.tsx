import { CloseOutlined, EnvironmentOutlined, LogoutOutlined, MenuOutlined, ScheduleOutlined, UserOutlined } from '@ant-design/icons'
import { Button } from 'antd'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { BrandMark } from '../components/BrandMark'
import { useAuth } from '../features/auth/AuthContext'
import { WorkspaceTheme } from '../components/WorkspaceTheme'
import { SidebarToggle, useMobileDrawer, useSidebarCollapsed } from './SidebarToggle'

export function SystemManagerLayout() {
  const { session, logout } = useAuth()
  const { menuOpen, openMenu, closeMenu, asideRef } = useMobileDrawer()
  const { collapsed, toggleSidebar } = useSidebarCollapsed()
  return <WorkspaceTheme><div className={`app-shell ${collapsed ? 'sidebar-collapsed' : ''}`}>
    <a className="skip-link" href="#main-content">Chuyển đến nội dung chính</a>
    <aside className={`app-sidebar ${menuOpen ? 'is-open' : ''}`} id="manager-sidebar" ref={asideRef} role={menuOpen ? 'dialog' : undefined} aria-modal={menuOpen || undefined}>
      <div className="sidebar-brand"><NavLink to="/" aria-label="AgriDrone - Trang chủ" onClick={closeMenu}><BrandMark /></NavLink><button className="sidebar-close" type="button" aria-label="Đóng menu" onClick={closeMenu}><CloseOutlined /></button></div>
      <div className="workspace-context"><span>Phạm vi làm việc</span><strong>Nông trại được phân công</strong><small>System Manager</small></div>
      <nav className="sidebar-navigation" aria-label="Điều hướng System Manager"><span className="sidebar-group-label">Vận hành</span><NavLink to="/manager" end aria-label="Nông trại phụ trách" title="Nông trại phụ trách" onClick={closeMenu}><EnvironmentOutlined /><span>Nông trại phụ trách</span></NavLink><NavLink to="/manager/orders" aria-label="Đơn khảo sát được giao" title="Đơn khảo sát được giao" onClick={closeMenu}><ScheduleOutlined /><span>Đơn khảo sát được giao</span></NavLink><NavLink to="/manager/account" aria-label="Tài khoản" title="Tài khoản" onClick={closeMenu}><UserOutlined /><span>Tài khoản</span></NavLink></nav>
      <div className="sidebar-footer"><p className="sidebar-manager-name"><strong>{session?.fullName}</strong></p><Button className="sidebar-logout" aria-label="Đăng xuất" title="Đăng xuất" icon={<LogoutOutlined />} onClick={logout}>Đăng xuất</Button></div>
    </aside>
    {menuOpen ? <button className="sidebar-backdrop" type="button" aria-label="Đóng menu" onClick={closeMenu} /> : null}
    <div className="app-main-column"><header className="app-topbar"><div className="app-topbar-heading"><SidebarToggle collapsed={collapsed} onToggle={toggleSidebar} controls="manager-sidebar" /><strong>Không gian System Manager</strong></div><span>{session?.fullName}</span></header><header className="mobile-header" inert={menuOpen || undefined}><button className="mobile-menu-button" type="button" aria-label="Mở menu" aria-controls="manager-sidebar" aria-expanded={menuOpen} onClick={openMenu}><MenuOutlined /></button><Link to="/" aria-label="AgriDrone - Trang chủ" onClick={closeMenu}><BrandMark /></Link></header><main className="app-content" id="main-content" inert={menuOpen || undefined}><div className="page-container"><Outlet /></div></main></div>
  </div></WorkspaceTheme>
}
