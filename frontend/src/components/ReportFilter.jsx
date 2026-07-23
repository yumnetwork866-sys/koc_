import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  FileText,
  Link2,
} from 'lucide-react';
import { fetchReports, generateWeeklyReport, shareReport } from '../lib/api';
import { useI18n } from '../lib/language';

const toDateInputValue = (date) => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, '0'),
  String(date.getDate()).padStart(2, '0'),
].join('-');

const ReportFilter = ({ heroTitle }) => {
  const { t, language } = useI18n();
  const [reports, setReports] = useState([]);
  const [periodDays, setPeriodDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [expandedReportId, setExpandedReportId] = useState(null);
  const [sharingReportId, setSharingReportId] = useState(null);
  const [copiedLinkReportId, setCopiedLinkReportId] = useState(null);

  const loadReports = async (signal) => {
    const loadedReports = await fetchReports(signal);
    setReports(loadedReports);
    setExpandedReportId((current) => current ?? loadedReports[0]?.id ?? null);
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
          setError(err.message || t('reports.loadError'));
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

  const locale = language === 'vi' ? 'vi-VN' : 'en-US';
  const formatDate = (value) => {
    if (!value) return '—';
    return new Intl.DateTimeFormat(locale, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date(`${String(value).slice(0, 10)}T00:00:00`));
  };
  const selectedDays = useMemo(() => {
    const days = Number(periodDays);
    return Number.isFinite(days) && days > 0 ? days : 7;
  }, [periodDays]);
  const { weekStart, weekEnd } = useMemo(() => {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - selectedDays + 1);
    return {
      weekStart: toDateInputValue(start),
      weekEnd: toDateInputValue(end),
    };
  }, [selectedDays]);

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
      setError(err.message || t('reports.generateError'));
    } finally {
      setGenerating(false);
    }
  };

  const copyText = async (value) => {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    textarea.remove();
    if (!copied) throw new Error('Copy failed');
  };

  const copyShareLink = async (report) => {
    try {
      setSharingReportId(report.id);
      setError('');
      const response = await shareReport(report.id);
      const url = `${window.location.origin}/shared/reports/${encodeURIComponent(response.share_token)}`;
      await copyText(url);
      setCopiedLinkReportId(report.id);
      window.setTimeout(() => {
        setCopiedLinkReportId((current) => current === report.id ? null : current);
      }, 1800);
    } catch (err) {
      setError(err.message || t('reports.shareError'));
    } finally {
      setSharingReportId(null);
    }
  };

  return (
    <div className="page reports-page">
      <section className="page__hero reports-hero report-generator">
        <div className="reports-hero__heading">
          <div>
            <h1 className="page__title">{t('reports.heroTitle') || heroTitle}</h1>
            <p className="page__subtitle">{t('reports.subtitle')}</p>
          </div>
        </div>
        <div className="report-generator__embedded">
          <form className="report-generator__form" onSubmit={handleGenerate}>
            <label className="field report-generator__period" htmlFor="report_period">
              <span>{t('reports.periodLabel')}</span>
              <select id="report_period" value={periodDays} onChange={(event) => setPeriodDays(Number(event.target.value))}>
                <option value={7}>{t('reports.last7Days')}</option>
                <option value={30}>{t('reports.last30Days')}</option>
                <option value={90}>{t('reports.last90Days')}</option>
              </select>
            </label>
            <button className="button report-generator__submit" type="submit" disabled={generating}>
              {generating ? t('reports.generating') : t('reports.generate')}
            </button>
          </form>
        </div>
      </section>

      {error ? <section className="section-card empty-state empty-state--compact reports-alert" role="alert">{error}</section> : null}

      <section className="section-card reports-list-section">
        <div className="section-card__header">
          <div>
            <h2 className="section-card__title">{t('reports.list')}</h2>
            <p className="section-card__meta">{t('reports.listMeta', { count: reports.length })}</p>
          </div>
        </div>

        {loading ? (
          <div className="empty-state">
            <div className="loading-dot" />
            <div>{t('reports.loading')}</div>
          </div>
        ) : reports.length ? (
          <div className="reports-list">
            {reports.map((report, index) => {
              const expanded = expandedReportId === report.id;
              return (
                <article className={`report-card${expanded ? ' report-card--expanded' : ''}`} key={report.id}>
                  <div className="report-card__header">
                    <button
                      className="report-card__toggle"
                      type="button"
                      aria-expanded={expanded}
                      aria-controls={`report-content-${report.id}`}
                      onClick={() => setExpandedReportId(expanded ? null : report.id)}
                    >
                      <span className="report-card__document" aria-hidden="true"><FileText size={20} /></span>
                      <span className="report-card__identity">
                        <strong>{t('reports.reportNumber', { number: reports.length - index })}</strong>
                        <small>{formatDate(report.week_start)} – {formatDate(report.week_end)}</small>
                      </span>
                    </button>
                    <button
                      className="report-card__share"
                      type="button"
                      disabled={sharingReportId === report.id}
                      aria-label={t('reports.copyShareLink')}
                      title={t('reports.copyShareLink')}
                      onClick={() => copyShareLink(report)}
                    >
                      {copiedLinkReportId === report.id ? <Check size={17} /> : <Link2 size={17} />}
                      <span>{copiedLinkReportId === report.id ? t('reports.linkCopied') : t('reports.copyLink')}</span>
                    </button>
                    <button
                      className="report-card__expand"
                      type="button"
                      aria-expanded={expanded}
                      aria-controls={`report-content-${report.id}`}
                      aria-label={expanded ? t('reports.collapse') : t('reports.expand')}
                      onClick={() => setExpandedReportId(expanded ? null : report.id)}
                    >
                      <ChevronDown className="report-card__chevron" size={19} aria-hidden="true" />
                    </button>
                  </div>
                  {expanded ? (
                    <div className="report-card__body" id={`report-content-${report.id}`}>
                      <pre className="report-content">{report.generated_content}</pre>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="empty-state reports-empty">
            <span className="reports-empty__icon" aria-hidden="true"><FileText size={24} /></span>
            <strong>{t('reports.empty')}</strong>
            <span>{t('reports.emptyMeta')}</span>
          </div>
        )}
      </section>
    </div>
  );
};

export default ReportFilter;
