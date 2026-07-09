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

const Dashboard = ({ heroTitle, heroSubtitle }) => {
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
  }, []);

  const topUsers = useMemo(() => {
    return [...(kpis?.users || [])]
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

  return (
    <div className="page">
      <section className="page__hero">
        <h1 className="page__title">{t('dashboard.heroTitle') || heroTitle}</h1>

        <div className="page__stats page__stats--four">
          <article className="stat-card">
            <p className="stat-card__label">{t('dashboard.totalVideos')}</p>
            <p className="stat-card__value">{formatNumber(kpis?.overview?.totalVideos)}</p>
          </article>
          <article className="stat-card">
            <p className="stat-card__label">{t('dashboard.totalViews')}</p>
            <p className="stat-card__value">{formatNumber(kpis?.overview?.totalViews)}</p>
          </article>
          <article className="stat-card">
            <p className="stat-card__label">{t('dashboard.totalLikes')}</p>
            <p className="stat-card__value">{formatNumber(kpis?.overview?.totalLikes)}</p>
          </article>
          <article className="stat-card">
            <p className="stat-card__label">{t('dashboard.totalShares')}</p>
            <p className="stat-card__value">{formatNumber(kpis?.overview?.totalShares)}</p>
          </article>
        </div>
      </section>

      {error ? (
        <section className="section-card empty-state">
          <div>{t('dashboard.errorLoad') || 'Không tải được dashboard.'}</div>
        </section>
      ) : null}

      <section className="section-card">
        <div className="section-card__header">
          <div>
            <h2 className="section-card__title">{t('dashboard.kpiByUser')}</h2>
          </div>
        </div>

        {loading ? (
          <div className="empty-state">
            <div className="loading-dot" />
            <div>{t('dashboard.loadingKpi')}</div>
          </div>
        ) : chartData.length ? (
          <div style={{ height: '320px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} barSize={36}>
                <CartesianGrid strokeDasharray="4 4" stroke="rgba(148,163,184,0.25)" />
                <XAxis dataKey="name" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip
                  cursor={{ fill: 'rgba(20, 184, 166, 0.08)' }}
                  contentStyle={{
                    borderRadius: '8px',
                    border: '1px solid rgba(15, 23, 42, 0.08)',
                    boxShadow: '0 18px 40px rgba(15, 23, 42, 0.12)',
                  }}
                />
                <Bar dataKey="views" fill="#14b8a6" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="empty-state">
            <div>{t('dashboard.noUserData')}</div>
          </div>
        )}
      </section>

      <section className="grid-two">
        <article className="section-card">
          <div className="section-card__header">
            <div>
              <h2 className="section-card__title">{t('dashboard.topUser')}</h2>
            </div>
          </div>
          <div className="metric-list">
            {topUsers.map((user) => (
              <div className="metric-item" key={user.id}>
                <div className="metric-item__head">
                  <span>{user.name}</span>
                  <span>{formatNumber(user.totalViews)} {t('dashboard.viewsLabel')}</span>
                </div>
                <div className="row-subtitle">
                  {user.videoCount} {t('dashboard.videoLabel')} | {t('dashboard.avgLabel')} {formatNumber(user.avgViewsPerVideo)} | {user.over10kRate}% {t('dashboard.over10kLabel')}
                </div>
              </div>
            ))}
            {!topUsers.length && <div className="empty-state empty-state--compact">{t('dashboard.noUserData')}</div>}
          </div>
        </article>

        <article className="section-card">
          <div className="section-card__header">
            <div>
              <h2 className="section-card__title">{t('dashboard.topProduct')}</h2>
            </div>
          </div>
          <div className="metric-list">
            {(kpis?.products || []).map((product) => (
              <div className="metric-item" key={product.id}>
                <div className="metric-item__head">
                  <span>{product.name}</span>
                  <span>{formatNumber(product.totalViews)} {t('dashboard.viewsLabel')}</span>
                </div>
                <div className="progress">
                  <div
                    className="progress__bar progress__bar--teal"
                    style={{ width: `${Math.min(100, Math.max(product.avgViewsPerVideo / 500, 8))}%` }}
                  />
                </div>
                <div className="row-subtitle">
                  {product.totalVideos} {t('dashboard.videoLabel')} | {t('dashboard.avgLabel')} {formatNumber(product.avgViewsPerVideo)}
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
};

export default Dashboard;
