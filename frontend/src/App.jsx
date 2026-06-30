import React from 'react';
import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom';
import RootLayout from './layouts/RootLayout';
import ProtectedLayout from './layouts/ProtectedLayout';
import { protectedRedirectConfig, protectedRouteConfig, publicRouteConfig } from './routes/appRouteConfig';
import './App.css';

const renderRoutes = (routeConfig) => routeConfig.map((route) => (
  <Route key={route.path} path={route.path} element={route.element} />
));

function App() {
  return (
    <Router>
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
    </Router>
  );
}

export default App;
