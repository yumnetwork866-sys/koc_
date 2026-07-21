import React, { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { fetchKpis } from '../lib/api';
import { useI18n } from '../lib/language';

const chartTooltipStyle = {
  borderRadius: '8px',
  border: '1px solid #e2e8f0',
  boxShadow: '0 18px 40px -12px rgba(15, 23, 42, 0.24)',
  color: '#0f172a',
};

const chartTick = { fill: '#64748b', fontSize: 12 };

const Dashboard = ({ heroTitle }) => {
  const { t, language } = useI18n();
  const [kpis, setKpis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const formatNumber = (value) => Number(value || 0).toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US');

  useEffect(() => {
    const controller = new AbortController();

    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const loadedKpis = await fetchKpis(controller.signal);
        setKpis(loadedKpis);
      } catch (err) {
        if (err.name !== 'AbortError') {
          setError(err.message || t('dashboard.errorLoad') || 'Failed to load dashboard data');
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    load();

    return () => controller.abort();
  }, [t]);

  const topUsers = useMemo(() => {
    return [...(kpis?.users || [])]
      .sort((a, b) => Number(b.totalViews || 0) - Number(a.totalViews || 0))
      .slice(0, 5);
  }, [kpis]);

  const topProducts = useMemo(() => {
    return [...(kpis?.products || [])]
      .sort((a, b) => Number(b.totalViews || 0) - Number(a.totalViews || 0))
      .slice(0, 5);
  }, [kpis]);

  const chartData = (kpis?.users || [])
    .slice()
    .sort((a, b) => Number(b.totalViews || 0) - Number(a.totalViews || 0))
    .slice(0, 6)
      .map((user) => ({
        name: user.name,
        views: user.totalViews,
        videos: user.videoCount,
      }));

  const topUser = topUsers[0] || null;
  const totalViews = Number(kpis?.overview?.totalViews || 0);
  const totalVideos = Number(kpis?.overview?.totalVideos || 0);

  return (
    <div className="page dashboard-page">
      <section className="page__hero dashboard-hero">
        <div className="dashboard-hero__copy">
          <div className="dashboard-hero__eyebrow">{t('dashboard.eyebrow')}</div>
          <h1 className="page__title">{t('dashboard.heroTitle') || heroTitle}</h1>
        </div>

        <div className="dashboard-hero__summary">
          <div className={`dashboard-hero__ring${loading ? ' dashboard-hero__ring--loading' : ''}`} aria-live="polite">
            <div className="dashboard-hero__ring-value" title={loading ? undefined : formatNumber(totalViews)}>
              {loading ? '—' : formatNumber(totalViews)}
            </div>
            <div className="dashboard-hero__ring-label">{t('dashboard.totalViews')}</div>
          </div>
          <div className="dashboard-hero__mini-grid">
            <article className="stat-card stat-card--soft">
              <p className="stat-card__label">{t('dashboard.totalVideos')}</p>
              <p className="stat-card__value">{formatNumber(totalVideos)}</p>
            </article>
            <article className="stat-card stat-card--soft">
              <p className="stat-card__label">{t('dashboard.totalLikes')}</p>
              <p className="stat-card__value">{formatNumber(kpis?.overview?.totalLikes)}</p>
            </article>
            <article className="stat-card stat-card--soft">
              <p className="stat-card__label">{t('dashboard.totalShares')}</p>
              <p className="stat-card__value">{formatNumber(kpis?.overview?.totalShares)}</p>
            </article>
            <article className="stat-card stat-card--soft">
              <p className="stat-card__label">{t('dashboard.topUser')}</p>
              <p className="stat-card__value stat-card__value--small">{topUser?.name || '-'}</p>
            </article>
          </div>
        </div>
      </section>

      {error ? (
        <section className="section-card dashboard-alert">
          <div className="dashboard-alert__title">{t('dashboard.errorLoad') || 'Không tải được dashboard.'}</div>
          <div className="dashboard-alert__body">{error}</div>
        </section>
      ) : null}

      <section className="section-card dashboard-chart-card">
        <div className="section-card__header dashboard-section__header">
          <div>
            <h2 className="section-card__title">{t('dashboard.kpiByUser')}</h2>
          </div>
          <div className="chip-row">
            <span className="chip chip--blue">Users {formatNumber(topUsers.length)}</span>
            <span className="chip chip--positive">Products {formatNumber(topProducts.length)}</span>
          </div>
        </div>

        {loading ? (
          <div className="empty-state">
            <div className="loading-dot" />
            <div>{t('dashboard.loadingKpi')}</div>
          </div>
      ) : chartData.length ? (
          <div
            className="dashboard-chart"
            role="img"
            aria-label={`${t('dashboard.kpiByUser')}. ${chartData.map((item) => `${item.name}: ${formatNumber(item.views)}`).join('; ')}`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} barSize={36}>
                <CartesianGrid strokeDasharray="4 4" stroke="#e2e8f0" />
                <XAxis dataKey="name" tickLine={false} axisLine={false} tick={chartTick} />
                <YAxis tickLine={false} axisLine={false} allowDecimals={false} tick={chartTick} />
                <Tooltip
                  cursor={{ fill: 'rgba(0, 242, 234, 0.08)' }}
                  contentStyle={chartTooltipStyle}
                />
                <Bar dataKey="views" fill="var(--color-social-cyan-strong)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="empty-state">
            <div>{t('dashboard.noUserData')}</div>
          </div>
        )}
      </section>

      <section className="grid-two dashboard-rankings">
        <article className="section-card dashboard-ranking-card">
          <div className="section-card__header dashboard-section__header">
            <div>
              <h2 className="section-card__title">{t('dashboard.topUser')}</h2>
            </div>
          </div>
          <div className="dashboard-ranking-list">
            {topUsers.map((user, index) => (
              <div className="dashboard-ranking-item" key={user.id}>
                <div className="dashboard-ranking-item__rank">{index + 1}</div>
                <div className="dashboard-ranking-item__body">
                  <div className="metric-item__head">
                    <span>{user.name}</span>
                    <span>{formatNumber(user.totalViews)} {t('dashboard.viewsLabel')}</span>
                  </div>
                  <div className="dashboard-ranking-item__meta">
                    {user.videoCount} {t('dashboard.videoLabel')} · {t('dashboard.avgLabel')} {formatNumber(user.avgViewsPerVideo)} · {user.over10kRate}% {t('dashboard.over10kLabel')}
                  </div>
                </div>
              </div>
            ))}
            {!topUsers.length && <div className="empty-state empty-state--compact">{t('dashboard.noUserData')}</div>}
          </div>
        </article>

        <article className="section-card dashboard-ranking-card">
          <div className="section-card__header dashboard-section__header">
            <div>
              <h2 className="section-card__title">{t('dashboard.topProduct')}</h2>
            </div>
          </div>
          <div className="dashboard-ranking-list">
            {topProducts.map((product, index) => (
              <div className="dashboard-ranking-item" key={product.id}>
                <div className="dashboard-ranking-item__rank dashboard-ranking-item__rank--accent">{index + 1}</div>
                <div className="dashboard-ranking-item__body">
                  <div className="metric-item__head">
                    <span>{product.name}</span>
                    <span>{formatNumber(product.totalViews)} {t('dashboard.viewsLabel')}</span>
                  </div>
                  <div className="progress dashboard-ranking-item__progress">
                    <div
                      className="progress__bar progress__bar--teal"
                      style={{ width: `${Math.min(100, Math.max(product.avgViewsPerVideo / 500, 8))}%` }}
                    />
                  </div>
                  <div className="dashboard-ranking-item__meta">
                    {product.totalVideos} {t('dashboard.videoLabel')} · {t('dashboard.avgLabel')} {formatNumber(product.avgViewsPerVideo)}
                  </div>
                </div>
              </div>
            ))}
            {!topProducts.length ? <div className="empty-state empty-state--compact">{t('dashboard.noUserData')}</div> : null}
          </div>
        </article>
      </section>
    </div>
  );
};

export default Dashboard;
