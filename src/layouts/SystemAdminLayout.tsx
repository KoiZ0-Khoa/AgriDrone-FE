import {
  BankOutlined,
  CheckSquareOutlined,
  CloseOutlined,
  DashboardOutlined,
  DownOutlined,
  FileTextOutlined,
  FundOutlined,
  LogoutOutlined,
  MedicineBoxOutlined,
  MenuOutlined,
  RocketOutlined,
  TeamOutlined,
  TrophyOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { Avatar, Dropdown, type MenuProps } from 'antd'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { BrandMark } from '../components/BrandMark'
import { useAuth } from '../features/auth/AuthContext'
import { WorkspaceTheme } from '../components/WorkspaceTheme'
import { SidebarToggle, useMobileDrawer, useSidebarCollapsed } from './SidebarToggle'

const navigation = [
  { to: '/system', end: true, label: 'Tổng quan hệ thống', icon: <DashboardOutlined aria-hidden="true" /> },
  { to: '/system/survey-requests', label: 'Yêu cầu khảo sát', icon: <BankOutlined aria-hidden="true" /> },
  { to: '/system/survey-orders', label: 'Đơn khảo sát', icon: <FileTextOutlined aria-hidden="true" /> },
  { to: '/system/revenue', label: 'Doanh thu', icon: <FundOutlined aria-hidden="true" /> },
  { to: '/system/managers', label: 'System Manager', icon: <TeamOutlined aria-hidden="true" /> },
  { to: '/system/drones', label: 'Drone', icon: <RocketOutlined aria-hidden="true" /> },
  { to: '/system/preflight-checklist', label: 'Checklist Preflight', icon: <CheckSquareOutlined aria-hidden="true" /> },
  { to: '/system/survey-services', label: 'Dịch vụ & đơn giá', icon: <MedicineBoxOutlined aria-hidden="true" /> },
  { to: '/system/tenants', label: 'Đơn vị', icon: <BankOutlined aria-hidden="true" /> },
  { to: '/system/users', label: 'Người dùng', icon: <TeamOutlined aria-hidden="true" /> },
  { to: '/system/plant-conditions', label: 'Tình trạng cây', icon: <MedicineBoxOutlined aria-hidden="true" /> },
  { to: '/system/plant-health', label: 'Nhãn & hướng dẫn', icon: <MedicineBoxOutlined aria-hidden="true" /> },
  { to: '/system/harvest-quality-grades', label: 'Chất lượng thu hoạch', icon: <TrophyOutlined aria-hidden="true" /> },
]

function pageTitle(pathname: string) {
  if (pathname.startsWith('/system/survey-requests')) return 'Yêu cầu khảo sát'
  if (pathname.startsWith('/system/survey-orders/quality-refunds')) return 'Hoàn tiền khảo sát'
  if (pathname.startsWith('/system/survey-orders')) return 'Đơn khảo sát'
  if (pathname === '/system/revenue') return 'Báo cáo doanh thu'
  if (pathname === '/system/managers') return 'System Manager'
  if (pathname === '/system/drones') return 'Drone hệ thống'
  if (pathname === '/system/preflight-checklist') return 'Checklist Preflight'
  if (pathname === '/system/survey-services') return 'Dịch vụ & đơn giá'
  if (pathname === '/system/tenants') return 'Quản lý đơn vị'
  if (pathname === '/system/users') return 'Quản lý người dùng'
  if (pathname === '/system/plant-conditions') return 'Danh mục tình trạng cây'
  if (pathname === '/system/plant-health') return 'Nhãn và hướng dẫn Plant Health'
  if (pathname === '/system/harvest-quality-grades') return 'Danh mục chất lượng thu hoạch'
  if (pathname === '/system/account') return 'Tài khoản quản trị'
  return 'Tổng quan hệ thống'
}

export function SystemAdminLayout() {
  const { menuOpen, openMenu, closeMenu, asideRef } = useMobileDrawer()
  const { collapsed, toggleSidebar } = useSidebarCollapsed()
  const { session, logout } = useAuth()
  const { pathname } = useLocation()
  if (!session) return null

  const accountMenu: MenuProps['items'] = [
    { key: 'account', icon: <UserOutlined />, label: <NavLink to="/system/account">Tài khoản</NavLink> },
    { type: 'divider' },
    { key: 'logout', icon: <LogoutOutlined />, label: 'Đăng xuất', onClick: logout },
  ]

  return <WorkspaceTheme><div className={`app-shell system-admin-shell ${collapsed ? 'sidebar-collapsed' : ''}`}>
    <a className="skip-link" href="#main-content">Chuyển đến nội dung chính</a>
    <aside className={`app-sidebar system-admin-sidebar ${menuOpen ? 'is-open' : ''}`} id="system-admin-sidebar" ref={asideRef} role={menuOpen ? 'dialog' : undefined} aria-modal={menuOpen || undefined}>
      <div className="sidebar-brand">
        <NavLink to="/" aria-label="AgriDrone - Trang chủ" onClick={closeMenu}><BrandMark /></NavLink>
        <button className="sidebar-close" type="button" aria-label="Đóng menu" onClick={closeMenu}><CloseOutlined aria-hidden="true" /></button>
      </div>
      <div className="workspace-context system-workspace-context">
        <span>Phạm vi quản trị</span>
        <strong>Toàn hệ thống</strong>
        <small>System Admin</small>
      </div>
      <nav className="sidebar-navigation" aria-label="Điều hướng quản trị hệ thống">
        <span className="sidebar-group-label">Quản trị</span>
        {navigation.map(item => <NavLink end={item.end} to={item.to} aria-label={item.label} title={item.label} onClick={closeMenu} key={item.to}>{item.icon}<span>{item.label}</span></NavLink>)}
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
    {menuOpen ? <button className="sidebar-backdrop" type="button" aria-label="Đóng menu" onClick={closeMenu} /> : null}
    <div className="app-main-column">
      <header className="app-topbar"><div className="app-topbar-heading"><SidebarToggle collapsed={collapsed} onToggle={toggleSidebar} controls="system-admin-sidebar" /><strong>{pageTitle(pathname)}</strong></div><div className="topbar-scope"><span>Phạm vi</span><strong>Toàn hệ thống</strong></div></header>
      <header className="mobile-header" inert={menuOpen || undefined}>
        <button className="mobile-menu-button" type="button" aria-label="Mở menu" aria-controls="system-admin-sidebar" aria-expanded={menuOpen} onClick={openMenu}><MenuOutlined aria-hidden="true" /></button>
        <Link to="/" aria-label="AgriDrone - Trang chủ" onClick={closeMenu}><BrandMark /></Link>
      </header>
      <main className="app-content" id="main-content" inert={menuOpen || undefined}><div className="page-container"><Outlet /></div></main>
    </div>
  </div></WorkspaceTheme>
}
