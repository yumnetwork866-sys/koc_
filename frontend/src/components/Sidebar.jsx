import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { isAdminSession } from '../lib/session';
import { useSession } from '../lib/useSession';
import { sidebarSections } from '../routes/navigation';

const sidebarIcons = {
  dashboard: [
    'M4 13h7V4H4v9Z',
    'M13 20h7V4h-7v16Z',
    'M4 20h7v-5H4v5Z',
  ],
  users: [
    'M16 11a4 4 0 1 0-8 0',
    'M3.5 20a6.5 6.5 0 0 1 13 0',
    'M17.5 13.5a3 3 0 0 1 3 3V20',
  ],
  koc: [
    'M12 4l2.3 4.7 5.2.8-3.8 3.7.9 5.3L12 16l-4.6 2.5.9-5.3-3.8-3.7 5.2-.8L12 4Z',
  ],
  analytics: [
    'M5 20V10',
    'M12 20V4',
    'M19 20v-7',
    'M3 20h18',
  ],
  bookings: [
    'M7 4v3',
    'M17 4v3',
    'M5 8h14',
    'M6 6h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z',
  ],
  channels: [
    'M6 7h12',
    'M8 12h8',
    'M10 17h4',
    'M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14l-4-3H6a2 2 0 0 1-2-2V5Z',
  ],
  videos: [
    'M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z',
    'M10 9l5 3-5 3V9Z',
  ],
  reports: [
    'M7 3h8l4 4v14H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z',
    'M15 3v5h5',
    'M8 13h8',
    'M8 17h5',
  ],
  chat: [
    'M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-5 4v-4H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z',
  ],
  settings: [
    'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z',
    'M4 12h2',
    'M18 12h2',
    'M12 4v2',
    'M12 18v2',
    'M5.6 5.6 7 7',
    'M18.4 5.6l-1.4 1.4',
    'M5.6 18.4l1.4-1.4',
    'M18.4 18.4l-1.4-1.4',
  ],
  orders: [
    'M6 3h12l1 18H5L6 3Z',
    'M9 7a3 3 0 0 0 6 0',
    'M8 13h8',
    'M8 17h5',
  ],
};

const routeIconMap = {
  '/dashboard': 'dashboard',
  '/manage/users': 'users',
  '/manage/koc-performance': 'koc',
  '/manage/shop-analytics': 'analytics',
  '/bookings': 'bookings',
  '/manage/channels': 'channels',
  '/videos': 'videos',
  '/reports': 'reports',
  '/chatbot/dashboard': 'dashboard',
  '/chatbot/chat': 'chat',
  '/chatbot/chat-setting': 'settings',
  '/chatbot/orders': 'orders',
};

const SidebarIcon = ({ name }) => {
  const paths = sidebarIcons[name] || sidebarIcons.dashboard;

  return (
    <svg className="sidebar__link-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {paths.map((path) => (
        <path key={path} d={path} />
      ))}
    </svg>
  );
};

const CollapseIcon = ({ isCollapsed }) => (
  <svg className="sidebar__toggle-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d={isCollapsed ? 'm9 6 6 6-6 6' : 'm15 6-6 6 6 6'} />
  </svg>
);

const Sidebar = ({ isCollapsed, onToggle }) => {
  const location = useLocation();
  const session = useSession();
  const isFacebookArea = location.pathname.startsWith('/chatbot');
  const adminVisible = isAdminSession(session);
  const visibleSections = isFacebookArea
    ? sidebarSections.filter((section) => section.title === 'Facebook')
    : sidebarSections.filter((section) => section.title === 'TikTok');

  return (
    <aside className={`sidebar${isCollapsed ? ' sidebar--collapsed' : ''}`}>
      <div className="sidebar__header">
        <span className="sidebar__header-label">Điều hướng</span>
        <button
          type="button"
          className="sidebar__toggle"
          onClick={onToggle}
          aria-label={isCollapsed ? 'Mở rộng thanh điều hướng' : 'Thu gọn thanh điều hướng'}
          aria-expanded={!isCollapsed}
          title={isCollapsed ? 'Mở rộng' : 'Thu gọn'}
        >
          <CollapseIcon isCollapsed={isCollapsed} />
        </button>
      </div>
      <nav className="sidebar__nav" aria-label="Workspace">
        {visibleSections.map((section) => (
          <div className="sidebar__section" key={section.title}>
            <p className="sidebar__section-title">{section.title}</p>
            <div className="sidebar__section-links">
              {section.items
                .filter((item) => adminVisible || !item.adminOnly)
                .map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) => `sidebar__link${isActive ? ' sidebar__link--active' : ''}`}
                    title={isCollapsed ? item.label : undefined}
                  >
                    <SidebarIcon name={routeIconMap[item.to]} />
                    <span className="sidebar__link-label">{item.label}</span>
                  </NavLink>
                ))}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
};

export default Sidebar;
