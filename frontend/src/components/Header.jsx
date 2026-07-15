import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import AppLogo from './AppLogo';
import { getFacebookOauthUrl, getTikTokOauthUrl, startTikTokPartnerOauth, startTikTokShopOauth } from '../lib/api';
import { clearStoredSession, isAdminSession } from '../lib/session';
import { useSession } from '../lib/useSession';
import { useI18n } from '../lib/language';
import { topNavItems } from '../routes/navigation';

const KOC_OAUTH_UI_STATE_KEY = 'koc-performance-oauth-ui-state';

const TikTokGlyph = () => (
  <svg viewBox="0 0 24 24" focusable="false">
    <path fill="#25f4ee" d="M13.2 3.2v10.2a3.1 3.1 0 1 1-2.3-3V13a1.3 1.3 0 1 0 .5 1V3.2h1.8Zm0 0c.4 2.1 1.7 3.4 3.8 3.9v2.2a7 7 0 0 1-3.8-1.7V3.2Z" transform="translate(-.8 .7)" />
    <path fill="#fe2c55" d="M13.2 3.2v10.2a3.1 3.1 0 1 1-2.3-3V13a1.3 1.3 0 1 0 .5 1V3.2h1.8Zm0 0c.4 2.1 1.7 3.4 3.8 3.9v2.2a7 7 0 0 1-3.8-1.7V3.2Z" transform="translate(.7 -.2)" />
    <path fill="#111827" d="M13.2 3.2v10.2a3.1 3.1 0 1 1-2.3-3V13a1.3 1.3 0 1 0 .5 1V3.2h1.8Zm0 0c.4 2.1 1.7 3.4 3.8 3.9v2.2a7 7 0 0 1-3.8-1.7V3.2Z" />
  </svg>
);

const ConnectionIcon = ({ type }) => {
  if (type === 'facebook') {
    return (
      <span className="topbar__connect-icon topbar__connect-icon--facebook" aria-hidden="true">
        <svg viewBox="0 0 32 32" focusable="false">
          <rect width="32" height="32" rx="8" fill="#1877f2" />
          <path fill="#fff" d="M18.5 27V17.2h3.3l.5-3.8h-3.8V11c0-1.1.3-1.8 1.9-1.8h2V5.8c-.4 0-1.6-.2-3-.2-3 0-5 1.8-5 5.1v2.8H11v3.8h3.4V27h4.1Z" />
        </svg>
      </span>
    );
  }

  return (
    <span className={`topbar__connect-icon${type === 'creator' || type === 'shop' ? ' topbar__connect-icon--creator' : ''}`} aria-hidden="true">
      <TikTokGlyph />
      {type === 'creator' || type === 'shop' ? (
        <span className="topbar__connect-creator-mark">
          {type === 'shop' ? <span aria-hidden="true">▣</span> : <svg viewBox="0 0 16 16" focusable="false"><circle cx="8" cy="5.3" r="2.4" fill="currentColor" /><path fill="currentColor" d="M3.7 13c.3-2.5 1.8-3.8 4.3-3.8s4 1.3 4.3 3.8H3.7Z" /></svg>}
        </span>
      ) : null}
    </span>
  );
};

