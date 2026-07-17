import React from 'react';
import { NavLink } from 'react-router-dom';
import { useI18n } from '../lib/language';

const Footer = () => {
  const { t } = useI18n();
  return (
    <footer className="footer">
      <div className="footer__inner">
        <div className="footer__brand">
          <span className="footer__meta">YUM Network</span>
        </div>

        <div className="footer__card">
          <span className="footer__card-label">{t('shell.legal')}</span>
          <div className="footer__links">
            <a href="/#contact" className="footer__link">{t('shell.support')}</a>
            <NavLink to="/terms" className="footer__link">
              {t('home.terms')}
            </NavLink>
            <NavLink to="/privacy" className="footer__link">
              {t('home.privacy')}
            </NavLink>
            <NavLink to="/data-deletion" className="footer__link">
              {t('home.dataDeletion')}
            </NavLink>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
