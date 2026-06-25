import React from 'react';
import { Link } from 'react-router-dom';

const Header = () => {
  return (
    <header className="topbar">
      <div className="topbar__inner">
        <Link to="/" className="brand" aria-label="Go to home">
          <div>
            <div className="brand__name">Performance Report</div>
          </div>
        </Link>
      </div>
    </header>
  );
};

export default Header;
