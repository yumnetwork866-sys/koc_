import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { clearStoredSession, hasValidSession } from '../lib/session';

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
          <div>
            <div className="brand__name">Content Performance Report</div>
          </div>
        </Link>

        <nav className="topbar__nav" aria-label="Primary">
          <Link to="/dashboard" className="topbar__nav-link">
            TikTok
          </Link>
          <Link to="/chatbot" className="topbar__nav-link">
            Facebook
          </Link>
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
