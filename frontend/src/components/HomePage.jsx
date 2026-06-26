import React from 'react';
import { Link } from 'react-router-dom';

const productHighlights = [
  {
    title: 'Reporting views',
    description: 'Browse channel, video, team, and product data in one place.',
  },
  {
    title: 'Account connections',
    description: 'Bring data in through OAuth or approved imports.',
  },
  {
    title: 'Weekly outputs',
    description: 'Generate summaries for a chosen date range.',
  },
];

const processSteps = [
  {
    title: 'Connect',
    description: 'Add approved sources and verify access.',
  },
  {
    title: 'Organize',
    description: 'Map videos to the right teams and owners.',
  },
  {
    title: 'Report',
    description: 'Review outputs and share the result.',
  },
];

const HomePage = () => {
  return (
    <div className="page home-page">
      <section className="page__hero home-page__hero" id="overview">
        <div className="home-page__hero-copy">
          <h1 className="page__title">Content Operations Dashboard</h1>
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

      <section className="home-page__section" id="features">
        <div className="section-card__header">
          <div>
            <h2 className="section-card__title">What it includes</h2>
          </div>
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

      <section className="grid-two home-page__section">
        <article className="section-card" id="process">
          <div className="section-card__header">
            <div>
              <h2 className="section-card__title">Typical flow</h2>
              <p className="section-card__meta">From setup to review.</p>
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

        <article className="section-card" id="security">
          <div className="section-card__header">
            <div>
              <h2 className="section-card__title">Access and data</h2>
              <p className="section-card__meta">Governance and handling.</p>
            </div>
          </div>

          <div className="chip-row">
            <span className="chip chip--blue">Server-side OAuth</span>
            <span className="chip chip--positive">Role-based access</span>
            <span className="chip chip--amber">No public data exposure</span>
          </div>

          <p className="home-page__copy">
            Account and reporting data are processed on the backend and shown only to authorized users.
          </p>
        </article>
      </section>

      <section className="home-page__legal-links" aria-label="Legal links">
        <Link to="/terms">Terms of Service</Link>
        <Link to="/privacy">Privacy Policy</Link>
      </section>
    </div>
  );
};

export default HomePage;
