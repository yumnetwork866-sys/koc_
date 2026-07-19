import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useSession } from '../lib/useSession';
import { isAdminSession } from '../lib/session';

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
  const destination = location.state?.from?.pathname || '/manage/affiliate';

  if (session) {
    return <Navigate to={destination} replace />;
  }

  return children;
}

export function RequireAdmin({ children, fallback = '/dashboard' }) {
  const location = useLocation();
  const session = useSession();

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (!isAdminSession(session)) {
    return <Navigate to={fallback} replace />;
  }

  return children;
}
