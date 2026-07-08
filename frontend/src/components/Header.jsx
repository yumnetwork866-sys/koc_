import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import AppLogo from './AppLogo';
import { clearStoredSession, getStoredSession, hasValidSession } from '../lib/session';
import { useI18n } from '../lib/language';
import { topNavItems } from '../routes/navigation';

const Header = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [hasSession, setHasSession] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRootRef = useRef(null);
  const { t, language, setLanguage } = useI18n();

  const session = getStoredSession();
  const userName = String(session?.user?.name || session?.user?.email || 'Admin').trim();
  const avatarText = userName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0] || '')
    .join('')
    .toUpperCase() || 'A';

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

  useEffect(() => {
    if (!menuOpen) return undefined;

    const handlePointerDown = (event) => {
      if (menuRootRef.current && !menuRootRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [menuOpen]);

  const handleSignOut = () => {
    clearStoredSession();
    setMenuOpen(false);
    navigate('/');
  };

  const handleLanguageChange = (nextLanguage) => {
    setLanguage(nextLanguage);
    setMenuOpen(false);
  };

  const navLabels = {
    '/dashboard': t('nav.tiktok'),
    '/chatbot': t('nav.facebook'),
  };
  const currentLanguage = language;
  const isTopNavActive = (to) => {
    if (to === '/chatbot') return location.pathname.startsWith('/chatbot');
    if (to === '/dashboard') {
      return [
        '/dashboard',
        '/manage',
        '/bookings',
        '/videos',
        '/assignments',
        '/reports',
      ].some((prefix) => location.pathname.startsWith(prefix));
    }
    return location.pathname.startsWith(to);
  };

  return (
    <header className="topbar">
      <div className="topbar__inner">
        <Link to="/" className="brand" aria-label="Go to home">
          <AppLogo size="sm" />
          <div className="brand__text">
            <div className="brand__name">{t('app.name')}</div>
          </div>
        </Link>

        <nav className="topbar__nav" aria-label="Primary">
          {topNavItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={`topbar__nav-link${isTopNavActive(item.to) ? ' topbar__nav-link--active' : ''}`}
            >
              {navLabels[item.to] || item.label}
            </Link>
          ))}
          {hasSession ? (
            <div className="topbar__account" ref={menuRootRef}>
              <button
                type="button"
                className="topbar__avatar-button"
                aria-label="Open account menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((value) => !value)}
              >
                <span className="topbar__avatar">{avatarText}</span>
              </button>
              {menuOpen ? (
                <div className="topbar__account-menu" role="menu" aria-label="Account menu">
                  <div className="topbar__account-head">
                    <strong>{userName}</strong>
                    <span>{t('header.admin')}</span>
                  </div>
                  <Link
                    to="/chatbot/chat-setting"
                    className="topbar__account-item"
                    role="menuitem"
                    onClick={() => setMenuOpen(false)}
                  >
                    {t('header.settings')}
                  </Link>
                  <div className="topbar__account-section" aria-label={t('header.language')}>
                    <span className="topbar__account-section-label">{t('header.language')}</span>
                    <button
                      type="button"
                      className={`topbar__language-switch${currentLanguage === 'en' ? ' topbar__language-switch--en' : ' topbar__language-switch--vi'}`}
                      onClick={() => handleLanguageChange(currentLanguage === 'en' ? 'vi' : 'en')}
                      role="menuitemcheckbox"
                      aria-checked={currentLanguage === 'en'}
                    >
                      <span className="topbar__language-switch-label topbar__language-switch-label--vi">VI</span>
                      <span className="topbar__language-switch-track" aria-hidden="true">
                        <span className="topbar__language-switch-thumb" />
                      </span>
                      <span className="topbar__language-switch-label topbar__language-switch-label--en">EN</span>
                    </button>
                    <div className="topbar__language-caption">
                      {currentLanguage === 'en' ? t('header.english') : t('header.vietnamese')}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="topbar__account-item topbar__account-item--danger"
                    role="menuitem"
                    onClick={handleSignOut}
                  >
                    {t('header.signOut')}
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <Link to="/login" className="button button--ghost topbar__nav-button">
              {t('header.signIn')}
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
};

export default Header;
