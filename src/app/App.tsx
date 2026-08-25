import { useEffect } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { MapPage } from '../features/map/MapPage';
import { AuthPage } from '../features/auth/AuthPage';
import { HelpPage } from '../features/user/HelpPage';
import { AboutPage } from '../features/user/AboutPage';
import { MePage } from '../features/user/MePage';
import {
  AdminDashboard,
  AdminDataPage,
  AdminExportsPage,
  AdminLayout,
  AdminLogsPage,
  AdminReviewPage,
  AdminSettingsPage,
} from '../features/admin/AdminPages';
import { useAppStore } from '../stores/useAppStore';

function RequireUser() {
  const { user, authReady, hydrateAuth } = useAppStore();
  const location = useLocation();
  useEffect(() => { if (!authReady) hydrateAuth(); }, [authReady, hydrateAuth]);
  if (!authReady) return <div className="route-loading">正在校验访问权限…</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

function RequireAdmin() {
  const { user, authReady, hydrateAuth } = useAppStore();
  useEffect(() => { if (!authReady) hydrateAuth(); }, [authReady, hydrateAuth]);
  if (!authReady) return <div className="route-loading">正在校验管理员身份…</div>;
  if (user?.role !== 'admin') return <Navigate to="/admin/login" replace />;
  return <Outlet />;
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo({ top: 0, left: 0, behavior: 'auto' }); }, [pathname]);
  return null;
}

export function App() {
  const hydrateAuth = useAppStore((state) => state.hydrateAuth);
  const authReady = useAppStore((state) => state.authReady);
  const uiTheme = useAppStore((state) => state.uiTheme);
  useEffect(() => { if (!authReady) hydrateAuth(); }, [authReady, hydrateAuth]);
  useEffect(() => {
    document.documentElement.dataset.theme = uiTheme;
    document.documentElement.style.colorScheme = uiTheme;
  }, [uiTheme]);

  return (
    <><ScrollToTop /><Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/map" element={<MapPage />} />
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/register" element={<AuthPage mode="register" />} />
      <Route path="/about" element={<AboutPage />} />
      <Route path="/help" element={<HelpPage />} />
      <Route element={<RequireUser />}>
        <Route path="/me" element={<MePage />} />
      </Route>
      <Route path="/admin/login" element={<AuthPage mode="admin" />} />
      <Route element={<RequireAdmin />}>
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="dashboard" element={<AdminDashboard />} />
          <Route path="data" element={<AdminDataPage />} />
          <Route path="review" element={<AdminReviewPage />} />
          <Route path="exports" element={<AdminExportsPage />} />
          <Route path="settings" element={<AdminSettingsPage />} />
          <Route path="logs" element={<AdminLogsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes></>
  );
}
