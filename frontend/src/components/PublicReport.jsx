import React, { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { fetchPublicReport } from '../lib/api';
import { useI18n } from '../lib/language';

const PublicReport = () => {
  const { token } = useParams();
  const { t, language } = useI18n();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const locale = language === 'vi' ? 'vi-VN' : 'en-US';
  const formatDate = (value) => value
    ? new Intl.DateTimeFormat(locale, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date(`${String(value).slice(0, 10)}T00:00:00`))
    : '—';

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    fetchPublicReport(token, controller.signal)
      .then(setReport)
      .catch((err) => {
        if (err.name !== 'AbortError') setError(t('reports.publicNotFound'));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [t, token]);

  return (
    <main className="public-report-page">
      {loading ? (
        <section className="public-report-card empty-state">
          <span className="loading-dot" />
          {t('reports.loading')}
        </section>
      ) : error || !report ? (
        <section className="public-report-card empty-state" role="alert">
          <span className="reports-empty__icon" aria-hidden="true"><FileText size={24} /></span>
          <strong>{error || t('reports.publicNotFound')}</strong>
        </section>
      ) : (
        <article className="public-report-card">
          <header className="public-report-card__header">
            <p>{t('reports.publicLabel')}</p>
            <h1>{t('reports.heroTitle')}</h1>
            <span>{formatDate(report.week_start)} – {formatDate(report.week_end)}</span>
          </header>
          <div className="public-report-card__content">
            <pre>{report.generated_content}</pre>
          </div>
        </article>
      )}
    </main>
  );
};

export default PublicReport;
