import React from 'react';
import { Link } from 'react-router-dom';
import { PLATFORMS } from '../lib/platforms';

const productHighlights = [
  {
    title: 'Platform reporting',
    description: 'Connect supported platforms, sync approved metrics, and review performance by user or workspace.',
  },
  {
    title: 'Messaging automation',
    description: 'Connect messaging channels, receive conversations, and manage responses and knowledge.',
  },
  {
    title: 'Weekly outputs',
    description: 'Generate summaries for selected reporting windows and save them for review.',
  },
];

const processSteps = [
  {
    title: 'Connect',
    description: 'Add approved sources and verify access.',
  },
  {
    title: 'Organize',
    description: 'Map videos to the right owners.',
  },
  {
    title: 'Report',
    description: 'Review outputs and share the result.',
  },
];

const HomePage = () => {
  const privacyContactEmail = import.meta.env.VITE_PRIVACY_CONTACT_EMAIL || 'privacy@yumnetwork.vn';
  const platformHighlights = PLATFORMS.map((platform) => ({
    title: platform.label,
    description: platform.description,
    status: platform.status,
  }));

  return (
    <div className="page home-page">
      <section className="page__hero home-page__hero" id="overview">
        <div className="home-page__hero-copy">
          <h1 className="page__title">Manage, review, and report</h1>
          <div className="home-page__hero-badges" aria-label="Quick summary">
            <span className="home-page__badge">Overview</span>
            <span className="home-page__badge">Workflow</span>
            <span className="home-page__badge">Access</span>
          </div>
          <div className="home-page__actions">
            <Link to="/dashboard" className="button">
              Go to dashboard
            </Link>
          </div>
        </div>

        <aside className="section-card home-page__hero-card" aria-label="Platform summary">
          <div className="section-card__header home-page__hero-card-header">
            <div>
              <p className="home-page__card-kicker">At a glance</p>
              <h2 className="section-card__title">Who it serves</h2>
            </div>
          </div>

          <div className="home-page__summary-grid">
            <div className="stat-card">
              <p className="stat-card__label">Primary users</p>
              <p className="stat-card__value stat-card__value--small">Ops and reviewers</p>
            </div>
            <div className="stat-card">
              <p className="stat-card__label">Main action</p>
              <p className="stat-card__value stat-card__value--small">Track and review</p>
            </div>
            <div className="stat-card">
              <p className="stat-card__label">Entry point</p>
              <p className="stat-card__value stat-card__value--small">Public site to app</p>
            </div>
          </div>
        </aside>
      </section>

      <section className="home-page__section" id="platforms">
        <div className="section-card__header">
          <div>
            <h2 className="section-card__title">Supported platforms</h2>
            <p className="section-card__meta">The workspace adapts to any platform you connect later.</p>
          </div>
        </div>

        <div className="platform-grid">
          {platformHighlights.map((platform) => (
            <article className={`platform-card platform-card--${platform.status}`} key={platform.title}>
              <div className="metric-item__head">
                <span>{platform.title}</span>
                <span className={`chip ${platform.status === 'active' ? 'chip--positive' : 'chip--amber'}`}>
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
              <h2 className="section-card__title">Workflow</h2>
              <p className="section-card__meta">A generic flow for platform setup, content operations, and reporting.</p>
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
              <h2 className="section-card__title">Access and data</h2>
              <p className="section-card__meta">Governance and handling for connected platforms.</p>
            </div>
          </div>

          <div className="chip-row">
            <span className="chip chip--blue">Server-side OAuth</span>
            <span className="chip chip--positive">Role-based access</span>
            <span className="chip chip--amber">No public data exposure</span>
          </div>

          <p className="home-page__copy">
            Supported platform connections are optional. We use approved data only to connect the platform, sync
            reporting, and show it to authorized workspace users. You can disconnect access at any time.
          </p>
        </article>
      </section>

      <section className="section-card home-page__contact" id="contact">
        <div className="section-card__header">
          <div>
            <h2 className="section-card__title">Privacy and support</h2>
            <p className="section-card__meta">Request access, correction, deletion, or support for any connected platform.</p>
          </div>
        </div>
        <div className="home-page__contact-grid">
          <div>
            <p className="home-page__contact-label">Privacy requests</p>
            <a className="home-page__contact-link" href={`mailto:${privacyContactEmail}`}>{privacyContactEmail}</a>
          </div>
          <div>
            <p className="home-page__contact-label">Platform data</p>
            <Link className="home-page__contact-link" to="/privacy">Read our Privacy Policy</Link>
          </div>
        </div>
      </section>

      <section className="home-page__legal-links" aria-label="Legal links">
        <Link to="/terms">Terms of Service</Link>
        <Link to="/privacy">Privacy Policy</Link>
        <Link to="/data-deletion">Data Deletion</Link>
      </section>
    </div>
  );
};

export default HomePage;
