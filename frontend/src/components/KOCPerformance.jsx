import React, { useEffect, useMemo, useState } from 'react';
import { fetchKpis } from '../lib/api';

const sortOptions = [
  { value: 'totalViews_desc', label: 'Total views' },
  { value: 'videoCount_desc', label: 'Video count' },
  { value: 'avgViewsPerVideo_desc', label: 'Avg views/video' },
  { value: 'over10kRate_desc', label: '>10k rate' },
];

const formatNumber = (value) => Number(value || 0).toLocaleString();

const KOCPerformance = ({ heroTitle, heroSubtitle }) => {
  const [kpis, setKpis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('totalViews_desc');

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
          setError(err.message || 'Failed to load KOC performance data');
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

  const kocRows = useMemo(() => {
    return [...(kpis?.users || [])].filter((user) => user.role === 'koc');
  }, [kpis]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return kocRows;

    return kocRows.filter((user) => {
      return [user.name, user.email]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [kocRows, search]);

  const sortedRows = useMemo(() => {
    const list = [...filteredRows];
    const sorters = {
      totalViews_desc: (a, b) => Number(b.totalViews || 0) - Number(a.totalViews || 0) || Number(b.videoCount || 0) - Number(a.videoCount || 0) || String(a.name).localeCompare(String(b.name)),
      videoCount_desc: (a, b) => Number(b.videoCount || 0) - Number(a.videoCount || 0) || Number(b.totalViews || 0) - Number(a.totalViews || 0) || String(a.name).localeCompare(String(b.name)),
      avgViewsPerVideo_desc: (a, b) => Number(b.avgViewsPerVideo || 0) - Number(a.avgViewsPerVideo || 0) || Number(b.totalViews || 0) - Number(a.totalViews || 0) || String(a.name).localeCompare(String(b.name)),
      over10kRate_desc: (a, b) => Number(b.over10kRate || 0) - Number(a.over10kRate || 0) || Number(b.totalViews || 0) - Number(a.totalViews || 0) || String(a.name).localeCompare(String(b.name)),
    };

    return list.sort(sorters[sortBy] || sorters.totalViews_desc);
  }, [filteredRows, sortBy]);

  const summary = useMemo(() => {
    const totalVideos = sortedRows.reduce((sum, row) => sum + Number(row.videoCount || 0), 0);
    const totalViews = sortedRows.reduce((sum, row) => sum + Number(row.totalViews || 0), 0);
    const totalUsers = sortedRows.length;
    const avgViewsPerVideo = totalVideos ? Math.round(totalViews / totalVideos) : 0;
    const topKoc = sortedRows[0] || null;

    return {
      totalUsers,
      totalVideos,
      totalViews,
      avgViewsPerVideo,
      topKoc,
    };
  }, [sortedRows]);

  const maxViews = useMemo(() => {
    return Math.max(1, ...sortedRows.map((row) => Number(row.totalViews || 0)));
  }, [sortedRows]);

  const clearFilters = () => {
    setSearch('');
    setSortBy('totalViews_desc');
  };

  return (
    <div className="page">
      <section className="page__hero">
        <h1 className="page__title">{heroTitle}</h1>
        <p className="page__subtitle">{heroSubtitle}</p>
        <div className="page__stats page__stats--four">
          <article className="stat-card">
            <p className="stat-card__label">KOC</p>
            <p className="stat-card__value">{formatNumber(summary.totalUsers)}</p>
          </article>
          <article className="stat-card">
            <p className="stat-card__label">Videos</p>
            <p className="stat-card__value">{formatNumber(summary.totalVideos)}</p>
          </article>
          <article className="stat-card">
            <p className="stat-card__label">Total views</p>
            <p className="stat-card__value">{formatNumber(summary.totalViews)}</p>
          </article>
          <article className="stat-card">
            <p className="stat-card__label">Avg views/video</p>
            <p className="stat-card__value">{formatNumber(summary.avgViewsPerVideo)}</p>
          </article>
        </div>
      </section>

      {error ? (
        <section className="section-card empty-state empty-state--compact">
          <div>{error}</div>
        </section>
      ) : null}

      <section className="section-card">
        <div className="section-card__header">
          <div>
            <h2 className="section-card__title">Filter and sort</h2>
            <p className="section-card__meta">Search by name or email, then sort by views, video count, average, or hit rate.</p>
          </div>
          <div className="chip-row">
            <span className="chip chip--blue">Visible: {formatNumber(sortedRows.length)}</span>
            <span className="chip chip--positive">All KOC: {formatNumber(kocRows.length)}</span>
          </div>
        </div>

        <form className="filter-panel filter-panel--compact" onSubmit={(event) => event.preventDefault()}>
          <div className="field field--full">
            <label htmlFor="koc-search">Search</label>
            <input
              id="koc-search"
              type="search"
              placeholder="Search KOC by name or email"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="koc-sort">Sort by</label>
            <select id="koc-sort" value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="actions">
            <button className="button button--ghost" type="button" onClick={clearFilters}>
              Clear
            </button>
          </div>
        </form>
      </section>

      <section className="grid-two">
        <article className="section-card">
          <div className="section-card__header section-card__header--compact">
            <div>
              <h2 className="section-card__title">Top KOC</h2>
              <p className="section-card__meta">Xếp hạng theo hiệu quả hiện tại.</p>
            </div>
          </div>

          {loading ? (
            <div className="empty-state">
              <div className="loading-dot" />
              <div>Đang tải KOC performance</div>
            </div>
          ) : sortedRows.length ? (
            <div className="metric-list">
              {sortedRows.slice(0, 5).map((user, index) => {
                const progress = Math.max(8, Math.min(100, (Number(user.totalViews || 0) / maxViews) * 100));

                return (
                  <article className="metric-item" key={user.id}>
                    <div className="metric-item__head">
                      <span>
                        {index + 1}. {user.name}
                      </span>
                      <span>{formatNumber(user.totalViews)} views</span>
                    </div>
                    <div className="progress">
                      <div className="progress__bar progress__bar--teal" style={{ width: `${progress}%` }} />
                    </div>
                    <div className="row-subtitle">
                      {user.videoCount} video | Avg {formatNumber(user.avgViewsPerVideo)} | {user.over10kRate}% &gt;10k
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="empty-state empty-state--compact">Chưa có KOC phù hợp bộ lọc.</div>
          )}
        </article>

        <article className="section-card">
          <div className="section-card__header section-card__header--compact">
            <div>
              <h2 className="section-card__title">Top video</h2>
              <p className="section-card__meta">Video có view cao nhất của từng KOC.</p>
            </div>
          </div>

          {sortedRows.length ? (
            <div className="metric-list">
              {sortedRows.slice(0, 5).map((user) => (
                <article className="metric-item" key={user.id}>
                  <div className="metric-item__head">
                    <span>{user.name}</span>
                    <span>{user.topVideo ? formatNumber(user.topVideo.views) : 0} views</span>
                  </div>
                  <div className="row-subtitle">
                    {user.topVideo?.title || 'Chưa có video'}{user.topVideo ? '' : ' | No data'}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state empty-state--compact">Chưa có video để so sánh.</div>
          )}
        </article>
      </section>

      <section className="section-card">
        <div className="section-card__header">
          <div>
            <h2 className="section-card__title">KOC performance table</h2>
            <p className="section-card__meta">So sánh từng KOC theo video count, total views, avg views/video và top video.</p>
          </div>
        </div>

        {loading ? (
          <div className="empty-state">
            <div className="loading-dot" />
            <div>Đang tải bảng hiệu quả KOC</div>
          </div>
        ) : sortedRows.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>KOC</th>
                  <th>Email</th>
                  <th>Videos</th>
                  <th>Total views</th>
                  <th>Avg views/video</th>
                  <th>&gt;10k rate</th>
                  <th>Top video</th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((user, index) => (
                  <tr key={user.id}>
                    <td>
                      <span className="row-title">
                        {index + 1}. {user.name}
                      </span>
                    </td>
                    <td>{user.email}</td>
                    <td>{formatNumber(user.videoCount)}</td>
                    <td>{formatNumber(user.totalViews)}</td>
                    <td>{formatNumber(user.avgViewsPerVideo)}</td>
                    <td>{user.over10kRate}%</td>
                    <td>
                      <span className="row-title">{user.topVideo?.title || 'Chưa có video'}</span>
                      <span className="row-subtitle">
                        {user.topVideo ? `${formatNumber(user.topVideo.views)} views` : 'No data'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state empty-state--compact">Không tìm thấy KOC nào khớp bộ lọc.</div>
        )}
      </section>

      {summary.topKoc ? (
        <section className="section-card">
          <div className="section-card__header section-card__header--compact">
            <div>
              <h2 className="section-card__title">Spotlight</h2>
              <p className="section-card__meta">KOC đang dẫn đầu theo bộ lọc hiện tại.</p>
            </div>
          </div>
          <div className="metric-item">
            <div className="metric-item__head">
              <span>{summary.topKoc.name}</span>
              <span>{formatNumber(summary.topKoc.totalViews)} views</span>
            </div>
            <div className="row-subtitle">
              {summary.topKoc.videoCount} video | Avg {formatNumber(summary.topKoc.avgViewsPerVideo)} | {summary.topKoc.over10kRate}% &gt;10k | Top video: {summary.topKoc.topVideo?.title || 'Chưa có'}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
};

export default KOCPerformance;
