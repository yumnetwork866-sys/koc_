import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchSchedules, runScheduleNow, updateSchedule } from '../lib/api';
import { useI18n } from '../lib/language';

const TIMEZONES = ['Asia/Ho_Chi_Minh', 'Asia/Kuala_Lumpur', 'Asia/Singapore', 'Asia/Bangkok', 'UTC'];
const DEFAULT_TIMES = ['02:00', '06:00', '10:00', '14:00', '18:00', '22:00'];

const resizeRunTimes = (current, count) => {
  const next = [...current].slice(0, count);
  for (const candidate of DEFAULT_TIMES) {
    if (next.length >= count) break;
    if (!next.includes(candidate)) next.push(candidate);
  }
  return next.sort();
};

const formatDateTime = (value, locale) => value
  ? new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'medium' }).format(new Date(value))
  : '—';

const ScheduleManagement = ({ heroTitle, heroSubtitle }) => {
  const { t, language } = useI18n();
  const locale = language === 'vi' ? 'vi-VN' : 'en-US';
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState('');
  const [runningKey, setRunningKey] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async (signal, quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const payload = await fetchSchedules(signal);
      setSchedules(payload.schedules || []);
      setError('');
    } catch (err) {
      if (err.name !== 'AbortError') setError(err.message || t('schedule.loadError'));
    } finally {
      if (!quiet && !signal?.aborted) setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const hasRunningJob = useMemo(() => schedules.some((schedule) => schedule.runs?.[0]?.status === 'PROCESSING'), [schedules]);
  useEffect(() => {
    if (!hasRunningJob) return undefined;
    const controller = new AbortController();
    const interval = window.setInterval(() => load(controller.signal, true), 10000);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [hasRunningJob, load]);

  const patchSchedule = (jobKey, patch) => setSchedules((items) => items.map((item) => (
    item.job_key === jobKey ? { ...item, ...patch } : item
  )));

  const save = async (schedule) => {
    try {
      setSavingKey(schedule.job_key);
      setError('');
      const payload = await updateSchedule(schedule.job_key, {
        enabled: schedule.enabled,
        timezone: schedule.timezone,
        run_times: schedule.run_times,
      });
      patchSchedule(schedule.job_key, payload.schedule);
      setNotice(t('schedule.saved'));
    } catch (err) {
      setError(err.message || t('schedule.saveError'));
    } finally {
      setSavingKey('');
    }
  };

  const runNow = async (schedule) => {
    try {
      setRunningKey(schedule.job_key);
      setError('');
      await runScheduleNow(schedule.job_key);
      setNotice(t('schedule.started'));
      await load(undefined, true);
    } catch (err) {
      setError(err.message || t('schedule.runError'));
    } finally {
      setRunningKey('');
    }
  };

  return (
    <div className="page schedule-page">
      <section className="page__hero">
        <div><p className="page__eyebrow">Admin</p><h1>{heroTitle || t('schedule.title')}</h1><p>{heroSubtitle || t('schedule.subtitle')}</p></div>
      </section>
      {error ? <section className="section-card empty-state empty-state--compact" role="alert">{error}</section> : null}
      {notice ? <section className="section-card empty-state empty-state--compact" role="status">{notice}</section> : null}
      {loading ? <section className="section-card empty-state"><span className="loading-dot" />{t('schedule.loading')}</section> : null}
      {!loading ? <div className="schedule-grid">{schedules.map((schedule) => {
        const latest = schedule.runs?.[0];
        return <article className="section-card schedule-card" key={schedule.job_key}>
          <div className="section-card__header schedule-card__header"><div><h2 className="section-card__title">{t(`schedule.jobs.${schedule.job_key}.name`)}</h2><p className="section-card__meta">{t(`schedule.jobs.${schedule.job_key}.description`)}</p></div><label className="schedule-toggle"><input type="checkbox" checked={schedule.enabled} onChange={(event) => patchSchedule(schedule.job_key, { enabled: event.target.checked })} /><span>{schedule.enabled ? t('schedule.enabled') : t('schedule.disabled')}</span></label></div>
          <div className="schedule-form-grid">
            <label className="field"><span>{t('schedule.timezone')}</span><select value={schedule.timezone} onChange={(event) => patchSchedule(schedule.job_key, { timezone: event.target.value })}>{TIMEZONES.map((timezone) => <option value={timezone} key={timezone}>{timezone}</option>)}</select></label>
            <label className="field"><span>{t('schedule.runsPerDay')}</span><select value={schedule.run_times.length} onChange={(event) => patchSchedule(schedule.job_key, { run_times: resizeRunTimes(schedule.run_times, Number(event.target.value)), run_count: Number(event.target.value) })}>{[1, 2, 3, 4, 5, 6].map((count) => <option value={count} key={count}>{count}</option>)}</select></label>
          </div>
          <div className="schedule-times"><span className="schedule-times__label">{t('schedule.runTimes')}</span><div>{schedule.run_times.map((time, index) => <label key={`${schedule.job_key}-${index}`}><span>{t('schedule.runNumber', { number: index + 1 })}</span><input type="time" value={time} onChange={(event) => { const times = [...schedule.run_times]; times[index] = event.target.value; patchSchedule(schedule.job_key, { run_times: times }); }} /></label>)}</div></div>
          <div className="schedule-card__actions"><button className="button" type="button" disabled={savingKey === schedule.job_key} onClick={() => save(schedule)}>{savingKey === schedule.job_key ? t('common.loading') : t('schedule.save')}</button><button className="button button--ghost" type="button" disabled={runningKey === schedule.job_key || latest?.status === 'PROCESSING'} onClick={() => runNow(schedule)}>{runningKey === schedule.job_key || latest?.status === 'PROCESSING' ? t('schedule.running') : t('schedule.runNow')}</button></div>
          <div className="schedule-latest"><div><span>{t('schedule.latestRun')}</span><strong>{formatDateTime(latest?.started_at, locale)}</strong></div><div><span>{t('schedule.status')}</span><strong className={`chip schedule-status schedule-status--${String(latest?.status || 'EMPTY').toLowerCase()}`}>{latest?.status || t('schedule.never')}</strong></div>{latest?.summary ? <div><span>{t('schedule.result')}</span><strong>{latest.summary.succeeded ?? 0}/{latest.summary.total ?? latest.summary.channels ?? 0} {t('schedule.succeeded')}</strong></div> : null}</div>
          {latest?.error ? <p className="schedule-card__error">{latest.error}</p> : null}
          {schedule.runs?.length ? <details className="schedule-history"><summary>{t('schedule.history')}</summary><div className="table-wrap"><table className="data-table"><thead><tr><th>{t('schedule.startedAt')}</th><th>{t('schedule.trigger')}</th><th>{t('schedule.status')}</th><th>{t('schedule.duration')}</th></tr></thead><tbody>{schedule.runs.map((run) => <tr key={run.id}><td>{formatDateTime(run.started_at, locale)}</td><td>{run.trigger_type}</td><td><span className="chip">{run.status}</span></td><td>{run.completed_at ? `${Math.max(0, Math.round((new Date(run.completed_at) - new Date(run.started_at)) / 1000))}s` : '—'}</td></tr>)}</tbody></table></div></details> : null}
        </article>;
      })}</div> : null}
    </div>
  );
};

export default ScheduleManagement;
