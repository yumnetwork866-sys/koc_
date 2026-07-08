import React from 'react';
import AppLogo from './AppLogo';
import { useI18n } from '../lib/language';

const LegalPage = ({ title, updatedAt, children }) => {
  const { t } = useI18n();

  return (
    <div className="page legal-page">
      <section className="page__hero legal-page__hero">
        <div className="legal-page__hero-row">
          <h1 className="page__title legal-page__title">{title}</h1>
          <div className="legal-page__brand">
            <span className="legal-page__brand-label">{t('app.name')}</span>
            <AppLogo size="md" className="legal-page__brand-logo" />
          </div>
        </div>
        <p className="page__subtitle">
          {t('legal.lastUpdated') || 'Last updated'}
          : {updatedAt}
        </p>
      </section>

      <section className="section-card legal-page__card">
        <div className="legal-page__content">{children}</div>
      </section>
    </div>
  );
};

export default LegalPage;
