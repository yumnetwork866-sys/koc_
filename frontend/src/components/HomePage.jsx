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
      <section className="home-page__hero" id="overview">
        <div className="home-page__hero-copy">
          <h1 className="home-page__headline">
            {t('home.heroPrefix')} <span>{t('home.heroHighlight')}</span>
          </h1>
          <p className="home-page__hero-description">{t('home.heroDescription')}</p>
          <div className="home-page__actions">
            <Link to="/manage/affiliate" className="home-page__cta home-page__cta--primary">
              {t('home.startNow')}
              <span aria-hidden="true">→</span>
            </Link>
            <a href="#platforms" className="home-page__cta home-page__cta--secondary">{t('home.explorePlatform')}</a>
          </div>
        </div>

        <aside className="home-page__preview-wrap" aria-label={t('home.platformSummary')}>
          <span className="home-page__floating-badge home-page__floating-badge--live"><i />{t('home.previewLive')}</span>
          <span className="home-page__floating-badge home-page__floating-badge--sync">✓ {t('home.previewSynced')}</span>
          <div className="home-page__dashboard-preview">
            <div className="home-page__preview-header">
              <div>
                <span className="home-page__preview-kicker">{t('home.previewLabel')}</span>
                <h2>{t('home.previewTitle')}</h2>
              </div>
              <span className="home-page__preview-period">{t('home.previewPeriod')}⌄</span>
            </div>
            <div className="home-page__preview-grid">
              <article className="home-page__preview-main-stat">
                <span>{t('home.previewViews')}</span>
                <strong>8.42M</strong>
                <em>↗ {t('home.previewGrowth')}</em>
              </article>
              <article><span>{t('home.previewEngagement')}</span><strong>8.6%</strong></article>
              <article><span>{t('home.previewCreators')}</span><strong>48</strong></article>
            </div>
            <div className="home-page__chart-head"><span>{t('home.previewViews')}</span><span>{t('home.previewDateRange')}</span></div>
            <div className="home-page__chart" aria-hidden="true">
              <svg viewBox="0 0 520 170" preserveAspectRatio="none">
                <path className="home-page__chart-grid" d="M0 35H520M0 85H520M0 135H520" />
                <path className="home-page__chart-area" d="M0 145 C55 142 68 115 112 120 S175 72 215 86 S275 55 318 68 S380 28 420 46 S480 18 520 25 V170 H0Z" />
                <path className="home-page__chart-line" d="M0 145 C55 142 68 115 112 120 S175 72 215 86 S275 55 318 68 S380 28 420 46 S480 18 520 25" />
                <circle cx="420" cy="46" r="5" fill="#fff" stroke="#7157e8" strokeWidth="3" />
              </svg>
            </div>
            <div className="home-page__preview-footer">
              <span className="home-page__preview-avatars"><i>AN</i><i>MK</i><i>+8</i></span>
              <span><b>✓</b>{t('home.previewGoal')}</span>
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
