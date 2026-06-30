import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Header from '../components/Header';

const RootLayout = () => {
  const location = useLocation();
  const isLoginPage = location.pathname === '/login';

  return (
    <div className={`app-shell${isLoginPage ? ' app-shell--auth' : ''}`}>
      <Header />
      <Outlet />
    </div>
  );
};

export default RootLayout;

