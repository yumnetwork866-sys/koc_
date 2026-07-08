import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import AppLogo from './AppLogo';
import { clearStoredSession, hasValidSession } from '../lib/session';
import { topNavItems } from '../routes/navigation';

const Header = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    const syncSessionState = () => setHasSession(hasValidSession());

    syncSessionState();
    window.addEventListener('storage', syncSessionState);
    window.addEventListener('content-report-session-change', syncSessionState);

    return () => {
      window.removeEventListener('storage', syncSessionState);
      window.removeEventListener('content-report-session-change', syncSessionState);
    };
  }, [location.pathname]);

  const handleSignOut = () => {
    clearStoredSession();
    navigate('/');
  };

  return (
    <header className="topbar">
      <div className="topbar__inner">
        <Link to="/" className="brand" aria-label="Go to home">
          <AppLogo size="sm" />
          <div className="brand__text">
            <div className="brand__name">Content Performance Report</div>
          </div>
        </Link>

        <nav className="topbar__nav" aria-label="Primary">
          {topNavItems.map((item) => (
            <Link key={item.to} to={item.to} className="topbar__nav-link">
              {item.label}
            </Link>
          ))}
          {hasSession ? (
            <button type="button" className="button button--ghost topbar__nav-button" onClick={handleSignOut}>
              Sign out
            </button>
          ) : (
            <Link to="/login" className="button button--ghost topbar__nav-button">
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
};

export default Header;
