import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';

const navSections = [
  {
    title: 'TikTok',
    items: [
      { to: '/dashboard', label: 'Dashboard' },
      { to: '/manage/teams', label: 'Teams' },
      { to: '/manage/users', label: 'Users' },
      { to: '/manage/channels', label: 'Channels' },
      { to: '/videos', label: 'Videos' },
      { to: '/assignments', label: 'Assign' },
      { to: '/reports', label: 'Reports' },
    ],
  },
  {
    title: 'Facebook',
    items: [
      { to: '/chatbot/dashboard', label: 'Dashboard' },
      { to: '/chatbot/chat', label: 'Chat' },
      { to: '/chatbot/chat-setting', label: 'Chat setting' },
      { to: '/chatbot/orders', label: 'Đơn hàng' },
    ],
  },
];

const Sidebar = () => {
  const location = useLocation();
  const isFacebookArea = location.pathname.startsWith('/chatbot');
  const visibleSections = isFacebookArea
    ? navSections.filter((section) => section.title === 'Facebook')
    : navSections.filter((section) => section.title === 'TikTok');

  return (
    <aside className="sidebar">
      <nav className="sidebar__nav">
        {visibleSections.map((section) => (
          <div className="sidebar__section" key={section.title}>
            <p className="sidebar__section-title">{section.title}</p>
            <div className="sidebar__section-links">
              {section.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) => `sidebar__link${isActive ? ' sidebar__link--active' : ''}`}
                >
                  {item.label}
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
