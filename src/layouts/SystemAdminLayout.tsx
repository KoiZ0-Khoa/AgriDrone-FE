import {
  BankOutlined,
  CloseOutlined,
  DashboardOutlined,
  DownOutlined,
  LogoutOutlined,
  MedicineBoxOutlined,
  MenuOutlined,
  TeamOutlined,
  TrophyOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { Avatar, Dropdown, type MenuProps } from 'antd'
import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { BrandMark } from '../components/BrandMark'
import { useAuth } from '../features/auth/AuthContext'

const navigation = [
  { to: '/system', end: true, label: 'Tổng quan hệ thống', icon: <DashboardOutlined aria-hidden="true" /> },
  { to: '/system/tenants', label: 'Đơn vị', icon: <BankOutlined aria-hidden="true" /> },
  { to: '/system/users', label: 'Người dùng', icon: <TeamOutlined aria-hidden="true" /> },
  { to: '/system/plant-conditions', label: 'Tình trạng cây', icon: <MedicineBoxOutlined aria-hidden="true" /> },
  { to: '/system/harvest-quality-grades', label: 'Chất lượng thu hoạch', icon: <TrophyOutlined aria-hidden="true" /> },
]

function pageTitle(pathname: string) {
  if (pathname === '/system/tenants') return 'Quản lý đơn vị'
  if (pathname === '/system/users') return 'Quản lý người dùng'
  if (pathname === '/system/plant-conditions') return 'Danh mục tình trạng cây'
  if (pathname === '/system/harvest-quality-grades') return 'Danh mục chất lượng thu hoạch'
  if (pathname === '/system/account') return 'Tài khoản quản trị'
  return 'Tổng quan hệ thống'
}

export function SystemAdminLayout() {
  const [menuOpen, setMenuOpen] = useState(false)
  const { session, logout } = useAuth()
  const { pathname } = useLocation()
  if (!session) return null

  const accountMenu: MenuProps['items'] = [
    { key: 'account', icon: <UserOutlined />, label: <NavLink to="/system/account">Tài khoản</NavLink> },
    { type: 'divider' },
    { key: 'logout', icon: <LogoutOutlined />, label: 'Đăng xuất', onClick: logout },
  ]

  return <div className="app-shell system-admin-shell">
    <a className="skip-link" href="#main-content">Chuyển đến nội dung chính</a>
    <aside className={`app-sidebar system-admin-sidebar ${menuOpen ? 'is-open' : ''}`} id="system-admin-sidebar">
      <div className="sidebar-brand">
        <NavLink to="/system" aria-label="AgriDrone - Quản trị hệ thống" onClick={() => setMenuOpen(false)}><BrandMark /></NavLink>
        <button className="sidebar-close" type="button" aria-label="Đóng menu" onClick={() => setMenuOpen(false)}><CloseOutlined aria-hidden="true" /></button>
      </div>
      <div className="workspace-context system-workspace-context">
        <span>PHẠM VI QUẢN TRỊ</span>
        <strong>Toàn hệ thống</strong>
        <small>SYSTEM ADMIN</small>
      </div>
      <nav className="sidebar-navigation" aria-label="Điều hướng quản trị hệ thống">
        <span className="sidebar-group-label">QUẢN TRỊ</span>
        {navigation.map(item => <NavLink end={item.end} to={item.to} onClick={() => setMenuOpen(false)} key={item.to}>{item.icon}<span>{item.label}</span></NavLink>)}
      </nav>
      <div className="sidebar-footer">
        <Dropdown menu={{ items: accountMenu }} trigger={['click']} placement="topLeft">
          <button className="account-button" type="button" aria-label="Mở menu tài khoản" aria-haspopup="menu">
            <Avatar shape="square">{session.fullName.slice(0, 1).toUpperCase()}</Avatar>
            <span className="account-copy"><strong>{session.fullName}</strong><small>Quản trị hệ thống</small></span>
            <DownOutlined aria-hidden="true" />
          </button>
        </Dropdown>
      </div>
    </aside>
    {menuOpen ? <button className="sidebar-backdrop" type="button" aria-label="Đóng menu" onClick={() => setMenuOpen(false)} /> : null}
    <div className="app-main-column">
      <header className="app-topbar"><strong>{pageTitle(pathname)}</strong><div className="topbar-scope"><span>Phạm vi</span><strong>Toàn hệ thống</strong></div></header>
      <header className="mobile-header">
        <button className="mobile-menu-button" type="button" aria-label="Mở menu" aria-controls="system-admin-sidebar" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}><MenuOutlined aria-hidden="true" /></button>
        <BrandMark />
      </header>
      <main className="app-content" id="main-content"><div className="page-container"><Outlet /></div></main>
    </div>
  </div>
}
