import React from 'react';
import { NavLink } from 'react-router-dom';

const navItems = [
  { to: '/', label: 'Dashboard' },
  { to: '/teams', label: 'Teams' },
  { to: '/users', label: 'Users' },
  { to: '/channels', label: 'Platforms' },
  { to: '/videos', label: 'Videos' },
  { to: '/assignments', label: 'Assign' },
  { to: '/reports', label: 'Reports' },
];

const Header = () => {
  return (
    <header className="topbar">
      <div className="topbar__inner">
        <div className="brand">
          <div className="brand__mark">TK</div>
          <div>
            <div className="brand__name">Content Performance Report</div>
          </div>
        </div>

        <nav className="nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `nav__link${isActive ? ' nav__link--active' : ''}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="topbar__status">
          <span className="status-dot" />
          Ready
        </div>
      </div>
    </header>
  );
};

export default Header;
