import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { App as AntApp, ConfigProvider } from 'antd'
import viVN from 'antd/locale/vi_VN'
import { lazy, Suspense, useState } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from '../features/auth/AuthContext'
import { ProtectedRoute } from '../features/auth/ProtectedRoute'

const HomePage = lazy(() =>
  import('../features/home/HomePage').then((module) => ({ default: module.HomePage })),
)
const LoginPage = lazy(() =>
  import('../features/auth/LoginPage').then((module) => ({ default: module.LoginPage })),
)
const RegisterPage = lazy(() =>
  import('../features/auth/AuthActionPages').then((module) => ({ default: module.RegisterPage })),
)
const ForgotPasswordPage = lazy(() =>
  import('../features/auth/AuthActionPages').then((module) => ({ default: module.ForgotPasswordPage })),
)
const ResetPasswordPage = lazy(() =>
  import('../features/auth/AuthActionPages').then((module) => ({ default: module.ResetPasswordPage })),
)
const AppLayout = lazy(() =>
  import('../layouts/AppLayout').then((module) => ({ default: module.AppLayout })),
)
const DashboardPage = lazy(() =>
  import('../pages/DashboardPage').then((module) => ({ default: module.DashboardPage })),
)
const FarmsPage = lazy(() =>
  import('../features/farms/FarmsPage').then((module) => ({ default: module.FarmsPage })),
)
const FarmDetailPage = lazy(() =>
  import('../features/farms/FarmsPage').then((module) => ({ default: module.FarmDetailPage })),
)
const ArchivedFarmsPage = lazy(() => import('../features/farms/ArchivedFarmsPage').then(m => ({ default: m.ArchivedFarmsPage })))
const ArchivedFarmDetailPage = lazy(() => import('../features/farms/ArchivedFarmsPage').then(m => ({ default: m.ArchivedFarmDetailPage })))
const ZonesPage = lazy(() =>
  import('../features/farms/ZonesPage').then((module) => ({ default: module.ZonesPage })),
)
const NotFoundPage = lazy(() =>
  import('../pages/NotFoundPage').then((module) => ({ default: module.NotFoundPage })),
)
const AccountPage = lazy(() => import('../management/AccountPage').then(m => ({ default: m.AccountPage })))
const TeamPage = lazy(() => import('../management/TeamPage').then(m => ({ default: m.TeamPage })))
const MyFarmsPage = lazy(() => import('../management/MyFarmsPage').then(m => ({ default: m.MyFarmsPage })))
const SystemPage = lazy(() => import('../management/SystemPage').then(m => ({ default: m.SystemPage })))
const InvitationPage = lazy(() => import('../management/InvitationPage').then(m => ({ default: m.InvitationPage })))

export function App() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: false },
          mutations: { retry: false },
        },
      }),
  )

  return (
    <ConfigProvider
      locale={viVN}
      theme={{
        token: {
          colorPrimary: '#0c8c5e',
          colorInfo: '#0c8c5e',
          colorSuccess: '#0c8c5e',
          colorWarning: '#8a5a00',
          colorError: '#b42318',
          colorText: '#000000',
          colorTextSecondary: '#60646c',
          colorBorder: '#dddddd',
          borderRadius: 4,
          fontFamily: "'Inter Variable', Inter, ui-sans-serif, system-ui, sans-serif",
        },
        components: {
          Button: { controlHeight: 42, fontWeight: 500, borderRadius: 4 },
          Input: { controlHeight: 46, borderRadius: 4 },
        },
      }}
    >
      <AntApp>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <AuthProvider>
              <Suspense fallback={<div className="route-loading">Đang tải giao diện…</div>}>
                <Routes>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/register" element={<RegisterPage />} />
                  <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                  <Route path="/reset-password" element={<ResetPasswordPage />} />
                  <Route path="/invitation" element={<InvitationPage />} />
                  <Route path="/accept-invitation" element={<InvitationPage />} />
                  <Route element={<ProtectedRoute />}>
                    <Route element={<AppLayout />}>
                      <Route path="/dashboard" element={<DashboardPage />} />
                      <Route path="/farms" element={<FarmsPage />} />
                      <Route path="/farms/archived" element={<ArchivedFarmsPage />} />
                      <Route path="/farms/archived/:farmId" element={<ArchivedFarmDetailPage />} />
                      <Route path="/farms/:farmId" element={<FarmDetailPage />} />
                      <Route path="/zones" element={<ZonesPage />} />
                      <Route path="/account" element={<AccountPage />} />
                      <Route path="/team" element={<TeamPage />} />
                      <Route path="/my-farms" element={<MyFarmsPage />} />
                      <Route path="/system" element={<SystemPage />} />
                    </Route>
                  </Route>
                  <Route path="*" element={<NotFoundPage />} />
                </Routes>
              </Suspense>
            </AuthProvider>
          </BrowserRouter>
        </QueryClientProvider>
      </AntApp>
    </ConfigProvider>
  )
}
