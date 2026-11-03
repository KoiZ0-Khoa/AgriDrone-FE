import {
  CloseOutlined,
  DashboardOutlined,
  CreditCardOutlined,
  DownOutlined,
  EnvironmentOutlined,
  HomeOutlined,
  LogoutOutlined,
  MenuOutlined,
  RocketOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons'
import { Avatar, Dropdown, type MenuProps } from 'antd'
import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { BrandMark } from '../components/BrandMark'
import { useAuth } from '../features/auth/AuthContext'
import { WorkspaceTheme } from '../components/WorkspaceTheme'
import { SidebarToggle, useSidebarCollapsed } from './SidebarToggle'

const roleLabels = {
  SYSTEM_ADMIN: 'Quản trị hệ thống',
  SYSTEM_MANAGER: 'Quản lý vận hành hệ thống',
  OWNER: 'Chủ tenant',
  TENANT_ADMIN: 'Quản trị tenant',
  MEMBER: 'Thành viên',
}

const activeNavigation = [
  { to: '/farms', label: 'Nông trại', icon: <HomeOutlined aria-hidden="true" /> },
  { to: '/zones', label: 'Khu vực', icon: <EnvironmentOutlined aria-hidden="true" /> },
]

function getPageTitle(pathname: string) {
  if (pathname.startsWith('/survey-payments')) return 'Thanh toán khảo sát'
  if (pathname === '/survey-requests/new') return 'Đăng ký khảo sát'
  if (pathname === '/my-farms') return 'Nông trại được giao'
  if (pathname === '/account') return 'Tài khoản'
  if (pathname === '/team') return 'Thành viên'
  if (pathname === '/system') return 'Quản trị hệ thống'
  if (pathname.startsWith('/farms')) return 'Nông trại'
  if (pathname.startsWith('/zones')) return 'Khu vực'
  return 'Tổng quan'
}

export function AppLayout() {
  const [menuOpen, setMenuOpen] = useState(false)
  const { collapsed, toggleSidebar } = useSidebarCollapsed()
  const { session, logout } = useAuth()
  const { pathname } = useLocation()

  if (!session) return null

  const accountMenu: MenuProps['items'] = [
    { key: 'logout', icon: <LogoutOutlined />, label: 'Đăng xuất', onClick: logout },
  ]

  return (
    <WorkspaceTheme><div className={`app-shell ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <a className="skip-link" href="#main-content">Chuyển đến nội dung chính</a>

      <aside className={`app-sidebar ${menuOpen ? 'is-open' : ''}`} id="app-sidebar">
        <div className="sidebar-brand">
          <NavLink to="/" aria-label="AgriDrone - Trang chủ" onClick={() => setMenuOpen(false)}>
            <BrandMark />
          </NavLink>
          <button className="sidebar-close" type="button" aria-label="Đóng menu" onClick={() => setMenuOpen(false)}>
            <CloseOutlined aria-hidden="true" />
          </button>
        </div>

        <div className="workspace-context">
          <span>PHẠM VI LÀM VIỆC</span>
          <strong>{session.tenant?.name ?? 'Toàn hệ thống'}</strong>
          <small>{session.tenant?.code ?? 'SYSTEM'}</small>
        </div>

        <nav className="sidebar-navigation" aria-label="Điều hướng chính">
          <span className="sidebar-group-label">VẬN HÀNH</span>
          <NavLink to="/dashboard" aria-label="Tổng quan" title="Tổng quan" onClick={() => setMenuOpen(false)}>
            <DashboardOutlined aria-hidden="true" />
            <span>Tổng quan</span>
          </NavLink>
          {activeNavigation.map((item) => (
            <NavLink to={item.to} aria-label={item.label} title={item.label} onClick={() => setMenuOpen(false)} key={item.to}>
              {item.icon}
              <span>{item.label}</span>
            </NavLink>
          ))}
          {session.role === 'OWNER' ? <NavLink to="/survey-requests/new" aria-label="Đăng ký khảo sát" title="Đăng ký khảo sát" onClick={() => setMenuOpen(false)}><RocketOutlined /><span>Đăng ký khảo sát</span></NavLink> : null}
          {session.role === 'OWNER' ? <NavLink to="/survey-payments" aria-label="Thanh toán khảo sát" title="Thanh toán khảo sát" onClick={() => setMenuOpen(false)}><CreditCardOutlined /><span>Thanh toán khảo sát</span></NavLink> : null}
          <NavLink to="/account" aria-label="Tài khoản" title="Tài khoản" onClick={() => setMenuOpen(false)}><SafetyCertificateOutlined /><span>Tài khoản</span></NavLink>
        </nav>

        <div className="sidebar-footer">
          <Dropdown menu={{ items: accountMenu }} trigger={['click']} placement="topLeft">
            <button className="account-button" type="button" aria-label="Mở menu tài khoản" aria-haspopup="menu">
              <Avatar shape="square">{session.fullName.slice(0, 1).toUpperCase()}</Avatar>
              <span className="account-copy">
                <strong>{session.fullName}</strong>
                <small>{roleLabels[session.role]}</small>
              </span>
              <DownOutlined aria-hidden="true" />
            </button>
          </Dropdown>
        </div>
      </aside>

      {menuOpen ? (
        <button className="sidebar-backdrop" type="button" aria-label="Đóng menu" onClick={() => setMenuOpen(false)} />
      ) : null}

      <div className="app-main-column">
        <header className="app-topbar">
          <div className="app-topbar-heading"><SidebarToggle collapsed={collapsed} onToggle={toggleSidebar} controls="app-sidebar" /><strong>{getPageTitle(pathname)}</strong></div>
          <div className="topbar-scope">
            <span>Phạm vi hiện tại</span>
            <strong>{session.tenant?.name ?? 'Toàn hệ thống'}</strong>
          </div>
        </header>
        <header className="mobile-header">
          <button
            className="mobile-menu-button"
            type="button"
            aria-label="Mở menu"
            aria-controls="app-sidebar"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            <MenuOutlined aria-hidden="true" />
          </button>
          <Link to="/" aria-label="AgriDrone - Trang chủ" onClick={() => setMenuOpen(false)}><BrandMark /></Link>
        </header>

        <main className="app-content" id="main-content">
          <div className="page-container">
            <Outlet />
          </div>
        </main>
      </div>
    </div></WorkspaceTheme>
  )
}
