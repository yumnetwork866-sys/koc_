import React, { useEffect, useMemo, useState } from 'react';
import { fetchKpis } from '../lib/api';
import { useI18n } from '../lib/language';

const KOCPerformance = ({ heroTitle, heroSubtitle }) => {
  const { t, language } = useI18n();
  const [kpis, setKpis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('totalViews_desc');

  const formatNumber = (value) => Number(value || 0).toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US');

  const sortOptions = [
    { value: 'totalViews_desc', label: t('koc.sortTotalViews') },
    { value: 'videoCount_desc', label: t('koc.sortVideoCount') },
    { value: 'avgViewsPerVideo_desc', label: t('koc.sortAvgViewsPerVideo') },
    { value: 'over10kRate_desc', label: t('koc.sortOver10kRate') },
  ];

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
          setError(err.message || t('koc.errorLoad'));
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
        <h1 className="page__title">{t('koc.heroTitle') || heroTitle}</h1>
        <div className="page__stats page__stats--four">
          <article className="stat-card">
            <p className="stat-card__label">{t('koc.koc')}</p>
            <p className="stat-card__value">{formatNumber(summary.totalUsers)}</p>
          </article>
          <article className="stat-card">
            <p className="stat-card__label">{t('koc.videos')}</p>
            <p className="stat-card__value">{formatNumber(summary.totalVideos)}</p>
          </article>
          <article className="stat-card">
            <p className="stat-card__label">{t('koc.totalViews')}</p>
            <p className="stat-card__value">{formatNumber(summary.totalViews)}</p>
          </article>
          <article className="stat-card">
            <p className="stat-card__label">{t('koc.avgViewsPerVideo')}</p>
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
            <h2 className="section-card__title">{t('koc.filterSort')}</h2>
          </div>
          <div className="chip-row">
            <span className="chip chip--blue">{t('koc.visible')}: {formatNumber(sortedRows.length)}</span>
            <span className="chip chip--positive">{t('koc.allKoc')}: {formatNumber(kocRows.length)}</span>
          </div>
        </div>

        <form className="filter-panel filter-panel--compact" onSubmit={(event) => event.preventDefault()}>
          <div className="field field--full">
            <label htmlFor="koc-search">{t('common.search')}</label>
            <input
              id="koc-search"
              type="search"
              placeholder={t('koc.searchPlaceholder')}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="koc-sort">{t('common.sortBy')}</label>
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
              {t('koc.clear')}
            </button>
          </div>
        </form>
      </section>

      <section className="grid-two">
        <article className="section-card">
          <div className="section-card__header section-card__header--compact">
            <div>
              <h2 className="section-card__title">{t('koc.topKoc')}</h2>
            </div>
          </div>

          {loading ? (
            <div className="empty-state">
              <div className="loading-dot" />
              <div>{t('koc.loading')}</div>
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
                      <span>{formatNumber(user.totalViews)} {t('koc.totalViews')}</span>
                    </div>
                    <div className="progress">
                      <div className="progress__bar progress__bar--teal" style={{ width: `${progress}%` }} />
                    </div>
                    <div className="row-subtitle">
                      {user.videoCount} {t('koc.videos')} | {t('koc.avg') || 'Avg'} {formatNumber(user.avgViewsPerVideo)} | {user.over10kRate}% {t('koc.over10kRate')}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="empty-state empty-state--compact">{t('koc.noMatch')}</div>
          )}
        </article>

        <article className="section-card">
          <div className="section-card__header section-card__header--compact">
            <div>
              <h2 className="section-card__title">{t('koc.topVideo')}</h2>
            </div>
          </div>

          {sortedRows.length ? (
            <div className="metric-list">
              {sortedRows.slice(0, 5).map((user) => (
                <article className="metric-item" key={user.id}>
                  <div className="metric-item__head">
                    <span>{user.name}</span>
                    <span>{user.topVideo ? formatNumber(user.topVideo.views) : 0} {t('koc.totalViews')}</span>
                  </div>
                  <div className="row-subtitle">
                    {user.topVideo?.title || t('koc.noVideo')}{user.topVideo ? '' : ` | ${t('common.noData')}`}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state empty-state--compact">{t('koc.noVideoData')}</div>
          )}
        </article>
      </section>

      <section className="section-card">
        <div className="section-card__header">
          <div>
            <h2 className="section-card__title">{t('koc.tableTitle')}</h2>
          </div>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('koc.koc')}</th>
                <th>{t('koc.email')}</th>
                <th className="cell-number">{t('koc.videos')}</th>
                <th className="cell-number">{t('koc.totalViews')}</th>
                <th className="cell-number">{t('koc.avgViewsPerVideo')}</th>
                <th className="cell-number">{t('koc.over10kRate')}</th>
                <th>{t('koc.topVideo')}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr className="table-state-row">
                  <td className="table-state-cell" colSpan={7}>
                    <div className="empty-state table-empty-state">
                      <div className="loading-dot" />
                      <div>{t('koc.loadingTable')}</div>
                    </div>
                  </td>
                </tr>
              ) : sortedRows.length ? (
                sortedRows.map((user, index) => (
                  <tr key={user.id}>
                    <td>
                      <span className="row-title">
                        {index + 1}. {user.name}
                      </span>
                    </td>
                    <td>{user.email}</td>
                    <td className="cell-number">{formatNumber(user.videoCount)}</td>
                    <td className="cell-number">{formatNumber(user.totalViews)}</td>
                    <td className="cell-number">{formatNumber(user.avgViewsPerVideo)}</td>
                    <td className="cell-number">{user.over10kRate}%</td>
                    <td>
                      <span className="row-title">{user.topVideo?.title || t('koc.noVideo')}</span>
                      <span className="row-subtitle">
                        {user.topVideo ? `${formatNumber(user.topVideo.views)} ${t('koc.totalViews')}` : t('common.noData')}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr className="table-state-row">
                  <td className="table-state-cell" colSpan={7}>
                    <div className="empty-state empty-state--compact table-empty-state">{t('koc.noData')}</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {summary.topKoc ? (
        <section className="section-card">
          <div className="section-card__header section-card__header--compact">
            <div>
              <h2 className="section-card__title">{t('koc.spotlight')}</h2>
            </div>
          </div>
          <div className="metric-item">
            <div className="metric-item__head">
              <span>{summary.topKoc.name}</span>
              <span>{formatNumber(summary.topKoc.totalViews)} {t('koc.totalViews')}</span>
            </div>
            <div className="row-subtitle">
              {summary.topKoc.videoCount} {t('koc.videos')} | {t('koc.avg')} {formatNumber(summary.topKoc.avgViewsPerVideo)} | {summary.topKoc.over10kRate}% {t('koc.over10kRate')} | Top video: {summary.topKoc.topVideo?.title || t('koc.noVideo')}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
};

export default KOCPerformance;
