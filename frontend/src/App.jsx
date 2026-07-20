import React, { Suspense } from 'react';
import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom';
import AppErrorBoundary from './components/AppErrorBoundary';
import RootLayout from './layouts/RootLayout';
import ProtectedLayout from './layouts/ProtectedLayout';
import { protectedRedirectConfig, protectedRouteConfig, publicRouteConfig } from './routes/appRouteConfig';
import { useI18n } from './lib/language';

const renderRoutes = (routeConfig) => routeConfig.map((route) => (
  <Route key={route.path} path={route.path} element={route.element} />
));

function App() {
  const { t } = useI18n();
  return (
    <Router>
      <AppErrorBoundary>
        <Suspense
          fallback={
            <div className="app-shell">
              <div className="page">
                <section className="section-card empty-state">
                  <div className="loading-dot" />
                  <div>{t('shell.loadingContent')}</div>
                </section>
              </div>
            </div>
          }
        >
          <Routes>
            <Route element={<RootLayout />}>
              {renderRoutes(publicRouteConfig)}
              <Route element={<ProtectedLayout />}>
                {renderRoutes(protectedRedirectConfig)}
                {renderRoutes(protectedRouteConfig)}
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </Suspense>
      </AppErrorBoundary>
    </Router>
  );
}

export default App;