const Header = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const session = useSession();
  const hasSession = Boolean(session);
  const isAdmin = isAdminSession(session);
  const [activeMenu, setActiveMenu] = useState(null);
  const [connectingTarget, setConnectingTarget] = useState(null);
  const [connectionError, setConnectionError] = useState('');
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const accountRootRef = useRef(null);
  const accountTriggerRef = useRef(null);
  const connectRootRef = useRef(null);
  const connectTriggerRef = useRef(null);
  const connectMenuRef = useRef(null);
  const { t, language, setLanguage } = useI18n();

  const userName = String(session?.user?.name || session?.user?.email || 'Admin').trim();
  const avatarText = userName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0] || '')
    .join('')
    .toUpperCase() || 'A';
  const avatarSeed = String(session?.user?.id || session?.user?.email || userName);
  const avatarUrl = `https://api.dicebear.com/10.x/lorelei-neutral/svg?seed=${encodeURIComponent(avatarSeed)}&backgroundColor=e6f7f5`;

  useEffect(() => {
    setAvatarLoadFailed(false);
  }, [avatarUrl]);

  useEffect(() => {
    if (!activeMenu) return undefined;

    const handlePointerDown = (event) => {
      const activeRoot = activeMenu === 'connect' ? connectRootRef.current : accountRootRef.current;
      if (activeRoot && !activeRoot.contains(event.target)) {
        setActiveMenu(null);
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        const trigger = activeMenu === 'connect' ? connectTriggerRef.current : accountTriggerRef.current;
        setActiveMenu(null);
        window.requestAnimationFrame(() => trigger?.focus());
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [activeMenu]);

  useEffect(() => {
    setActiveMenu(null);
    setConnectionError('');
  }, [location.pathname]);

  const handleSignOut = () => {
    clearStoredSession();
    setActiveMenu(null);
    navigate('/');
  };

  const handleLanguageChange = (nextLanguage) => {
    setLanguage(nextLanguage);
  };

  const navLabels = {
    '/dashboard': t('nav.tiktok'),
    '/chatbot': t('nav.facebook'),
  };
  const currentLanguage = language;
  const connectionOptions = [
    { id: 'tiktok', label: t('header.connectTikTok'), meta: t('header.connectTikTokMeta') },
    { id: 'creator', label: t('header.connectTikTokCreator'), meta: t('header.connectTikTokCreatorMeta') },
    { id: 'shop', label: t('header.connectTikTokShop'), meta: t('header.connectTikTokShopMeta') },
    { id: 'facebook', label: t('header.connectFacebook'), meta: t('header.connectFacebookMeta') },
  ];
  const isTopNavActive = (to) => {
    if (to === '/manage/users') {
      return location.pathname.startsWith('/manage/users') || location.pathname.startsWith('/chatbot/chat-setting');
    }
    if (to === '/chatbot') {
      return location.pathname.startsWith('/chatbot') && !location.pathname.startsWith('/chatbot/chat-setting');
    }
    if (to === '/dashboard') {
      return [
        '/dashboard',
        '/manage/koc-performance',
        '/manage/shop-analytics',
        '/bookings',
        '/videos',
        '/reports',
      ].some((prefix) => location.pathname.startsWith(prefix));
    }
    return location.pathname.startsWith(to);
  };
  const focusConnectionItem = (position) => {
    window.requestAnimationFrame(() => {
      const items = Array.from(connectMenuRef.current?.querySelectorAll('[role="menuitem"]:not(:disabled)') || []);
      if (!items.length) return;
      items[position === 'last' ? items.length - 1 : 0].focus();
    });
  };

  const handleConnectTriggerKeyDown = (event) => {
    if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
    event.preventDefault();
    setActiveMenu('connect');
    setConnectionError('');
    focusConnectionItem(event.key === 'ArrowUp' ? 'last' : 'first');
  };

  const handleConnectMenuKeyDown = (event) => {
    const items = Array.from(connectMenuRef.current?.querySelectorAll('[role="menuitem"]:not(:disabled)') || []);
    if (!items.length) return;
    const currentIndex = items.indexOf(document.activeElement);
    let nextIndex = null;
    if (event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % items.length;
    if (event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + items.length) % items.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = items.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    items[nextIndex].focus();
  };

  const preserveKocOauthState = () => {
    if (!location.pathname.startsWith('/manage/koc-performance')) return;
    let saved = {};
    try { saved = JSON.parse(sessionStorage.getItem(KOC_OAUTH_UI_STATE_KEY) || '{}'); } catch { saved = {}; }
    sessionStorage.setItem(KOC_OAUTH_UI_STATE_KEY, JSON.stringify({ ...saved, scrollY: window.scrollY }));
  };

  const startConnection = async (target) => {
    try {
      setConnectingTarget(target);
      setConnectionError('');
      let authorizeUrl;
      if (target === 'tiktok') authorizeUrl = await getTikTokOauthUrl();
      if (target === 'creator') {
        preserveKocOauthState();
        ({ authorizeUrl } = await startTikTokPartnerOauth('/manage/koc-performance'));
      }
      if (target === 'shop') ({ authorizeUrl } = await startTikTokShopOauth());
      if (target === 'facebook') authorizeUrl = await getFacebookOauthUrl();
      if (!authorizeUrl) throw new Error(t('header.connectionError'));
      setActiveMenu(null);
      window.location.assign(authorizeUrl);
    } catch (error) {
      setConnectionError(error.message || t('header.connectionError'));
    } finally {
      setConnectingTarget(null);
    }
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
          {topNavItems.filter((item) => !item.adminOnly || isAdmin).map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={`topbar__nav-link${isTopNavActive(item.to) ? ' topbar__nav-link--active' : ''}`}
              aria-current={isTopNavActive(item.to) ? 'page' : undefined}
            >
              {navLabels[item.to] || item.label}
            </Link>
          ))}
          {hasSession ? (
            <>
              <div className="topbar__connect" ref={connectRootRef}>
                <button
                  ref={connectTriggerRef}
                  type="button"
                  className="topbar__connect-trigger"
                  aria-haspopup="menu"
                  aria-controls="topbar-connect-menu"
                  aria-expanded={activeMenu === 'connect'}
                  onClick={() => {
                    setConnectionError('');
                    setActiveMenu((current) => current === 'connect' ? null : 'connect');
                  }}
                  onKeyDown={handleConnectTriggerKeyDown}
                >
                  <span>{t('header.connect')}</span>
                </button>
                {activeMenu === 'connect' ? (
                  <div
                    id="topbar-connect-menu"
                    ref={connectMenuRef}
                    className="topbar__connect-menu"
                    role="menu"
                    aria-label={t('header.connections')}
                    aria-busy={Boolean(connectingTarget)}
                    onKeyDown={handleConnectMenuKeyDown}
                  >
                    <div className="topbar__connect-head">
                      <strong>{t('header.connections')}</strong>
                      <span>{t('header.connectionsMeta')}</span>
                    </div>
                    {connectionOptions.map((option) => (
                      <button
                        className="topbar__connect-item"
                        type="button"
                        role="menuitem"
                        key={option.id}
                        disabled={Boolean(connectingTarget)}
                        onClick={() => startConnection(option.id)}
                      >
                        <ConnectionIcon type={option.id} />
                        <span className="topbar__connect-copy">
                          <strong>{option.label}</strong>
                          <small>{connectingTarget === option.id ? t('header.connecting') : option.meta}</small>
                        </span>
                        <span className="topbar__connect-arrow" aria-hidden="true">→</span>
                      </button>
                    ))}
                    {connectionError ? <p className="topbar__connect-error" role="alert">{connectionError}</p> : null}
                  </div>
                ) : null}
              </div>
              <div className="topbar__account" ref={accountRootRef}>
              <button
                ref={accountTriggerRef}
                type="button"
                className="topbar__avatar-button"
                aria-label="Open account menu"
                aria-expanded={activeMenu === 'account'}
                onClick={() => setActiveMenu((current) => current === 'account' ? null : 'account')}
              >
                <span className="topbar__avatar">
                  {avatarLoadFailed ? avatarText : (
                    <img
                      src={avatarUrl}
                      alt=""
                      referrerPolicy="no-referrer"
                      onError={() => setAvatarLoadFailed(true)}
                    />
                  )}
                </span>
              </button>
              {activeMenu === 'account' ? (
                <div className="topbar__account-menu" role="menu" aria-label="Account menu">
                  <div className="topbar__account-head">
                    <strong>{userName}</strong>
                    <span>{t('header.account')}</span>
                  </div>
                  <Link
                    to="/chatbot/chat-setting"
                    className="topbar__account-item"
                    role="menuitem"
                    onClick={() => setActiveMenu(null)}
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
                      <span className="topbar__language-switch-label topbar__language-switch-label--en">EN</span>
                    </button>
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
            </>
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
