import React from 'react';
import AppLogo from './AppLogo';

const LegalPage = ({ title, updatedAt, children }) => {
  return (
    <div className="page legal-page">
      <section className="page__hero legal-page__hero">
        <div className="legal-page__brand">
          <AppLogo size="lg" className="legal-page__brand-logo" />
          <div className="legal-page__brand-copy">
            <span className="legal-page__brand-label">YUM Network</span>
            <span className="legal-page__brand-subtitle">Official site</span>
          </div>
        </div>
        <span className="page__eyebrow">Legal</span>
        <h1 className="page__title">{title}</h1>
        <p className="page__subtitle">Last updated: {updatedAt}</p>
      </section>

      <section className="section-card legal-page__card">
        <div className="legal-page__content">{children}</div>
      </section>
    </div>
  );
};

export default LegalPage;
