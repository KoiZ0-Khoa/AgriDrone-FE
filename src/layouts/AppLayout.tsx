import {
  BarChartOutlined,
  CloseOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  DeploymentUnitOutlined,
  DownOutlined,
  EnvironmentOutlined,
  GlobalOutlined,
  HomeOutlined,
  LogoutOutlined,
  MenuOutlined,
  RocketOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons'
import { Avatar, Dropdown, type MenuProps } from 'antd'
import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { BrandMark } from '../components/BrandMark'
import { useAuth } from '../features/auth/AuthContext'

const roleLabels = {
  SYSTEM_ADMIN: 'Quản trị hệ thống',
  OWNER: 'Chủ tenant',
  TENANT_ADMIN: 'Quản trị tenant',
  MEMBER: 'Thành viên',
}

const plannedNavigation = [
  { label: 'Bản đồ', icon: <GlobalOutlined aria-hidden="true" /> },
  { label: 'Cây trồng', icon: <DeploymentUnitOutlined aria-hidden="true" /> },
  { label: 'Nhiệm vụ bay', icon: <RocketOutlined aria-hidden="true" /> },
  { label: 'Duyệt AI', icon: <SafetyCertificateOutlined aria-hidden="true" /> },
  { label: 'Thu hoạch', icon: <DatabaseOutlined aria-hidden="true" /> },
  { label: 'Phân tích', icon: <BarChartOutlined aria-hidden="true" /> },
]

const activeNavigation = [
  { to: '/farms', label: 'Nông trại', icon: <HomeOutlined aria-hidden="true" /> },
  { to: '/zones', label: 'Khu vực', icon: <EnvironmentOutlined aria-hidden="true" /> },
]

function getPageTitle(pathname: string) {
  if (pathname.startsWith('/farms')) return 'Nông trại'
  if (pathname.startsWith('/zones')) return 'Khu vực'
  return 'Tổng quan'
}

export function AppLayout() {
  const [menuOpen, setMenuOpen] = useState(false)
  const { session, logout } = useAuth()
  const { pathname } = useLocation()

  if (!session) return null

  const accountMenu: MenuProps['items'] = [
    { key: 'logout', icon: <LogoutOutlined />, label: 'Đăng xuất', onClick: logout },
  ]

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Chuyển đến nội dung chính</a>

      <aside className={`app-sidebar ${menuOpen ? 'is-open' : ''}`} id="app-sidebar">
        <div className="sidebar-brand">
          <NavLink to="/dashboard" aria-label="AgriDrone - Trang tổng quan" onClick={() => setMenuOpen(false)}>
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
          <NavLink to="/dashboard" onClick={() => setMenuOpen(false)}>
            <DashboardOutlined aria-hidden="true" />
            <span>Tổng quan</span>
          </NavLink>
          {activeNavigation.map((item) => (
            <NavLink to={item.to} onClick={() => setMenuOpen(false)} key={item.to}>
              {item.icon}
              <span>{item.label}</span>
            </NavLink>
          ))}
          {plannedNavigation.map((item) => (
            <span className="sidebar-navigation-item is-disabled" aria-disabled="true" title="Chưa triển khai" key={item.label}>
              {item.icon}
              <span>{item.label}</span>
            </span>
          ))}
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
          <strong>{getPageTitle(pathname)}</strong>
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
          <BrandMark />
        </header>

        <main className="app-content" id="main-content">
          <div className="page-container">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
