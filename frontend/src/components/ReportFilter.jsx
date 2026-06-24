import React, { useEffect, useMemo, useState } from 'react';
import { fetchReports, fetchTeams, fetchUsers } from '../lib/api';

const ReportFilter = ({ heroTitle, heroSubtitle }) => {
  const [filter, setFilter] = useState({
    team: '',
    startDate: '',
    endDate: '',
  });
  const [reports, setReports] = useState([]);
  const [users, setUsers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [appliedFilter, setAppliedFilter] = useState(filter);

  useEffect(() => {
    const controller = new AbortController();

    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const [loadedReports, loadedUsers, loadedTeams] = await Promise.all([
          fetchReports(controller.signal),
          fetchUsers(controller.signal),
          fetchTeams(controller.signal),
        ]);

        setReports(loadedReports);
        setUsers(loadedUsers);
        setTeams(loadedTeams);
      } catch (err) {
        if (err.name !== 'AbortError') {
          setError(err.message || 'Failed to load reports');
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

  const teamNames = useMemo(() => {
    return new Map(teams.map((team) => [team.id, team.name]));
  }, [teams]);

  const teamOptions = useMemo(() => {
    return teams.length ? teams : [];
  }, [teams]);

  const filteredReports = useMemo(() => {
    return reports.filter((report) => {
      const reportUser = users.find((user) => user.id === report.user_id);
      const reportTeamName = reportUser ? teamNames.get(reportUser.team_id) || '' : '';
      const reportDate = report.report_date ? new Date(report.report_date) : null;

      if (appliedFilter.team && reportTeamName !== appliedFilter.team) {
        return false;
      }

      if (appliedFilter.startDate && reportDate && reportDate < new Date(appliedFilter.startDate)) {
        return false;
      }

      if (appliedFilter.endDate && reportDate) {
        const end = new Date(appliedFilter.endDate);
        end.setHours(23, 59, 59, 999);
        if (reportDate > end) {
          return false;
        }
      }

      return true;
    });
  }, [reports, users, teamNames, appliedFilter]);

  const totals = useMemo(() => {
    return filteredReports.reduce(
      (acc, report) => {
        acc.totalVideos += Number(report.total_videos || 0);
        acc.totalViews += Number(report.total_views || 0);
        acc.totalRevenue += Number(report.total_revenue || 0);
        return acc;
      },
      {
        totalVideos: 0,
        totalViews: 0,
        totalRevenue: 0,
      },
    );
  }, [filteredReports]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFilter((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setAppliedFilter(filter);
  };

  return (
    <div className="page">
      <section className="page__hero">
        <span className="page__eyebrow">Reports</span>
        <h1 className="page__title">{heroTitle}</h1>
        <p className="page__subtitle">{heroSubtitle}</p>
      </section>

      {error ? (
        <section className="section-card empty-state">
          <div>Không tải được báo cáo.</div>
          <div className="section-card__meta">{error}</div>
        </section>
      ) : null}

      <section className="section-card">
        <div className="section-card__header">
          <div>
            <h2 className="section-card__title">Filter reports</h2>
            <p className="section-card__meta">Lọc dữ liệu thực từ `/api/reports` theo team và ngày.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="filter-panel">
          <div className="field">
            <label htmlFor="team">Team</label>
            <select id="team" name="team" value={filter.team} onChange={handleInputChange}>
              <option value="">All teams</option>
              {teamOptions.map((team) => (
                <option key={team.id} value={team.name}>
                  {team.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="startDate">Start date</label>
            <input
              id="startDate"
              type="date"
              name="startDate"
              value={filter.startDate}
              onChange={handleInputChange}
            />
          </div>

          <div className="field">
            <label htmlFor="endDate">End date</label>
            <input
              id="endDate"
              type="date"
              name="endDate"
              value={filter.endDate}
              onChange={handleInputChange}
            />
          </div>

          <div className="actions" style={{ gridColumn: '1 / -1' }}>
            <button type="submit" className="button">
              Apply filters
            </button>
          </div>
        </form>
      </section>

      <section className="page__stats">
        <article className="stat-card">
          <p className="stat-card__label">Filtered reports</p>
          <p className="stat-card__value">{filteredReports.length}</p>
        </article>
        <article className="stat-card">
          <p className="stat-card__label">Total views</p>
          <p className="stat-card__value">{totals.totalViews.toLocaleString()}</p>
        </article>
        <article className="stat-card">
          <p className="stat-card__label">Total revenue</p>
          <p className="stat-card__value">{totals.totalRevenue.toFixed(2)}</p>
        </article>
      </section>

      <section className="section-card">
        <div className="section-card__header">
          <div>
            <h2 className="section-card__title">Detailed report</h2>
            <p className="section-card__meta">Danh sách báo cáo đã áp dụng bộ lọc hiện tại.</p>
          </div>
        </div>

        {loading ? (
          <div className="empty-state">
            <div className="loading-dot" />
            <div>Đang tải báo cáo</div>
          </div>
        ) : filteredReports.length ? (
          <div className="metric-list">
            {filteredReports.map((report) => {
              const reportUser = users.find((user) => user.id === report.user_id);
              const reportTeamName = reportUser ? teamNames.get(reportUser.team_id) || 'Unassigned' : 'Unknown';

              return (
                <article className="metric-item" key={report.id}>
                  <div className="metric-item__head">
                    <span>
                      {reportUser ? reportUser.name : `User ${report.user_id}`} - {reportTeamName}
                    </span>
                    <span className="chip chip--blue">
                      {new Date(report.report_date).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="row-subtitle">
                    Videos: {report.total_videos} | Views: {report.total_views} | Revenue:{' '}
                    {Number(report.total_revenue || 0).toFixed(2)}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="empty-state">
            <div>Không có báo cáo phù hợp với bộ lọc hiện tại.</div>
            <div className="section-card__meta">
              {reports.length ? 'Đã tải dữ liệu, nhưng không có kết quả khớp.' : 'Chưa có dữ liệu báo cáo trong hệ thống.'}
            </div>
          </div>
        )}
      </section>
    </div>
  );
};

export default ReportFilter;
