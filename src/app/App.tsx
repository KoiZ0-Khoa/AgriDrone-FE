import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { App as AntApp, ConfigProvider } from 'antd'
import viVN from 'antd/locale/vi_VN'
import { lazy, Suspense, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from '../features/auth/AuthContext'
import { ProtectedRoute } from '../features/auth/ProtectedRoute'
import { SystemAdminRoute, SystemManagerRoute, TenantRoute } from '../features/auth/RoleRoutes'

const HomePage = lazy(() =>
  import('../features/home/HomePage').then((module) => ({ default: module.HomePage })),
)
const LoginPage = lazy(() =>
  import('../features/auth/LoginPage').then((module) => ({ default: module.LoginPage })),
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
const SystemAdminLayout = lazy(() =>
  import('../layouts/SystemAdminLayout').then((module) => ({ default: module.SystemAdminLayout })),
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
const SystemDashboardPage = lazy(() => import('../management/SystemDashboardPage').then(m => ({ default: m.SystemDashboardPage })))
const InvitationPage = lazy(() => import('../management/InvitationPage').then(m => ({ default: m.InvitationPage })))
const OwnerPaymentsPage = lazy(() => import('../features/surveys/OwnerPaymentsPage').then(m => ({ default: m.OwnerPaymentsPage })))
const ManagerBaseMapsPage = lazy(() => import('../features/surveys/ManagerBaseMapsPage').then(m => ({ default: m.ManagerBaseMapsPage })))
const ManagersPage = lazy(() => import('../features/surveys/ManagersPage').then(m => ({ default: m.ManagersPage })))
const ServicesPage = lazy(() => import('../features/surveys/ServicesPage').then(m => ({ default: m.ServicesPage })))
const RequestsPage = lazy(() => import('../features/surveys/RequestsPage').then(m => ({ default: m.RequestsPage })))
const RequestDetailPage = lazy(() => import('../features/surveys/RequestsPage').then(m => ({ default: m.RequestDetailPage })))
const SystemOrdersPage = lazy(() => import('../features/surveys/SystemOrdersPage').then(m => ({ default: m.SystemOrdersPage })))
const SystemOrderAuthorizationsPage = lazy(() => import('../features/surveys/SystemOrdersPage').then(m => ({ default: m.SystemOrderAuthorizationsPage })))
const SurveyIntakePage = lazy(() => import('../features/surveys/SurveyIntakePage').then(m => ({ default: m.SurveyIntakePage })))
const SystemManagerLayout = lazy(() => import('../layouts/SystemManagerLayout').then(m => ({ default: m.SystemManagerLayout })))
const ManagerFarmsPage = lazy(() => import('../features/surveys/ManagerFarmsPage').then(m => ({ default: m.ManagerFarmsPage })))
const ManagerFarmDetailPage = lazy(() => import('../features/surveys/ManagerFarmDetailPage').then(m => ({ default: m.ManagerFarmDetailPage })))
const ManagerOrdersPage = lazy(() => import('../features/surveys/ManagerOrdersPage').then(m => ({ default: m.ManagerOrdersPage })))
const ManagerOrderDetailPage = lazy(() => import('../features/surveys/ManagerOrdersPage').then(m => ({ default: m.ManagerOrderDetailPage })))
const PlantHealthPage = lazy(() => import('../features/surveys/PlantHealthPage').then(m => ({ default: m.PlantHealthPage })))
const MissionWorkspacePage = lazy(() => import('../features/missions/MissionWorkspacePage').then(m => ({ default: m.MissionWorkspacePage })))
const ManagerFarmMissionsPage = lazy(() => import('../features/missions/ManagerFarmMissionsPage').then(m => ({ default: m.ManagerFarmMissionsPage })))
const DronesPage = lazy(() => import('../features/missions/DronesPage').then(m => ({ default: m.DronesPage })))
const PreflightChecklistPage = lazy(() => import('../features/missions/PreflightChecklistPage').then(m => ({ default: m.PreflightChecklistPage })))

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
                  <Route path="/register" element={<Navigate to="/request-survey" replace />} />
                  <Route path="/request-survey" element={<SurveyIntakePage />} />
                  <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                  <Route path="/reset-password" element={<ResetPasswordPage />} />
                  <Route path="/invitation" element={<InvitationPage />} />
                  <Route path="/accept-invitation" element={<InvitationPage />} />
                  <Route path="/accept-system-manager-invitation" element={<InvitationPage kind="system-manager" />} />
                  <Route element={<ProtectedRoute />}>
                    <Route element={<TenantRoute />}>
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
                        <Route path="/survey-requests/new" element={<SurveyIntakePage owner />} />
                        <Route path="/survey-payments" element={<OwnerPaymentsPage />} />
                        <Route path="/survey-payments/return" element={<OwnerPaymentsPage />} />
                        <Route path="/survey-payments/:orderId" element={<OwnerPaymentsPage />} />
                      </Route>
                    </Route>
                    <Route element={<SystemAdminRoute />}>
                      <Route element={<SystemAdminLayout />}>
                        <Route path="/system" element={<SystemDashboardPage />} />
                        <Route path="/system/tenants" element={<SystemPage section="tenants" />} />
                        <Route path="/system/users" element={<SystemPage section="users" />} />
                        <Route path="/system/plant-conditions" element={<SystemPage section="plant-conditions" />} />
                        <Route path="/system/plant-health" element={<PlantHealthPage />} />
                        <Route path="/system/harvest-quality-grades" element={<SystemPage section="harvest-quality-grades" />} />
                        <Route path="/system/account" element={<AccountPage />} />
                        <Route path="/system/managers" element={<ManagersPage />} />
                        <Route path="/system/survey-services" element={<ServicesPage />} />
                        <Route path="/system/survey-requests" element={<RequestsPage />} />
                        <Route path="/system/survey-requests/:requestId" element={<RequestDetailPage />} />
                        <Route path="/system/drones" element={<DronesPage />} />
                        <Route path="/system/preflight-checklist" element={<PreflightChecklistPage />} />
                        <Route path="/system/survey-orders" element={<SystemOrdersPage />} />
                        <Route path="/system/survey-orders/:orderId/authorizations" element={<SystemOrderAuthorizationsPage />} />
                      </Route>
                    </Route>
                    <Route element={<SystemManagerRoute />}>
                      <Route element={<SystemManagerLayout />}>
                        <Route path="/manager" element={<ManagerFarmsPage />} />
                        <Route path="/manager/farms/:farmId" element={<ManagerFarmDetailPage />} />
                        <Route path="/manager/farms/:farmId/base-map-drafts" element={<ManagerBaseMapsPage />} />
                        <Route path="/manager/farms/:farmId/base-map-drafts/:draftId" element={<ManagerBaseMapsPage />} />
                        <Route path="/manager/farms/:farmId/missions" element={<ManagerFarmMissionsPage />} />
                        <Route path="/manager/orders" element={<ManagerOrdersPage />} />
                        <Route path="/manager/orders/:orderId" element={<ManagerOrderDetailPage />} />
                        <Route path="/manager/orders/:orderId/missions/:missionId" element={<MissionWorkspacePage />} />
                        <Route path="/manager/account" element={<AccountPage />} />
                      </Route>
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
