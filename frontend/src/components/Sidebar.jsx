import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { sidebarSections } from '../routes/navigation';

const Sidebar = () => {
  const location = useLocation();
  const isFacebookArea = location.pathname.startsWith('/chatbot');
  const visibleSections = isFacebookArea
    ? sidebarSections.filter((section) => section.title === 'Facebook')
    : sidebarSections.filter((section) => section.title === 'TikTok');

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
