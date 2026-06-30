import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import { RequireSession } from '../routes/guards';

const ProtectedLayout = () => {
  return (
    <RequireSession>
      <div className="app-shell__layout">
        <Sidebar />
        <main className="app-shell__content">
          <Outlet />
        </main>
      </div>
    </RequireSession>
  );
};

export default ProtectedLayout;

