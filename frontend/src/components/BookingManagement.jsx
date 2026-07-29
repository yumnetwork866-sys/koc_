import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  createBooking,
  deleteBooking,
  fetchBookingTargetKocs,
  fetchBookings,
  matchBookingVideo,
  updateBooking,
} from '../lib/api';
import { useI18n } from '../lib/language';

const initialForm = { creator_key: '', total_cost: '' };
const ACTIVE_COLLABORATION_STATUSES = new Set(['ONGOING', 'VALID', 'EXPIRING']);

const targetKocKey = (creator) => {
  const identity = creator.creator_open_id || `username:${String(creator.username || '').toLocaleLowerCase()}`;
  return `${creator.shop_id}:${identity}`;
};
const targetKocLabel = (creator) => {
  if (!creator) return '';
  const name = creator.nickname || creator.username || 'KOC';
  return `${name}${creator.username ? ` (@${creator.username})` : ''}`;
};
const snapshotOf = (booking) => booking?.evaluation_snapshot || {};
const collaborationOf = (booking) => snapshotOf(booking).collaboration || {};
const performanceOf = (booking) => snapshotOf(booking).performance || null;
const videoMatchOf = (booking) => snapshotOf(booking).video_match || null;
const finiteNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};
const optionalNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const TargetKocAvatar = ({ src, name }) => {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (!src || failed) {
    return <span className="creator-identity__avatar creator-identity__avatar--fallback">{String(name || 'K').trim().charAt(0).toUpperCase()}</span>;
  }
  return <img className="creator-identity__avatar" src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
};

const TargetKocCombobox = ({
  creators, value, onChange, placeholder, noResults, performanceSourceLabel, collaborationLabel,
}) => {
  const rootRef = useRef(null);
  const selectedCreator = useMemo(
    () => creators.find((creator) => targetKocKey(creator) === value) || null,
    [creators, value],
  );
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => setQuery(targetKocLabel(selectedCreator)), [selectedCreator]);
  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (event.key === 'Escape' || (event.type === 'pointerdown' && !rootRef.current?.contains(event.target))) {
        setOpen(false);
        setQuery(targetKocLabel(selectedCreator));
      }
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', close);
    };
  }, [open, selectedCreator]);

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredCreators = useMemo(() => creators.filter((creator) => {
    if (!normalizedQuery || targetKocKey(creator) === value) return true;
    return targetKocLabel(creator).toLocaleLowerCase().includes(normalizedQuery);
  }).slice(0, 50), [creators, normalizedQuery, value]);

  return (
    <div className="booking-koc-combobox" ref={rootRef}>
      <div className="booking-koc-combobox__control">
        <input
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls="booking-koc-options"
          value={query}
          placeholder={placeholder}
          required
          onFocus={() => setOpen(true)}
          onChange={(event) => { setQuery(event.target.value); onChange(''); setOpen(true); }}
        />
        <button type="button" aria-label={placeholder} aria-expanded={open} onClick={() => setOpen((current) => !current)}>
          <span className={`sidebar__chevron${open ? ' sidebar__chevron--open' : ''}`} aria-hidden="true" />
        </button>
      </div>
      {open ? (
        <div className="booking-koc-combobox__menu" id="booking-koc-options" role="listbox">
          {filteredCreators.length ? filteredCreators.map((creator) => (
            <button
              className={`booking-koc-combobox__option${targetKocKey(creator) === value ? ' booking-koc-combobox__option--active' : ''}`}
              type="button"
              role="option"
              aria-selected={targetKocKey(creator) === value}
              key={targetKocKey(creator)}
              onClick={() => { onChange(targetKocKey(creator)); setQuery(targetKocLabel(creator)); setOpen(false); }}
            >
              <TargetKocAvatar src={creator.avatar_url} name={creator.nickname || creator.username} />
              <span>
                <strong>{creator.nickname || creator.username}</strong>
                <small>@{creator.username} · {(creator.collaborations || []).length ? `${creator.collaborations.length} ${collaborationLabel}` : performanceSourceLabel}</small>
              </span>
            </button>
          )) : <div className="booking-koc-combobox__empty">{noResults}</div>}
        </div>
      ) : null}
    </div>
  );
};

