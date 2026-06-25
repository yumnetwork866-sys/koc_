import React, { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

const navItems = [
  { to: '/', label: 'Dashboard' },
  { key: 'manage', label: 'Manage' },
  { to: '/videos', label: 'Videos' },
  { to: '/assignments', label: 'Assign' },
  { to: '/reports', label: 'Reports' },
];

const manageItems = [
  { to: '/manage/teams', label: 'Teams' },
  { to: '/manage/users', label: 'Users' },
  { to: '/manage/channels', label: 'Channels' },
];

const Sidebar = () => {
  const location = useLocation();
  const isManageRoute = location.pathname.startsWith('/manage');
  const [isManageOpen, setIsManageOpen] = useState(isManageRoute);

  useEffect(() => {
    if (isManageRoute) {
      setIsManageOpen(true);
    }
  }, [isManageRoute]);

  return (
    <aside className="sidebar">
      <nav className="sidebar__nav">
        {navItems.map((item) =>
          item.key === 'manage' ? (
            <div key={item.key} className="sidebar__expandable">
              <button
                type="button"
                className={`sidebar__link sidebar__link--button${
                  isManageRoute ? ' sidebar__link--active' : ''
                }`}
                aria-expanded={isManageOpen}
                onClick={() => setIsManageOpen((current) => !current)}
              >
                <span>{item.label}</span>
                <span
                  className={`sidebar__chevron${isManageOpen ? ' sidebar__chevron--open' : ''}`}
                />
              </button>
              {isManageOpen ? (
                <div className="sidebar__subnav">
                  {manageItems.map((manageItem) => (
                    <NavLink
                      key={manageItem.to}
                      to={manageItem.to}
                      className={({ isActive }) =>
                        `sidebar__sublink${isActive ? ' sidebar__sublink--active' : ''}`
                      }
                    >
                      {manageItem.label}
                    </NavLink>
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `sidebar__link${isActive ? ' sidebar__link--active' : ''}`
              }
              >
                {item.label}
              </NavLink>
          )
        )}
      </nav>
    </aside>
  );
};

export default Sidebar;
