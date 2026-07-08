import React, { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Header from '../components/Header';
import { useLanguage } from '../lib/language';

const RootLayout = () => {
  const location = useLocation();
  const isLoginPage = location.pathname === '/login';
  const language = useLanguage();

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  return (
    <div className={`app-shell${isLoginPage ? ' app-shell--auth' : ''}`}>
      <Header />
      <Outlet />
    </div>
  );
};

export default RootLayout;
