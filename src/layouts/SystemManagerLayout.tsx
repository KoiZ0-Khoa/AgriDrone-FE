import { CloseOutlined, EnvironmentOutlined, LogoutOutlined, MenuOutlined, UserOutlined } from '@ant-design/icons'
import { Button } from 'antd'
import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { BrandMark } from '../components/BrandMark'
import { useAuth } from '../features/auth/AuthContext'

export function SystemManagerLayout() {
  const { session, logout } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  return <div className="app-shell">
    <a className="skip-link" href="#main-content">Chuyển đến nội dung chính</a>
    <aside className={`app-sidebar ${menuOpen ? 'is-open' : ''}`} id="manager-sidebar">
      <div className="sidebar-brand"><NavLink to="/manager" onClick={() => setMenuOpen(false)}><BrandMark /></NavLink><button className="sidebar-close" type="button" aria-label="Đóng menu" onClick={() => setMenuOpen(false)}><CloseOutlined /></button></div>
      <div className="workspace-context"><span>PHẠM VI LÀM VIỆC</span><strong>Nông trại được phân công</strong><small>SYSTEM MANAGER</small></div>
      <nav className="sidebar-navigation" aria-label="Điều hướng System Manager"><span className="sidebar-group-label">VẬN HÀNH</span><NavLink to="/manager" end onClick={() => setMenuOpen(false)}><EnvironmentOutlined />Nông trại phụ trách</NavLink><NavLink to="/manager/account" onClick={() => setMenuOpen(false)}><UserOutlined />Tài khoản</NavLink></nav>
      <div className="sidebar-footer"><p><strong>{session?.fullName}</strong></p><Button icon={<LogoutOutlined />} onClick={logout}>Đăng xuất</Button></div>
    </aside>
    {menuOpen ? <button className="sidebar-backdrop" type="button" aria-label="Đóng menu" onClick={() => setMenuOpen(false)} /> : null}
    <div className="app-main-column"><header className="app-topbar"><strong>Không gian System Manager</strong><span>{session?.fullName}</span></header><header className="mobile-header"><button className="mobile-menu-button" type="button" aria-label="Mở menu" aria-controls="manager-sidebar" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}><MenuOutlined /></button><BrandMark /></header><main className="app-content" id="main-content"><div className="page-container"><Outlet /></div></main></div>
  </div>
}
