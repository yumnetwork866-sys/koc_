import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { hasValidSession } from '../lib/session';

export function RequireSession({ children }) {
  const location = useLocation();

  if (!hasValidSession()) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return children;
}

export function LoginRoute({ children }) {
  const location = useLocation();
  const destination = location.state?.from?.pathname || '/dashboard';

  if (hasValidSession()) {
    return <Navigate to={destination} replace />;
  }

  return children;
}

