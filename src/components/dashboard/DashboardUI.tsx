import { ArrowRightOutlined, ReloadOutlined } from '@ant-design/icons'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import './dashboard.css'

export const dashboardNumber = (value: number) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(value)

export function DashboardHeading({ title, description, health, refreshing, refresh, action }: {
  title: string; description: string; health: 'loading' | 'online' | 'offline'; refreshing: boolean; refresh: () => void; action?: ReactNode
}) {
  return <header className="dw-heading">
    <div className="dw-heading-main"><div><h1>{title}</h1><p>{description}</p></div><div className="dw-heading-actions"><button className="dw-button dw-button-icon" type="button" onClick={refresh} disabled={refreshing} aria-label="Tải lại tổng quan"><ReloadOutlined spin={refreshing} aria-hidden="true" /></button>{action}</div></div>
    {health !== 'online' ? <div className={`dw-connection is-${health}`} role="status"><i aria-hidden="true" />{health === 'loading' ? 'Đang kiểm tra kết nối' : 'Chưa kết nối được hệ thống'}</div> : null}
  </header>
}

export function DashboardMetric({ label, value, suffix, detail, icon, to, loading, error }: {
  label: string; value?: number | string | null; suffix?: string; detail: string; icon: ReactNode; to: string; loading?: boolean; error?: boolean
}) {
  return <Link className="dw-metric" to={to} aria-label={`${label}: ${loading ? 'đang tải' : value ?? 'chưa có dữ liệu'}`}>
    <div className="dw-metric-top"><span>{label}</span><span className="dw-metric-icon" aria-hidden="true">{icon}</span></div>
    <div className="dw-metric-value" aria-busy={loading}>{loading ? <span className="dw-skeleton dw-skeleton-number" aria-label="Đang tải" /> : <>{typeof value === 'number' ? dashboardNumber(value) : value ?? '—'}{value !== null && value !== undefined && suffix ? <small>{suffix}</small> : null}</>}</div>
    {detail || error ? <div className="dw-metric-footer"><span>{error ? 'Chưa tải được' : detail}</span><ArrowRightOutlined aria-hidden="true" /></div> : null}
  </Link>
}

export function DashboardSectionHeading({ title, description, to, linkLabel = 'Xem tất cả' }: { title: string; description?: string; to?: string; linkLabel?: string }) {
  return <div className="dw-section-heading"><div><div><h2>{title}</h2>{description ? <p>{description}</p> : null}</div></div>{to ? <Link className="dw-text-link" to={to}>{linkLabel}<ArrowRightOutlined aria-hidden="true" /></Link> : null}</div>
}

export function DashboardState({ loading, error, empty, children, retry }: { loading?: boolean; error?: string; empty: string; children?: ReactNode; retry?: () => void }) {
  if (loading) return <div className="dw-loading" role="status" aria-label="Đang tải dữ liệu"><span className="dw-skeleton" /><span className="dw-skeleton" /><span className="dw-skeleton" /></div>
  if (error) return <div className="dw-empty is-error" role="alert"><strong>Chưa tải được dữ liệu</strong><p>{error}</p>{retry ? <button className="dw-text-button" type="button" onClick={retry}>Thử tải lại <ArrowRightOutlined aria-hidden="true" /></button> : null}</div>
  return <div className="dw-empty"><strong>{empty}</strong>{children}</div>
}