const BookingManagement = ({ heroTitle }) => {
  const { t, language } = useI18n();
  const [bookings, setBookings] = useState([]);
  const [targetKocs, setTargetKocs] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [updatingId, setUpdatingId] = useState(null);
  const [matchingVideoId, setMatchingVideoId] = useState(null);
  const [videoMatchDialog, setVideoMatchDialog] = useState(null);
  const [manualVideoUrl, setManualVideoUrl] = useState('');
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [detailCost, setDetailCost] = useState('');
  const [error, setError] = useState('');
  const [openActions, setOpenActions] = useState({
    id: null,
    direction: 'down',
    top: 0,
    bottom: 0,
    right: 0,
  });

  const locale = language === 'vi' ? 'vi-VN' : 'en-US';
  const formatNumber = (value, options) => finiteNumber(value).toLocaleString(locale, options);
  const formatMoney = (value, currency = 'MYR') => {
    const currencyCode = currency === 'LOCAL' ? 'MYR' : currency || 'MYR';
    const formatter = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
    return currencyCode === 'MYR'
      ? formatter.formatToParts(finiteNumber(value))
        .map((part) => part.type === 'currency' ? 'RM' : part.value)
        .join('')
      : formatter.format(finiteNumber(value));
  };
  const formatDate = (value) => value
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(value))
    : '—';
  const formatCollaborationStatus = (value) => value
    ? t(`booking.collaborationStatuses.${String(value).toUpperCase()}`)
    : '—';

  useEffect(() => {
    const closeActions = (event) => {
      if (event.type === 'keydown' && event.key !== 'Escape') return;
      if (event.type === 'click' && event.target.closest('.booking-action-menu')) return;
      setOpenActions({ id: null, direction: 'down', top: 0, bottom: 0, right: 0 });
    };
    document.addEventListener('click', closeActions);
    document.addEventListener('keydown', closeActions);
    window.addEventListener('resize', closeActions);
    window.addEventListener('scroll', closeActions, true);
    return () => {
      document.removeEventListener('click', closeActions);
      document.removeEventListener('keydown', closeActions);
      window.removeEventListener('resize', closeActions);
      window.removeEventListener('scroll', closeActions, true);
    };
  }, []);

  const toggleActionsMenu = (bookingId, triggerElement) => {
    setOpenActions((current) => {
      if (current.id === bookingId) {
        return { id: null, direction: 'down', top: 0, bottom: 0, right: 0 };
      }
      const rect = triggerElement.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const direction = spaceBelow < 150 && spaceAbove > spaceBelow ? 'up' : 'down';
      return {
        id: bookingId,
        direction,
        top: Math.min(window.innerHeight - 12, rect.bottom + 8),
        bottom: Math.max(12, window.innerHeight - (rect.top - 8)),
        right: Math.max(12, window.innerWidth - rect.right),
      };
    });
  };

  const loadData = async (signal) => {
    const [loadedBookings, loadedTargetKocs] = await Promise.all([
      fetchBookings(signal),
      fetchBookingTargetKocs(signal),
    ]);
    setBookings(loadedBookings);
    setTargetKocs(loadedTargetKocs);
  };

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    loadData(controller.signal)
      .catch((err) => { if (err.name !== 'AbortError') setError(err.message || t('booking.errorLoad')); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [t]);

  const selectedKoc = useMemo(
    () => targetKocs.find((creator) => targetKocKey(creator) === form.creator_key) || null,
    [form.creator_key, targetKocs],
  );
  const stats = useMemo(() => bookings.reduce((result, booking) => {
    const collaboration = collaborationOf(booking);
    result.total += 1;
    result.totalCost += finiteNumber(booking.total_cost ?? booking.booking_cost);
    if (ACTIVE_COLLABORATION_STATUSES.has(collaboration.status)) result.active += 1;
    if (performanceOf(booking)) result.withPerformance += 1;
    return result;
  }, { total: 0, active: 0, withPerformance: 0, totalCost: 0 }), [bookings]);

  const costBenchmarks = (cost, performance) => {
    const videoViews = finiteNumber(performance?.video_views);
    const affiliateOrders = finiteNumber(performance?.affiliate_orders);
    const affiliateGmv = finiteNumber(performance?.affiliate_gmv);
    return {
      perThousandViews: videoViews > 0 ? finiteNumber(cost) / videoViews * 1000 : null,
      perOrder: affiliateOrders > 0 ? finiteNumber(cost) / affiliateOrders : null,
      gmvRatio: affiliateGmv > 0 ? finiteNumber(cost) / affiliateGmv * 100 : null,
    };
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!selectedKoc) return;
    try {
      setSaving(true);
      setError('');
      const created = await createBooking({
        target_shop_id: selectedKoc.shop_id,
        target_collaboration_id: selectedKoc.collaboration_id || null,
        creator_open_id: selectedKoc.creator_open_id,
        creator_username: selectedKoc.username,
        total_cost: Number(form.total_cost),
      });
      setBookings((items) => [created, ...items]);
      setForm(initialForm);
    } catch (err) {
      setError(err.message || t('booking.errorCreate'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (booking) => {
    if (!window.confirm(t('booking.deleteConfirm', { id: booking.id }))) return;
    try {
      setDeletingId(booking.id);
      setError('');
      await deleteBooking(booking.id);
      setBookings((items) => items.filter((item) => item.id !== booking.id));
      if (selectedBooking?.id === booking.id) setSelectedBooking(null);
    } catch (err) {
      setError(err.message || t('booking.errorDelete'));
    } finally {
      setDeletingId(null);
    }
  };

  const replaceBooking = (updated) => {
    setBookings((items) => items.map((item) => item.id === updated.id ? updated : item));
    setSelectedBooking((current) => current?.id === updated.id ? updated : current);
  };

  const findBookingVideo = async (booking, videoId, videoUrl) => {
    try {
      setMatchingVideoId(booking.id);
      setError('');
      const result = await matchBookingVideo(booking.id, { videoId, videoUrl });
      if (result.status === 'matched') {
        replaceBooking(result.booking);
        setVideoMatchDialog(null);
        return;
      }
      if (result.status === 'needs_confirmation') {
        setVideoMatchDialog({ booking, candidates: result.candidates || [], range: result.range });
        setManualVideoUrl('');
        return;
      }
      if (booking.video_platform_id) {
        setError(t('booking.videoRefreshNone'));
      } else {
        setVideoMatchDialog({ booking, candidates: [], range: result.range });
        setManualVideoUrl('');
      }
    } catch (err) {
      setError(err.message || t('booking.videoMatchError'));
    } finally {
      setMatchingVideoId(null);
    }
  };

  const saveCost = async (event) => {
    event.preventDefault();
    try {
      setUpdatingId(selectedBooking.id);
      const updated = await updateBooking(selectedBooking.id, {
        total_cost: Number(detailCost),
      });
      setBookings((items) => items.map((item) => item.id === updated.id ? updated : item));
      setSelectedBooking(updated);
    } catch (err) {
      setError(err.message || t('booking.errorUpdate'));
    } finally {
      setUpdatingId(null);
    }
  };

  const renderPerformance = (performance) => {
    if (!performance) return <span className="chip">{t('booking.noPerformance')}</span>;
    const gmv = optionalNumber(performance.affiliate_gmv);
    const orders = optionalNumber(performance.affiliate_orders);
    const views = optionalNumber(performance.video_views);
    return (
      <div className="booking-performance-cell">
        <strong>{gmv === null ? '—' : formatMoney(gmv, performance.currency)}</strong>
        <small>{orders === null ? '—' : formatNumber(orders)} {t('booking.orders')} · {views === null ? '—' : formatNumber(views)} {t('booking.views')}</small>
        <small>{t(`booking.performanceWindows.${performance.window_type || 'UNKNOWN'}`)}</small>
      </div>
    );
  };

  const renderActualPerformance = (booking) => {
    const actual = booking.actual_performance || {};
    if (!actual.video_count) return <span className="chip">{t('booking.awaitingVideo')}</span>;
    if (!actual.snapshot_count) {
      return <div className="booking-performance-cell"><strong>{t(`booking.actualStatuses.${actual.status}`)}</strong><small>{t('booking.awaitingFirstSync')}</small></div>;
    }
    return (
      <div className="booking-performance-cell">
        <strong>{formatMoney(actual.gross_gmv, actual.currency)} · {actual.gross_roas == null ? '—' : `${formatNumber(actual.gross_roas, { maximumFractionDigits: 2 })}x`} {t('booking.grossRoas')}</strong>
        <small>{formatNumber(actual.orders)} {t('booking.orders')} · {formatNumber(actual.views)} {t('booking.views')}</small>
        <small>{actual.net_gmv == null ? t('booking.netGmvPending') : `${formatMoney(actual.net_gmv, actual.currency)} · ${formatNumber(actual.net_roas, { maximumFractionDigits: 2 })}x ${t('booking.netRoas')}`}</small>
        <small>{t('booking.roiInsufficient')}</small>
        <span className={`booking-actual-status is-${String(actual.status || '').toLowerCase()}`}>{t(`booking.actualStatuses.${actual.status}`)}</span>
      </div>
    );
  };

  return (
    <div className="page">
      <section className="page__hero">
        <div><h1 className="page__title">{t('booking.heroTitle') || heroTitle}</h1></div>
        <div className="page__stats booking-stats booking-stats--evaluation">
          <article className="stat-card"><p className="stat-card__label">{t('booking.evaluations')}</p><p className="stat-card__value">{stats.total}</p></article>
          <article className="stat-card"><p className="stat-card__label">{t('booking.activeCollaborations')}</p><p className="stat-card__value">{stats.active}</p></article>
          <article className="stat-card"><p className="stat-card__label">{t('booking.performanceCoverage')}</p><p className="stat-card__value">{stats.total ? Math.round(stats.withPerformance / stats.total * 100) : 0}%</p></article>
          <article className="stat-card"><p className="stat-card__label">{t('booking.totalCost')}</p><p className="stat-card__value">{formatMoney(stats.totalCost)}</p></article>
        </div>
      </section>

      {error ? <section className="section-card empty-state empty-state--compact" role="alert">{error}</section> : null}

      <section className="section-card">
        <div className="section-card__header"><div><h2 className="section-card__title">{t('booking.createEvaluation')}</h2></div></div>
        <form className="filter-panel booking-evaluation-form" onSubmit={handleSubmit}>
          <div className="field"><label>{t('booking.targetCreator')}</label><TargetKocCombobox creators={targetKocs} value={form.creator_key} onChange={(value) => setForm((current) => ({ ...current, creator_key: value }))} placeholder={t('booking.searchKoc')} noResults={t('booking.noSyncedCollaboration')} performanceSourceLabel={t('booking.creatorPerformance')} collaborationLabel={t('booking.collaboration')} /></div>
          <div className="field"><label htmlFor="total_cost">{t('booking.totalCost')}</label><input id="total_cost" type="number" min="0" step="0.01" inputMode="decimal" value={form.total_cost} onChange={(event) => setForm((current) => ({ ...current, total_cost: event.target.value }))} required /></div>
          <div className="actions"><button className="button" type="submit" disabled={saving || !selectedKoc}>{saving ? t('booking.submitting') : t('booking.evaluate')}</button></div>
        </form>
        {selectedKoc ? (
          <div className="booking-source-preview">
            {selectedKoc.collaboration_id ? <div><span>{t('booking.collaboration')}</span><strong>{selectedKoc.collaboration_name || selectedKoc.collaboration_id}</strong><small>{formatCollaborationStatus(selectedKoc.collaboration_status)} · {t('booking.validUntil')} {formatDate(selectedKoc.collaboration_end_at)}</small></div> : null}
            <div><span>{t('booking.creatorPerformance')}</span>{renderPerformance(selectedKoc.performance)}</div>
          </div>
        ) : null}
      </section>

      <section className="section-card">
        <div className="section-card__header"><div><h2 className="section-card__title">{t('booking.evaluationList')}</h2></div></div>
        <div className="table-wrap"><table className="data-table booking-evaluation-table">
          <thead>
            <tr><th>{t('booking.kocColumn')}</th><th>{t('booking.collaboration')}</th><th>{t('booking.creatorPerformance')}</th><th className="cell-number">{t('booking.totalCost')}</th><th>{t('booking.matchedVideo')}</th><th>{t('booking.actualPerformance')}</th><th className="cell-actions">{t('booking.actionsColumn')}</th></tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={7}><div className="empty-state"><span className="loading-dot" />{t('booking.loading')}</div></td></tr> : bookings.length ? bookings.map((booking) => {
              const collaboration = collaborationOf(booking);
              const performance = performanceOf(booking);
              const videoMatch = videoMatchOf(booking);
              return <tr key={booking.id}>
                <td><div className="booking-koc-identity"><TargetKocAvatar src={booking.creator_avatar_url} name={booking.creator_name || booking.creator_username} /><span><strong>{booking.creator_name || booking.creator_username || 'KOC'}</strong><small>@{booking.creator_username}</small></span></div></td>
                <td>{collaboration.id ? <div className="booking-performance-cell"><small><span className={`booking-collaboration-status is-${String(collaboration.status || '').toLowerCase()}`}>{formatCollaborationStatus(collaboration.status)}</span></small><small>{t('booking.validUntil')} {formatDate(collaboration.end_at)}</small></div> : <span className="chip">{t('booking.creatorPerformance')}</span>}</td>
                <td>{renderPerformance(performance)}</td>
                <td className="cell-number"><strong>{formatMoney(booking.total_cost ?? booking.booking_cost, booking.currency)}</strong></td>
                <td>{booking.video_platform_id ? <div className="booking-performance-cell"><strong>{t('booking.videoLinked')}</strong>{booking.video_url ? <a href={booking.video_url} target="_blank" rel="noreferrer">{videoMatch?.title || booking.video_platform_id} ↗</a> : <small>{videoMatch?.title || booking.video_platform_id}</small>}<small>{formatDate(booking.posted_at)}</small><button className="booking-video-refresh" type="button" disabled={matchingVideoId === booking.id} onClick={() => findBookingVideo(booking)}>{matchingVideoId === booking.id ? t('booking.refreshingVideo') : t('booking.refreshVideo')}</button></div> : <button className="button button--small button--ghost" type="button" disabled={matchingVideoId === booking.id} onClick={() => findBookingVideo(booking)}>{matchingVideoId === booking.id ? t('booking.findingVideo') : t('booking.findVideo')}</button>}</td>
                <td>{renderActualPerformance(booking)}</td>
                <td className="cell-actions">
                  <div className="action-menu booking-action-menu">
                    <button
                      className="action-menu__trigger"
                      type="button"
                      aria-haspopup="menu"
                      aria-expanded={openActions.id === booking.id}
                      aria-label={t('booking.actionsColumn')}
                      onClick={(event) => toggleActionsMenu(booking.id, event.currentTarget)}
                    >
                      •••
                    </button>
                    {openActions.id === booking.id ? createPortal(
                      <div
                        className={`action-menu__panel booking-action-menu booking-action-menu__popover action-menu__panel--${openActions.direction}`}
                        role="menu"
                        style={{
                          position: 'fixed',
                          right: `${openActions.right}px`,
                          top: openActions.direction === 'down' ? `${openActions.top}px` : 'auto',
                          bottom: openActions.direction === 'up' ? `${openActions.bottom}px` : 'auto',
                        }}
                      >
                      <button
                        type="button"
                        className="action-menu__item"
                        role="menuitem"
                        onClick={() => {
                          setOpenActions({ id: null, direction: 'down', top: 0, bottom: 0, right: 0 });
                          setSelectedBooking(booking);
                          setDetailCost(String(booking.total_cost ?? booking.booking_cost));
                        }}
                      >
                        {t('booking.details')}
                      </button>
                      <button
                        type="button"
                        className="action-menu__item action-menu__item--danger"
                        disabled={deletingId === booking.id}
                        role="menuitem"
                        onClick={() => {
                          setOpenActions({ id: null, direction: 'down', top: 0, bottom: 0, right: 0 });
                          handleDelete(booking);
                        }}
                      >
                        {deletingId === booking.id ? t('booking.deleting') : t('booking.delete')}
                      </button>
                      </div>
                      ,
                      document.body,
                    ) : null}
                  </div>
                </td>
              </tr>;
            }) : <tr><td colSpan={7}><div className="empty-state">{t('booking.noEvaluations')}</div></td></tr>}
          </tbody>
        </table></div>
      </section>

      {videoMatchDialog ? (
        <div className="koc-drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setVideoMatchDialog(null); }}>
          <aside className="koc-drawer booking-video-match-drawer" role="dialog" aria-modal="true" aria-labelledby="booking-video-match-title">
            <div className="koc-drawer__header"><div><h2 id="booking-video-match-title">{t('booking.videoCandidatesTitle')}</h2></div><button className="button button--ghost" type="button" aria-label={t('common.close')} onClick={() => setVideoMatchDialog(null)}>×</button></div>
            <div className="koc-drawer__body">
              {videoMatchDialog.candidates.length ? <div className="booking-video-candidates">{videoMatchDialog.candidates.map((candidate) => <button className="booking-video-candidate" type="button" key={candidate.id} disabled={matchingVideoId === videoMatchDialog.booking.id} onClick={() => findBookingVideo(videoMatchDialog.booking, candidate.id)}><span><strong>{candidate.title || candidate.id}</strong><small>@{candidate.username} · {formatDate(candidate.posted_at)}</small></span><span><strong>{formatMoney(candidate.gmv?.amount, candidate.gmv?.currency)}</strong><small>{formatNumber(candidate.views)} {t('booking.views')} · {formatNumber(candidate.orders)} {t('booking.orders')}</small></span></button>)}</div> : <p className="section-card__meta">{t('booking.videoMatchNone')}</p>}
              <form className="booking-video-manual" onSubmit={(event) => { event.preventDefault(); findBookingVideo(videoMatchDialog.booking, null, manualVideoUrl); }}>
                <label className="field"><span>{t('booking.manualVideoUrl')}</span><input type="url" required value={manualVideoUrl} placeholder="https://www.tiktok.com/@username/video/..." onChange={(event) => setManualVideoUrl(event.target.value)} /></label>
                <button className="button" type="submit" disabled={matchingVideoId === videoMatchDialog.booking.id}>{matchingVideoId === videoMatchDialog.booking.id ? t('booking.linkingVideo') : t('booking.linkVideo')}</button>
              </form>
            </div>
          </aside>
        </div>
      ) : null}

      {selectedBooking ? (() => {
        const collaboration = collaborationOf(selectedBooking);
        const performance = performanceOf(selectedBooking);
        const videoMatch = videoMatchOf(selectedBooking);
        const benchmark = costBenchmarks(detailCost, performance);
        return <div className="koc-drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedBooking(null); }}>
          <aside className="koc-drawer booking-detail-drawer" role="dialog" aria-modal="true" aria-labelledby="booking-detail-title">
            <div className="koc-drawer__header"><div><h2 id="booking-detail-title">{t('booking.detailTitle', { id: selectedBooking.id })}</h2><p>@{selectedBooking.creator_username}</p></div><button className="button button--ghost" type="button" aria-label={t('common.close')} onClick={() => setSelectedBooking(null)}>×</button></div>
            <div className="koc-drawer__body">
              <section className="drawer-section"><div className="drawer-profile"><TargetKocAvatar src={selectedBooking.creator_avatar_url} name={selectedBooking.creator_name} /><div><strong>{selectedBooking.creator_name || selectedBooking.creator_username}</strong><span>{collaboration.name || selectedBooking.target_collaboration_id || t('booking.creatorPerformance')}</span></div></div></section>
              {collaboration.id ? <section className="drawer-section"><h3>{t('booking.collaboration')}</h3><div className="booking-detail-grid"><div><span>{t('booking.partnerStatus')}</span><strong>{formatCollaborationStatus(collaboration.status)}</strong></div><div><span>{t('booking.validUntil')}</span><strong>{formatDate(collaboration.end_at)}</strong></div><div className="booking-detail-grid__wide"><span>{t('booking.products')}</span><strong>{(collaboration.products || []).map((product) => product.title || product.name || product.id).filter(Boolean).join(', ') || '—'}</strong></div></div></section> : null}
              <section className="drawer-section"><h3>{t('booking.creatorPerformance')}</h3>{renderPerformance(performance)}<p className="section-card__meta">{t('booking.performancePeriodDisclaimer')}</p></section>
              <section className="drawer-section"><h3>{t('booking.matchedVideo')}</h3>{selectedBooking.video_platform_id ? <div className="booking-performance-cell"><strong>{videoMatch?.title || selectedBooking.video_platform_id}</strong>{selectedBooking.video_url ? <a href={selectedBooking.video_url} target="_blank" rel="noreferrer">{t('booking.openMatchedVideo')} ↗</a> : null}{videoMatch ? <small>{formatMoney(videoMatch.gmv?.amount, videoMatch.gmv?.currency)} · {formatNumber(videoMatch.views)} {t('booking.views')} · {formatNumber(videoMatch.orders)} {t('booking.orders')}</small> : null}<small>{formatDate(selectedBooking.posted_at)}</small><button className="button button--ghost" type="button" disabled={matchingVideoId === selectedBooking.id} onClick={() => findBookingVideo(selectedBooking)}>{matchingVideoId === selectedBooking.id ? t('booking.refreshingVideo') : t('booking.refreshVideo')}</button></div> : <button className="button button--ghost" type="button" disabled={matchingVideoId === selectedBooking.id} onClick={() => findBookingVideo(selectedBooking)}>{matchingVideoId === selectedBooking.id ? t('booking.findingVideo') : t('booking.findVideo')}</button>}</section>
              <section className="drawer-section"><h3>{t('booking.actualResults')}</h3>{renderActualPerformance(selectedBooking)}<p className="section-card__meta">{t('booking.actualAttributionDisclaimer')}</p></section>
              <form className="booking-detail-form" onSubmit={saveCost}>
                <label className="field booking-detail-form__wide"><span>{t('booking.totalCost')}</span><input type="number" min="0" step="0.01" value={detailCost} onChange={(event) => setDetailCost(event.target.value)} required /></label>
                <div className="booking-detail-grid booking-detail-form__wide"><div><span>{t('booking.costPerThousandViews')}</span><strong>{benchmark.perThousandViews == null ? '—' : formatMoney(benchmark.perThousandViews, selectedBooking.currency)}</strong></div><div><span>{t('booking.costPerOrder')}</span><strong>{benchmark.perOrder == null ? '—' : formatMoney(benchmark.perOrder, selectedBooking.currency)}</strong></div><div><span>{t('booking.costGmvRatio')}</span><strong>{benchmark.gmvRatio == null ? '—' : `${formatNumber(benchmark.gmvRatio, { maximumFractionDigits: 2 })}%`}</strong></div></div>
                <div className="actions booking-detail-form__wide"><button className="button" type="submit" disabled={updatingId === selectedBooking.id}>{updatingId === selectedBooking.id ? t('common.loading') : t('booking.saveCost')}</button></div>
              </form>
            </div>
          </aside>
        </div>;
      })() : null}
    </div>
  );
};

export default BookingManagement;
