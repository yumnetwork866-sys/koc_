import React, { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { fetchChannels, fetchVideos } from '../lib/api';
import { useI18n } from '../lib/language';

const chartTick = { fill: 'var(--color-muted)', fontSize: 12 };

const DashboardChartTooltip = ({ active, payload, formatNumber, t }) => {
  const video = payload?.[0]?.payload;
  if (!active || !video) return null;

  return (
    <div className="dashboard-chart-tooltip">
      <strong>{video.fullName}</strong>
      <div><span>{t('dashboard.views')}</span><b>{formatNumber(video.views)}</b></div>
      <div><span>{t('dashboard.totalLikes')}</span><b>{formatNumber(video.likes)}</b></div>
      <div><span>{t('dashboard.totalShares')}</span><b>{formatNumber(video.shares)}</b></div>
    </div>
  );
};

const Dashboard = ({ heroTitle }) => {
  const { t, language } = useI18n();
  const [videos, setVideos] = useState([]);
  const [channels, setChannels] = useState([]);
  const [selectedChannelId, setSelectedChannelId] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const formatNumber = (value) => Number(value || 0).toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US');

  useEffect(() => {
    const controller = new AbortController();

    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const [loadedVideos, loadedChannels] = await Promise.all([
          fetchVideos(controller.signal),
          fetchChannels(controller.signal),
        ]);
        setVideos(loadedVideos);
        setChannels(loadedChannels);
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

  const filteredVideos = useMemo(() => {
    if (selectedChannelId === 'all') return videos;
    return videos.filter((video) => String(video.channel_id) === selectedChannelId);
  }, [selectedChannelId, videos]);

  const totals = useMemo(() => filteredVideos.reduce((result, video) => ({
    views: result.views + Number(video.views || 0),
    likes: result.likes + Number(video.likes || 0),
    shares: result.shares + Number(video.shares || 0),
  }), { views: 0, likes: 0, shares: 0 }), [filteredVideos]);

  const chartData = useMemo(() => [...filteredVideos]
    .sort((a, b) => Number(b.views || 0) - Number(a.views || 0))
    .slice(0, 10)
    .map((video, index) => {
      const title = String(video.title || `${t('dashboard.video')} ${index + 1}`);
      return {
        name: title.length > 24 ? `${title.slice(0, 24)}…` : title,
        fullName: title,
        views: Number(video.views || 0),
        likes: Number(video.likes || 0),
        shares: Number(video.shares || 0),
      };
    }), [filteredVideos, t]);

  const averageChartViews = chartData.length
    ? chartData.reduce((sum, video) => sum + video.views, 0) / chartData.length
    : 0;

  return (
    <div className="page dashboard-page">
      <section className="page__hero dashboard-hero">
        <div className="dashboard-hero__copy">
          <div className="dashboard-hero__eyebrow">{t('dashboard.eyebrow')}</div>
          <h1 className="page__title">{t('dashboard.heroTitle') || heroTitle}</h1>
        </div>

        <div className="dashboard-hero__summary">
          <div className={`dashboard-hero__ring${loading ? ' dashboard-hero__ring--loading' : ''}`} aria-live="polite">
            <div className="dashboard-hero__ring-value" title={loading ? undefined : formatNumber(totals.views)}>
              {loading ? '—' : formatNumber(totals.views)}
            </div>
            <div className="dashboard-hero__ring-label">{t('dashboard.totalViews')}</div>
          </div>
          <div className="dashboard-hero__mini-grid">
            <article className="stat-card stat-card--soft">
              <p className="stat-card__label">{t('dashboard.totalVideos')}</p>
              <p className="stat-card__value">{formatNumber(filteredVideos.length)}</p>
            </article>
            <article className="stat-card stat-card--soft">
              <p className="stat-card__label">{t('dashboard.totalLikes')}</p>
              <p className="stat-card__value">{formatNumber(totals.likes)}</p>
            </article>
            <article className="stat-card stat-card--soft">
              <p className="stat-card__label">{t('dashboard.totalShares')}</p>
              <p className="stat-card__value">{formatNumber(totals.shares)}</p>
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
        <div className="section-card__header dashboard-chart-card__header">
          <div>
            <h2 className="section-card__title">{t('dashboard.videoPerformance')}</h2>
            <p className="section-card__meta">{t('dashboard.videoPerformanceMeta')}</p>
          </div>
          <div className="field dashboard-channel-filter">
            <label htmlFor="dashboard-channel">{t('dashboard.channel')}</label>
            <select
              id="dashboard-channel"
              value={selectedChannelId}
              onChange={(event) => setSelectedChannelId(event.target.value)}
            >
              <option value="all">{t('dashboard.allChannels')}</option>
              {channels.map((channel) => (
                <option key={channel.id} value={channel.id}>
                  {channel.display_name || channel.username || `${t('dashboard.channel')} #${channel.id}`}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="empty-state"><div className="loading-dot" />{t('dashboard.loading')}</div>
        ) : chartData.length ? (
          <div className="dashboard-chart-shell">
            <div className="dashboard-chart-summary" aria-hidden="true">
              <span><i className="dashboard-chart-summary__dot" />{t('dashboard.videosShown')} <strong>{chartData.length}</strong></span>
              <span>{t('dashboard.averageViews')} <strong>{formatNumber(Math.round(averageChartViews))}</strong></span>
            </div>
            <div className="dashboard-chart" role="img" aria-label={t('dashboard.videoPerformance')}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart layout="vertical" data={chartData} barSize={22} margin={{ top: 8, right: 72, bottom: 8, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 6" horizontal={false} stroke="var(--color-border)" />
                  <XAxis type="number" tickLine={false} axisLine={false} tick={chartTick} tickFormatter={(value) => Intl.NumberFormat(language === 'vi' ? 'vi-VN' : 'en-US', { notation: 'compact' }).format(value)} />
                  <YAxis type="category" dataKey="name" width={172} tickLine={false} axisLine={false} tick={chartTick} />
                  <Tooltip cursor={{ fill: 'var(--color-accent-soft)' }} content={<DashboardChartTooltip formatNumber={formatNumber} t={t} />} />
                  <Bar dataKey="views" fill="var(--color-primary)" radius={[0, 11, 11, 0]} background={{ fill: 'var(--color-surface-subtle)', radius: 11 }}>
                    <LabelList dataKey="views" position="right" formatter={(value) => Intl.NumberFormat(language === 'vi' ? 'vi-VN' : 'en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value)} className="dashboard-chart-label" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : (
          <div className="empty-state">{t('dashboard.noVideoData')}</div>
        )}
      </section>

    </div>
  );
};

export default Dashboard;
