import React, { useEffect, useMemo, useState } from 'react';
import { fetchReports, generateWeeklyReport } from '../lib/api';

const getMonday = () => {
  const date = new Date();
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  return date.toISOString().slice(0, 10);
};

const addDays = (dateText, days) => {
  const date = new Date(dateText);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

const ReportFilter = ({ heroTitle, heroSubtitle }) => {
  const [reports, setReports] = useState([]);
  const [weekStart, setWeekStart] = useState(getMonday());
  const [weekEnd, setWeekEnd] = useState(addDays(getMonday(), 6));
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  const loadReports = async (signal) => {
    const loadedReports = await fetchReports(signal);
    setReports(loadedReports);
  };

  useEffect(() => {
    const controller = new AbortController();

    const load = async () => {
      try {
        setLoading(true);
        setError('');
        await loadReports(controller.signal);
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

  const latestReport = useMemo(() => reports[0] || null, [reports]);

  const handleGenerate = async (event) => {
    event.preventDefault();

    try {
      setGenerating(true);
      setError('');
      await generateWeeklyReport({
        week_start: weekStart,
        week_end: weekEnd,
      });
      await loadReports();
    } catch (err) {
      setError(err.message || 'Không generate được báo cáo');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="page">
      <section className="page__hero">
        <h1 className="page__title">{heroTitle}</h1>
        <p className="page__subtitle">{heroSubtitle}</p>
        <div className="page__stats">
          <article className="stat-card">
            <p className="stat-card__label">Reports</p>
            <p className="stat-card__value">{reports.length}</p>
          </article>
          <article className="stat-card">
            <p className="stat-card__label">Latest start</p>
            <p className="stat-card__value stat-card__value--small">{latestReport?.week_start || '-'}</p>
          </article>
          <article className="stat-card">
            <p className="stat-card__label">Latest end</p>
            <p className="stat-card__value stat-card__value--small">{latestReport?.week_end || '-'}</p>
          </article>
        </div>
      </section>

      {error ? <section className="section-card empty-state empty-state--compact">{error}</section> : null}

      <section className="section-card">
        <div className="section-card__header">
          <div>
            <h2 className="section-card__title">Generate weekly report</h2>
            <p className="section-card__meta">Backend tổng hợp video trong tuần và sinh nội dung báo cáo mẫu.</p>
          </div>
        </div>

        <form className="filter-panel" onSubmit={handleGenerate}>
          <div className="field">
            <label htmlFor="week_start">Week start</label>
            <input id="week_start" type="date" value={weekStart} onChange={(event) => setWeekStart(event.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="week_end">Week end</label>
            <input id="week_end" type="date" value={weekEnd} onChange={(event) => setWeekEnd(event.target.value)} />
          </div>
          <div className="actions">
            <button className="button" type="submit" disabled={generating}>
              {generating ? 'Đang generate' : 'Generate report'}
            </button>
          </div>
        </form>
      </section>

      <section className="section-card">
        <div className="section-card__header">
          <div>
            <h2 className="section-card__title">Danh sách báo cáo</h2>
            <p className="section-card__meta">Nội dung lưu trong bảng weekly_reports.</p>
          </div>
        </div>

        {loading ? (
          <div className="empty-state">
            <div className="loading-dot" />
            <div>Đang tải báo cáo</div>
          </div>
        ) : reports.length ? (
          <div className="metric-list">
            {reports.map((report) => (
              <article className="metric-item report-block" key={report.id}>
                <div className="metric-item__head">
                  <span>{report.week_start} - {report.week_end}</span>
                  <span className="chip chip--blue">AI weekly report</span>
                </div>
                <pre className="report-content">{report.generated_content}</pre>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">Chưa có báo cáo tuần.</div>
        )}
      </section>
    </div>
  );
};

export default ReportFilter;
