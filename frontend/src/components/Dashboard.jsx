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
import { fetchReports, fetchTeams, fetchUsers, fetchVideos } from '../lib/api';

const Dashboard = ({ heroTitle, heroSubtitle }) => {
  const [data, setData] = useState({
    users: [],
    teams: [],
    videos: [],
    reports: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();

    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const [users, teams, videos, reports] = await Promise.all([
          fetchUsers(controller.signal),
          fetchTeams(controller.signal),
          fetchVideos(controller.signal),
          fetchReports(controller.signal),
        ]);

        setData({
          users,
          teams,
          videos,
          reports,
        });
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

  const teamStats = useMemo(() => {
    const teamById = new Map(data.teams.map((team) => [team.id, team.name]));
    const stats = data.teams.map((team) => ({
      id: team.id,
      name: team.name,
      memberCount: data.users.filter((user) => user.team_id === team.id).length,
      videoCount: data.videos.filter((video) => video.team_id === team.id).length,
    }));

    if (!stats.length && data.videos.length) {
      const fallbackStats = new Map();
      data.videos.forEach((video) => {
        const name = teamById.get(video.team_id) || `Team ${video.team_id}`;
        const current = fallbackStats.get(name) || { name, memberCount: 0, videoCount: 0 };
        current.videoCount += 1;
        fallbackStats.set(name, current);
      });
      return Array.from(fallbackStats.values());
    }

    return stats;
  }, [data.teams, data.users, data.videos]);

  const reportSummary = useMemo(() => {
    if (!data.reports.length) {
      return null;
    }

    return [...data.reports].sort(
      (a, b) => new Date(b.report_date).getTime() - new Date(a.report_date).getTime(),
    )[0];
  }, [data.reports]);

  const chartData = teamStats.map((team) => ({
    name: team.name,
    videos: team.videoCount,
  }));

  const totalRevenue = data.reports.reduce(
    (sum, report) => sum + Number(report.total_revenue || 0),
    0,
  );

  const averageVideosPerTeam = teamStats.length
    ? Math.round(data.videos.length / teamStats.length)
    : 0;

  return (
    <div className="page">
      <section className="page__hero">
        <span className="page__eyebrow">Dashboard</span>
        <h1 className="page__title">{heroTitle}</h1>
        <p className="page__subtitle">{heroSubtitle}</p>

        <div className="page__stats">
          <article className="stat-card">
            <p className="stat-card__label">Total employees</p>
            <p className="stat-card__value">{data.users.length}</p>
          </article>
          <article className="stat-card">
            <p className="stat-card__label">Total videos</p>
            <p className="stat-card__value">{data.videos.length}</p>
          </article>
          <article className="stat-card">
            <p className="stat-card__label">Total reports</p>
            <p className="stat-card__value">{data.reports.length}</p>
          </article>
        </div>
      </section>

      {error ? (
        <section className="section-card empty-state">
          <div>Không tải được dữ liệu dashboard.</div>
          <div className="section-card__meta">{error}</div>
        </section>
      ) : null}

      <section className="section-card">
        <div className="section-card__header">
          <div>
            <h2 className="section-card__title">Team output</h2>
            <p className="section-card__meta">Biểu đồ lấy trực tiếp từ dữ liệu videos theo team.</p>
          </div>
          <div className="chip-row">
            <span className="chip chip--blue">Teams: {teamStats.length}</span>
            <span className="chip chip--positive">Avg videos/team: {averageVideosPerTeam}</span>
            <span className="chip chip--amber">Revenue: {totalRevenue.toFixed(2)}</span>
          </div>
        </div>

        {loading ? (
          <div className="empty-state">
            <div className="loading-dot" />
            <div>Đang tải dữ liệu dashboard</div>
          </div>
        ) : chartData.length ? (
          <div style={{ height: '320px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} barSize={38}>
                <CartesianGrid strokeDasharray="4 4" stroke="rgba(148,163,184,0.25)" />
                <XAxis dataKey="name" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip
                  cursor={{ fill: 'rgba(37, 99, 235, 0.06)' }}
                  contentStyle={{
                    borderRadius: '14px',
                    border: '1px solid rgba(15, 23, 42, 0.08)',
                    boxShadow: '0 18px 40px rgba(15, 23, 42, 0.12)',
                  }}
                />
                <Bar dataKey="videos" fill="url(#performanceGradient)" radius={[14, 14, 8, 8]} />
                <defs>
                  <linearGradient id="performanceGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563eb" />
                    <stop offset="100%" stopColor="#22c55e" />
                  </linearGradient>
                </defs>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="empty-state">
            <div>Chưa có dữ liệu video để vẽ biểu đồ.</div>
          </div>
        )}
      </section>

      <section className="section-card">
        <div className="section-card__header">
          <div>
            <h2 className="section-card__title">Recent activity</h2>
            <p className="section-card__meta">Hiển thị từ videos và reports thực tế.</p>
          </div>
        </div>

        {data.videos.length || data.reports.length ? (
          <div className="metric-list">
            {data.videos.slice(0, 3).map((video) => (
              <div className="metric-item" key={`video-${video.id}`}>
                <div className="metric-item__head">
                  <span>{video.title}</span>
                  <span className="chip chip--blue">Video #{video.id}</span>
                </div>
              </div>
            ))}
            {reportSummary ? (
              <div className="metric-item">
                <div className="metric-item__head">
                  <span>Latest report</span>
                  <span className="chip chip--positive">
                    {new Date(reportSummary.report_date).toLocaleDateString()}
                  </span>
                </div>
                <div className="row-subtitle">
                  Videos: {reportSummary.total_videos} | Views: {reportSummary.total_views} | Revenue:{' '}
                  {Number(reportSummary.total_revenue || 0).toFixed(2)}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="empty-state">
            <div>Chưa có hoạt động gần đây.</div>
          </div>
        )}
      </section>

      <section className="section-card">
        <div className="section-card__header">
          <div>
            <h2 className="section-card__title">Team statistics</h2>
            <p className="section-card__meta">Số lượng members và videos theo team.</p>
          </div>
        </div>

        {teamStats.length ? (
          <div className="metric-list">
            {teamStats.map((team) => (
              <div className="metric-item" key={team.id || team.name}>
                <div className="metric-item__head">
                  <span>{team.name}</span>
                  <span>
                    {team.memberCount} members | {team.videoCount} videos
                  </span>
                </div>
                <div className="progress">
                  <div
                    className="progress__bar"
                    style={{
                      width: `${Math.min(100, Math.max(team.videoCount * 20, 12))}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <div>Chưa có team nào trong hệ thống.</div>
          </div>
        )}
      </section>
    </div>
  );
};

export default Dashboard;
