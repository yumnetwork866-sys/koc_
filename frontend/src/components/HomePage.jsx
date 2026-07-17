import React from 'react';
import { Link } from 'react-router-dom';
import { PLATFORMS } from '../lib/platforms';
import { useI18n } from '../lib/language';

const HomePage = () => {
  const { t } = useI18n();
  const productHighlights = [
    { title: t('home.featureReporting'), description: t('home.featureReportingMeta') },
    { title: t('home.featureMessaging'), description: t('home.featureMessagingMeta') },
    { title: t('home.featureWeekly'), description: t('home.featureWeeklyMeta') },
  ];
  const processSteps = [
    { title: t('home.stepConnect'), description: t('home.stepConnectMeta') },
    { title: t('home.stepOrganize'), description: t('home.stepOrganizeMeta') },
    { title: t('home.stepReport'), description: t('home.stepReportMeta') },
  ];
  const privacyContactEmail = import.meta.env.VITE_PRIVACY_CONTACT_EMAIL || 'privacy@yumnetwork.vn';
  const platformHighlights = PLATFORMS.map((platform) => ({
    title: platform.label,
    description: platform.status === 'active' ? t('home.primaryPlatform') : t('home.comingSoon'),
    status: platform.status === 'active' ? t('home.active') : t('home.comingSoon'),
    statusKey: platform.status,
  }));

  return (
    <main className="page home-page">
      <section className="page__hero home-page__hero" id="overview">
        <div className="home-page__hero-copy">
          <h1 className="page__title">{t('home.heroTitle')}</h1>
          <div className="home-page__hero-badges" aria-label={t('home.quickSummary')}>
            {t('home.heroBadges')?.map((badge) => (
              <span className="home-page__badge" key={badge}>
                {badge}
              </span>
            ))}
          </div>
          <div className="home-page__actions">
            <Link to="/dashboard" className="button">
              {t('home.goToDashboard')}
            </Link>
          </div>
        </div>

        <aside className="section-card home-page__hero-card" aria-label={t('home.platformSummary')}>
          <div className="section-card__header home-page__hero-card-header">
            <div>
              <p className="home-page__card-kicker">{t('home.atAGlance')}</p>
              <h2 className="section-card__title">{t('home.whoItServes')}</h2>
            </div>
          </div>

          <div className="home-page__summary-grid">
            <div className="stat-card">
              <p className="stat-card__label">{t('home.primaryUsers')}</p>
              <p className="stat-card__value stat-card__value--small">{t('home.primaryUsersValue')}</p>
            </div>
            <div className="stat-card">
              <p className="stat-card__label">{t('home.mainAction')}</p>
              <p className="stat-card__value stat-card__value--small">{t('home.mainActionValue')}</p>
            </div>
            <div className="stat-card">
              <p className="stat-card__label">{t('home.entryPoint')}</p>
              <p className="stat-card__value stat-card__value--small">{t('home.entryPointValue')}</p>
            </div>
          </div>
        </aside>
      </section>

      <section className="home-page__section" id="platforms">
        <div className="section-card__header">
          <div>
            <h2 className="section-card__title">{t('home.supportedPlatforms')}</h2>
            <p className="section-card__meta">{t('home.supportedPlatformsMeta')}</p>
          </div>
        </div>

        <div className="platform-grid">
          {platformHighlights.map((platform) => (
            <article className={`platform-card platform-card--${platform.statusKey}`} key={platform.title}>
              <div className="metric-item__head">
                <span>{platform.title}</span>
                <span className={`chip ${platform.statusKey === 'active' ? 'chip--positive' : 'chip--amber'}`}>
                  {platform.status}
                </span>
              </div>
              <p className="row-subtitle">{platform.description}</p>
            </article>
          ))}
        </div>

        <div className="grid-two home-page__feature-grid">
          {productHighlights.map((item) => (
            <article className="section-card home-page__card" key={item.title}>
              <h3 className="section-card__title">{item.title}</h3>
              <p className="section-card__meta">{item.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="grid-two home-page__section" id="workflow">
        <article className="section-card" id="process">
          <div className="section-card__header">
            <div>
              <h2 className="section-card__title">{t('home.workflow')}</h2>
              <p className="section-card__meta">{t('home.workflowMeta')}</p>
            </div>
          </div>

          <div className="home-page__steps">
            {processSteps.map((step, index) => (
              <div className="home-page__step" key={step.title}>
                <span className="home-page__step-index">0{index + 1}</span>
                <div>
                  <h3 className="home-page__step-title">{step.title}</h3>
                  <p className="home-page__step-copy">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="section-card" id="access">
          <div className="section-card__header">
            <div>
              <h2 className="section-card__title">{t('home.accessAndData')}</h2>
              <p className="section-card__meta">{t('home.accessAndDataMeta')}</p>
            </div>
          </div>

          <div className="chip-row">
            <span className="chip chip--blue">{t('home.serverOauth')}</span>
            <span className="chip chip--positive">{t('home.roleAccess')}</span>
            <span className="chip chip--amber">{t('home.noPublicExposure')}</span>
          </div>

          <p className="home-page__copy">
            {t('home.dataUsage')}
          </p>
        </article>
      </section>

      <section className="section-card home-page__contact" id="contact">
        <div className="section-card__header">
          <div>
            <h2 className="section-card__title">{t('home.privacyAndSupport')}</h2>
            <p className="section-card__meta">{t('home.privacyAndSupportMeta')}</p>
          </div>
        </div>
        <div className="home-page__contact-grid">
          <div>
            <p className="home-page__contact-label">{t('home.privacyRequests')}</p>
            <a className="home-page__contact-link" href={`mailto:${privacyContactEmail}`}>{privacyContactEmail}</a>
          </div>
          <div>
            <p className="home-page__contact-label">{t('home.platformData')}</p>
            <Link className="home-page__contact-link" to="/privacy">{t('home.readPrivacyPolicy')}</Link>
          </div>
        </div>
      </section>

      <section className="home-page__legal-links" aria-label={t('home.legalLinks')}>
        <Link to="/terms">{t('home.terms')}</Link>
        <Link to="/privacy">{t('home.privacy')}</Link>
        <Link to="/data-deletion">{t('home.dataDeletion')}</Link>
      </section>
    </main>
  );
};

export default HomePage;
