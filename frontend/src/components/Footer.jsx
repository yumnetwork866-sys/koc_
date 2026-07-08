import React from 'react';
import { NavLink } from 'react-router-dom';

const Footer = () => {
  return (
    <footer className="footer">
      <div className="footer__inner">
        <div className="footer__brand">
          <span className="footer__meta">YUM Network</span>
        </div>

        <div className="footer__card">
          <span className="footer__card-label">Legal</span>
          <div className="footer__links">
            <a href="/#contact" className="footer__link">Support</a>
            <NavLink to="/terms" className="footer__link">
              Terms of Service
            </NavLink>
            <NavLink to="/privacy" className="footer__link">
              Privacy Policy
            </NavLink>
            <NavLink to="/data-deletion" className="footer__link">
              Data Deletion
            </NavLink>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
