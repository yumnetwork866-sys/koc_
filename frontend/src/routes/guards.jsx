import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useSession } from '../lib/useSession';

export function RequireSession({ children }) {
  const location = useLocation();
  const session = useSession();

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return children;
}

export function LoginRoute({ children }) {
  const location = useLocation();
  const session = useSession();
  const destination = location.state?.from?.pathname || '/dashboard';

  if (session) {
    return <Navigate to={destination} replace />;
  }

  return children;
}
