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

const DashboardChartTooltip = ({ active, payload, formatNumber, metric, t }) => {
  const item = payload?.[0]?.payload;
  if (!active || !item) return null;

  return (
    <div className="dashboard-chart-tooltip">
      <strong>{item.fullName}</strong>
      {metric === 'date' ? <div><span>{t('dashboard.totalVideos')}</span><b>{formatNumber(item.videoCount)}</b></div> : null}
      <div><span>{t('dashboard.views')}</span><b>{formatNumber(item.views)}</b></div>
      <div><span>{t('dashboard.totalLikes')}</span><b>{formatNumber(item.likes)}</b></div>
      <div><span>{t('dashboard.totalShares')}</span><b>{formatNumber(item.shares)}</b></div>
    </div>
  );
};

const Dashboard = ({ heroTitle }) => {
  const { t, language } = useI18n();
  const [videos, setVideos] = useState([]);
  const [channels, setChannels] = useState([]);
  const [selectedChannelId, setSelectedChannelId] = useState('all');
  const [chartMetric, setChartMetric] = useState('views');
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

  const chartData = useMemo(() => {
    if (chartMetric === 'date') {
      const byDate = new Map();
      filteredVideos.forEach((video) => {
        const date = String(video.published_at || '').slice(0, 10);
        if (!date) return;
        const current = byDate.get(date) || { date, videoCount: 0, views: 0, likes: 0, shares: 0 };
        current.videoCount += 1;
        current.views += Number(video.views || 0);
        current.likes += Number(video.likes || 0);
        current.shares += Number(video.shares || 0);
        byDate.set(date, current);
      });

      return [...byDate.values()]
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 10)
        .map((item) => {
          const dateLabel = new Date(`${item.date}T00:00:00`).toLocaleDateString(language === 'vi' ? 'vi-VN' : 'en-US');
          return { ...item, name: dateLabel, fullName: dateLabel, value: item.videoCount };
        });
    }

    return [...filteredVideos]
      .sort((a, b) => Number(b[chartMetric] || 0) - Number(a[chartMetric] || 0))
      .slice(0, 10)
      .map((video, index) => {
        const title = String(video.title || `${t('dashboard.video')} ${index + 1}`);
        return {
          name: title.length > 14 ? `${title.slice(0, 14)}…` : title,
          fullName: title,
          value: Number(video[chartMetric] || 0),
          views: Number(video.views || 0),
          likes: Number(video.likes || 0),
          shares: Number(video.shares || 0),
        };
      });
  }, [chartMetric, filteredVideos, language, t]);

  const averageChartValue = chartData.length
    ? chartData.reduce((sum, item) => sum + item.value, 0) / chartData.length
    : 0;

  const metricLabel = chartMetric === 'date' ? t('dashboard.videosPerDay') : t(`dashboard.metric_${chartMetric}`);

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
          <div className="dashboard-chart-filters">
            <div className="field dashboard-channel-filter">
              <label htmlFor="dashboard-channel">{t('dashboard.channel')}</label>
              <select id="dashboard-channel" value={selectedChannelId} onChange={(event) => setSelectedChannelId(event.target.value)}>
                <option value="all">{t('dashboard.allChannels')}</option>
                {channels.map((channel) => (
                  <option key={channel.id} value={channel.id}>
                    {channel.display_name || channel.username || `${t('dashboard.channel')} #${channel.id}`}
                  </option>
                ))}
              </select>
            </div>
            <div className="field dashboard-metric-filter">
              <label htmlFor="dashboard-metric">{t('dashboard.metric')}</label>
              <select id="dashboard-metric" value={chartMetric} onChange={(event) => setChartMetric(event.target.value)}>
                {['views', 'date', 'likes', 'shares'].map((metric) => (
                  <option key={metric} value={metric}>{t(`dashboard.metric_${metric}`)}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="empty-state"><div className="loading-dot" />{t('dashboard.loading')}</div>
        ) : chartData.length ? (
          <div className="dashboard-chart-shell">
            <div className="dashboard-chart-summary" aria-hidden="true">
              <span><i className="dashboard-chart-summary__dot" />{t('dashboard.resultsShown')} <strong>{chartData.length}</strong></span>
              <span>{t('dashboard.averageMetric', { metric: metricLabel })} <strong>{formatNumber(Math.round(averageChartValue))}</strong></span>
            </div>
            <div className="dashboard-chart" role="img" aria-label={t('dashboard.videoPerformance')}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} barSize={26} margin={{ top: 26, right: 12, bottom: 4, left: 4 }}>
                  <CartesianGrid strokeDasharray="3 6" vertical={false} stroke="var(--color-border)" />
                  <XAxis dataKey="name" height={40} interval="preserveStartEnd" minTickGap={24} tickLine={false} axisLine={false} tick={chartTick} />
                  <YAxis width={58} tickLine={false} axisLine={false} allowDecimals={false} tick={chartTick} tickFormatter={(value) => Intl.NumberFormat(language === 'vi' ? 'vi-VN' : 'en-US', { notation: 'compact' }).format(value)} />
                  <Tooltip cursor={{ fill: 'var(--color-accent-soft)' }} content={<DashboardChartTooltip formatNumber={formatNumber} metric={chartMetric} t={t} />} />
                  <Bar dataKey="value" fill="var(--color-primary)" radius={[6, 6, 0, 0]}>
                    <LabelList dataKey="value" position="top" formatter={(value) => Intl.NumberFormat(language === 'vi' ? 'vi-VN' : 'en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value)} className="dashboard-chart-label" />
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
