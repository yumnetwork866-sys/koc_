import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

const Header = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    setHasSession(Boolean(localStorage.getItem('content_report_session')));
  }, [location.pathname]);

  const handleSignOut = () => {
    localStorage.removeItem('content_report_session');
    setHasSession(false);
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
          <a href="/#features" className="topbar__nav-link">
            Features
          </a>
          <a href="/#security" className="topbar__nav-link">
            Security
          </a>
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
