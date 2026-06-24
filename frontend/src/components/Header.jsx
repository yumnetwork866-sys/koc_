import React from 'react';
import { NavLink } from 'react-router-dom';

const navItems = [
  { to: '/', label: 'Dashboard' },
  { to: '/employees', label: 'Employees' },
  { to: '/videos', label: 'Videos' },
  { to: '/reports', label: 'Reports' },
];

const Header = () => {
  return (
    <header className="topbar">
      <div className="topbar__inner">
        <div className="brand">
          <div className="brand__mark">EP</div>
          <div>
            <div className="brand__name">Employee Performance</div>
            <div className="brand__tagline">Marketing, Content AI, and News Team</div>
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
          Live insights
        </div>
      </div>
    </header>
  );
};

export default Header;
