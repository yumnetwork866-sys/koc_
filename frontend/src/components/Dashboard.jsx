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

const formatNumber = (value) => Number(value || 0).toLocaleString();

const Dashboard = ({ heroTitle, heroSubtitle }) => {
  const [kpis, setKpis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
          setError(err.message || 'Failed to load dashboard data');
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
        <h1 className="page__title">{heroTitle}</h1>
        <p className="page__subtitle">{heroSubtitle}</p>

        <div className="page__stats page__stats--four">
          <article className="stat-card">
            <p className="stat-card__label">Tổng video</p>
            <p className="stat-card__value">{formatNumber(kpis?.overview?.totalVideos)}</p>
          </article>
          <article className="stat-card">
            <p className="stat-card__label">Tổng view</p>
            <p className="stat-card__value">{formatNumber(kpis?.overview?.totalViews)}</p>
          </article>
          <article className="stat-card">
            <p className="stat-card__label">Tổng like</p>
            <p className="stat-card__value">{formatNumber(kpis?.overview?.totalLikes)}</p>
          </article>
          <article className="stat-card">
            <p className="stat-card__label">Tổng share</p>
            <p className="stat-card__value">{formatNumber(kpis?.overview?.totalShares)}</p>
          </article>
        </div>
      </section>

      {error ? (
        <section className="section-card empty-state">
          <div>Không tải được dashboard.</div>
          <div className="section-card__meta">{error}</div>
        </section>
      ) : null}

      <section className="section-card">
        <div className="section-card__header">
          <div>
            <h2 className="section-card__title">KPI theo user</h2>
            <p className="section-card__meta">Tổng video, view, like, comment, share và avg view/video.</p>
          </div>
        </div>

        {loading ? (
          <div className="empty-state">
            <div className="loading-dot" />
            <div>Đang tải KPI</div>
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
            <div>Chưa có dữ liệu user.</div>
          </div>
        )}
      </section>

      <section className="grid-two">
        <article className="section-card">
          <div className="section-card__header">
            <div>
              <h2 className="section-card__title">Top user</h2>
              <p className="section-card__meta">Xếp theo tổng view video đã được gắn.</p>
            </div>
          </div>
          <div className="metric-list">
            {topUsers.map((user) => (
              <div className="metric-item" key={user.id}>
                <div className="metric-item__head">
                  <span>{user.name}</span>
                  <span>{formatNumber(user.totalViews)} views</span>
                </div>
                <div className="row-subtitle">
                  {user.videoCount} video | Avg {formatNumber(user.avgViewsPerVideo)} | {user.over10kRate}% &gt;10k
                </div>
              </div>
            ))}
            {!topUsers.length && <div className="empty-state empty-state--compact">Chưa có dữ liệu user.</div>}
          </div>
        </article>

        <article className="section-card">
          <div className="section-card__header">
            <div>
              <h2 className="section-card__title">KPI theo sản phẩm</h2>
              <p className="section-card__meta">Sẹo, Rạn, Follicas, Lumilab, Mụn.</p>
            </div>
          </div>
          <div className="metric-list">
            {(kpis?.products || []).map((product) => (
              <div className="metric-item" key={product.id}>
                <div className="metric-item__head">
                  <span>{product.name}</span>
                  <span>{formatNumber(product.totalViews)} views</span>
                </div>
                <div className="progress">
                  <div
                    className="progress__bar progress__bar--teal"
                    style={{ width: `${Math.min(100, Math.max(product.avgViewsPerVideo / 500, 8))}%` }}
                  />
                </div>
                <div className="row-subtitle">
                  {product.totalVideos} video | Avg {formatNumber(product.avgViewsPerVideo)}
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
