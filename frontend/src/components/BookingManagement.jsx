import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  createBooking,
  deleteBooking,
  fetchBookingTargetKocs,
  fetchBookings,
  updateBooking,
} from '../lib/api';
import { useI18n } from '../lib/language';

const initialForm = {
  staff_name: '',
  creator_key: '',
  booking_cost: '',
  deadline: '',
  note: '',
};

const BOOKING_STATUSES = ['draft', 'booked', 'waiting_video', 'video_posted', 'done', 'cancelled'];
const TERMINAL_STATUSES = new Set(['done', 'cancelled']);
const bookingDeadlineState = (booking) => {
  if (!booking.deadline || TERMINAL_STATUSES.has(booking.status)) return 'neutral';
  const deadline = new Date(`${booking.deadline}T23:59:59`);
  const days = Math.ceil((deadline.getTime() - Date.now()) / 86400000);
  if (days < 0) return 'overdue';
  if (days <= 3) return 'soon';
  return 'active';
};

const getKocDisplayName = (user) => {
  const rawName = String(user?.name || user || '').trim();
  if (!rawName) return '-';

  return rawName
    .replace(/\s*\(?\s*KOC(?:\s*(?:nữ|nam))?\s*\)?$/iu, '')
    .trim() || rawName;
};

const targetKocKey = (creator) => `${creator.shop_id}:${creator.creator_open_id}`;
const targetKocLabel = (creator) => {
  if (!creator) return '';
  const name = creator.nickname || creator.username || 'KOC';
  return creator.username ? `${name} (@${creator.username})` : name;
};

const TargetKocAvatar = ({ src, name }) => {
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(false);
  useEffect(() => {
    setFailed(false);
    setRetry(false);
  }, [src]);
  if (!src || failed) {
    return <span className="creator-identity__avatar creator-identity__avatar--fallback">{String(name || 'K').trim().charAt(0).toUpperCase()}</span>;
  }
  return (
    <img
      className="creator-identity__avatar"
      src={retry ? `${src}#avatar-retry` : src}
      alt=""
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => { if (!retry) setRetry(true); else setFailed(true); }}
    />
  );
};

const TargetKocCombobox = ({ creators, value, onChange, placeholder, noResults }) => {
  const rootRef = useRef(null);
  const selectedCreator = useMemo(
    () => creators.find((creator) => targetKocKey(creator) === value) || null,
    [creators, value],
  );
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setQuery(targetKocLabel(selectedCreator));
  }, [selectedCreator]);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (event.key === 'Escape' || (event.type === 'pointerdown' && !rootRef.current?.contains(event.target))) {
        setOpen(false);
        if (selectedCreator) setQuery(targetKocLabel(selectedCreator));
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
    return `${creator.nickname || ''} ${creator.username || ''}`.toLocaleLowerCase().includes(normalizedQuery);
  }).slice(0, 50), [creators, normalizedQuery, value]);

  const selectCreator = (creator) => {
    onChange(targetKocKey(creator));
    setQuery(targetKocLabel(creator));
    setOpen(false);
  };

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
          onChange={(event) => {
            setQuery(event.target.value);
            onChange('');
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setOpen(true);
              window.requestAnimationFrame(() => rootRef.current?.querySelector('[role="option"]')?.focus());
            }
          }}
        />
        <button type="button" aria-label={placeholder} aria-expanded={open} onClick={() => setOpen((current) => !current)}>
          <span className={`sidebar__chevron${open ? ' sidebar__chevron--open' : ''}`} aria-hidden="true" />
        </button>
      </div>
      {open ? (
        <div className="booking-koc-combobox__menu" id="booking-koc-options" role="listbox">
          {filteredCreators.length ? filteredCreators.map((creator) => {
            const creatorKey = targetKocKey(creator);
            return (
              <button
                className={`booking-koc-combobox__option${creatorKey === value ? ' booking-koc-combobox__option--active' : ''}`}
                type="button"
                role="option"
                aria-selected={creatorKey === value}
                key={creatorKey}
                onClick={() => selectCreator(creator)}
              >
                <TargetKocAvatar src={creator.avatar_url} name={creator.nickname || creator.username} />
                <span><strong>{creator.nickname || creator.username}</strong><small>@{creator.username}</small></span>
              </button>
            );
          }) : <div className="booking-koc-combobox__empty">{noResults}</div>}
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
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [detailForm, setDetailForm] = useState(null);
  const [error, setError] = useState('');

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

    const load = async () => {
      try {
        setLoading(true);
        setError('');
        await loadData(controller.signal);
      } catch (err) {
        if (err.name !== 'AbortError') {
          setError(err.message || t('booking.errorLoad'));
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

  useEffect(() => {
    window.history.replaceState({}, '', window.location.pathname);
  }, []);

  const localizedFormatMoney = (value) => Number(value || 0).toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US');
  const targetKocsByKey = useMemo(() => new Map(
    targetKocs.map((creator) => [targetKocKey(creator), creator]),
  ), [targetKocs]);

  const stats = useMemo(() => {
    return bookings.reduce(
      (acc, booking) => {
        acc.total += 1;
        acc.totalCost += Number(booking.booking_cost || 0);
        if (!TERMINAL_STATUSES.has(booking.status)) acc.active += 1;
        if (booking.status === 'waiting_video') acc.waitingVideo += 1;
        if (booking.status === 'done') acc.done += 1;
        if (bookingDeadlineState(booking) === 'overdue') acc.overdue += 1;
        return acc;
      },
      { total: 0, active: 0, waitingVideo: 0, overdue: 0, done: 0, totalCost: 0 },
    );
  }, [bookings]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const resetForm = () => {
    setForm(initialForm);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    try {
      setSaving(true);
      setError('');
      const selectedKoc = targetKocs.find((creator) => `${creator.shop_id}:${creator.creator_open_id}` === form.creator_key);
      await createBooking({
        staff_name: form.staff_name.trim(),
        target_shop_id: selectedKoc?.shop_id,
        creator_open_id: selectedKoc?.creator_open_id,
        booking_cost: Number(form.booking_cost),
        deadline: form.deadline || null,
        note: form.note.trim() || null,
      });
      resetForm();
      await loadData();
    } catch (err) {
      setError(err.message || t('booking.errorCreate'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (booking) => {
    const confirmed = window.confirm(t('booking.deleteConfirm', { id: booking.id }));
    if (!confirmed) {
      return;
    }

    try {
      setDeletingId(booking.id);
      setError('');
      await deleteBooking(booking.id);
      if (selectedBooking?.id === booking.id) {
        setSelectedBooking(null);
        setDetailForm(null);
      }
      await loadData();
    } catch (err) {
      setError(err.message || t('booking.errorDelete'));
    } finally {
      setDeletingId(null);
    }
  };

  const applyBooking = (updated) => {
    setBookings((items) => items.map((item) => (item.id === updated.id ? updated : item)));
    setSelectedBooking((current) => (current?.id === updated.id ? updated : current));
  };

  const changeStatus = async (booking, status) => {
    try {
      setUpdatingId(booking.id);
      setError('');
      applyBooking(await updateBooking(booking.id, { status }));
    } catch (err) {
      setError(err.message || t('booking.errorUpdate'));
    } finally {
      setUpdatingId(null);
    }
  };

  const openDetails = (booking) => {
    setSelectedBooking(booking);
    setDetailForm({
      status: booking.status || 'booked',
      deadline: booking.deadline || '',
      staff_name: booking.staff_name || booking.staff?.name || '',
      note: booking.note || '',
    });
  };

  const saveDetails = async (event) => {
    event.preventDefault();
    try {
      setUpdatingId(selectedBooking.id);
      setError('');
      const updated = await updateBooking(selectedBooking.id, {
        ...detailForm,
        deadline: detailForm.deadline || null,
        note: detailForm.note.trim() || null,
      });
      applyBooking(updated);
      setDetailForm({
        status: updated.status,
        deadline: updated.deadline || '',
        staff_name: updated.staff_name || '',
        note: updated.note || '',
      });
    } catch (err) {
      setError(err.message || t('booking.errorUpdate'));
    } finally {
      setUpdatingId(null);
    }
  };

  const formatDate = (value, includeTime = false) => value
    ? new Intl.DateTimeFormat(language === 'vi' ? 'vi-VN' : 'en-US', includeTime
      ? { dateStyle: 'short', timeStyle: 'short' }
      : { dateStyle: 'short' }).format(new Date(value))
    : '—';

  const bookingVideos = (booking) => {
    const value = booking?.video_url;
    if (!value) return [];
    try {
      const parsed = JSON.parse(value);
      return (Array.isArray(parsed) ? parsed : [parsed]).map((item) => (
        typeof item === 'string' ? { title: item, video_url: item } : item
      ));
    } catch {
      return [{ title: value, video_url: value }];
    }
  };

  const selectedTargetCreator = selectedBooking
    ? targetKocsByKey.get(`${selectedBooking.target_shop_id}:${selectedBooking.creator_open_id}`)
    : null;
  const selectedCreatorName = selectedBooking ? getKocDisplayName(
    selectedTargetCreator?.nickname
    || selectedBooking.creator_name
    || selectedBooking.creator?.name
    || selectedTargetCreator?.username
    || selectedBooking.creator_username
    || selectedBooking.creator_id,
  ) : '';
  const selectedCreatorUsername = selectedTargetCreator?.username || selectedBooking?.creator_username;
  const selectedCreatorAvatar = selectedTargetCreator?.avatar_url || selectedBooking?.creator_avatar_url;

  return (
    <div className="page">
      <section className="page__hero">
        <h1 className="page__title">{t('booking.heroTitle') || heroTitle}</h1>
        <div className="page__stats booking-stats">
          <article className="stat-card">
            <p className="stat-card__label">{t('booking.activeBookings')}</p>
            <p className="stat-card__value">{stats.active}</p>
          </article>
          <article className="stat-card">
            <p className="stat-card__label">{t('booking.waitingVideo')}</p>
            <p className="stat-card__value">{stats.waitingVideo}</p>
          </article>
          <article className="stat-card">
            <p className="stat-card__label">{t('booking.overdue')}</p>
            <p className="stat-card__value">{stats.overdue}</p>
          </article>
          <article className="stat-card">
            <p className="stat-card__label">{t('booking.completed')}</p>
            <p className="stat-card__value">{stats.done}</p>
          </article>
          <article className="stat-card">
            <p className="stat-card__label">{t('booking.totalCost')}</p>
            <p className="stat-card__value">RM {localizedFormatMoney(stats.totalCost)}</p>
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
            <h2 className="section-card__title">{t('booking.createBooking')}</h2>
          </div>
        </div>

        <form className="filter-panel" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="staff_name">{t('booking.bookingStaff')}</label>
            <input id="staff_name" name="staff_name" type="text" value={form.staff_name} onChange={handleChange} placeholder={t('booking.enterStaff')} required />
          </div>
          <div className="field">
            <label htmlFor="creator_key">{t('booking.koc')}</label>
            <TargetKocCombobox creators={targetKocs} value={form.creator_key} onChange={(creatorKey) => setForm((current) => ({ ...current, creator_key: creatorKey }))} placeholder={t('booking.searchKoc')} noResults={t('booking.noKocMatch')} />
          </div>
          <div className="field">
            <label htmlFor="booking_cost">{t('booking.bookingCost')}</label>
            <input
              id="booking_cost"
              name="booking_cost"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={form.booking_cost}
              onChange={handleChange}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="deadline">{t('booking.deadline')}</label>
            <input id="deadline" name="deadline" type="date" value={form.deadline} onChange={handleChange} />
          </div>
          <div className="field booking-create-note">
            <label htmlFor="note">{t('booking.note')}</label>
            <input id="note" name="note" type="text" value={form.note} onChange={handleChange} placeholder={t('booking.notePlaceholder')} />
          </div>
          <div className="actions">
            <button className="button" type="submit" disabled={saving}>
              {saving ? t('booking.submitting') : t('booking.submit')}
            </button>
          </div>
        </form>
      </section>

      <section className="section-card">
        <div className="section-card__header">
          <div>
            <h2 className="section-card__title">{t('booking.list')}</h2>
          </div>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th className="cell-number">ID</th>
                <th>{t('booking.kocColumn')}</th>
                <th>{t('booking.statusColumn')}</th>
                <th>{t('booking.deadlineColumn')}</th>
                <th className="cell-number">{t('booking.costColumn')}</th>
                <th className="cell-actions">{t('booking.actionsColumn')}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr className="table-state-row">
                  <td className="table-state-cell" colSpan={6}>
                    <div className="empty-state table-empty-state">
                      <div className="loading-dot" />
                      <div>{t('booking.loading')}</div>
                    </div>
                  </td>
                </tr>
              ) : bookings.length ? (
                bookings.map((booking) => {
                  const currentCreator = targetKocsByKey.get(`${booking.target_shop_id}:${booking.creator_open_id}`);
                  const creatorName = getKocDisplayName(
                    currentCreator?.nickname
                    || booking.creator_name
                    || booking.creator?.name
                    || currentCreator?.username
                    || booking.creator_username
                    || booking.creator_id,
                  );
                  const creatorUsername = currentCreator?.username || booking.creator_username;
                  const creatorAvatar = currentCreator?.avatar_url || booking.creator_avatar_url;

                  return (
                    <tr key={booking.id}>
                      <td className="cell-number"><span className="row-title">#{booking.id}</span></td>
                      <td>
                        <div className="booking-koc-identity">
                          <TargetKocAvatar src={creatorAvatar} name={creatorName} />
                          <span>
                            <strong>{creatorName}</strong>
                            {creatorUsername ? <small>@{creatorUsername}</small> : null}
                          </span>
                        </div>
                      </td>
                      <td>
                        <select
                          className={`booking-status-select is-${booking.status}`}
                          value={booking.status || 'booked'}
                          disabled={updatingId === booking.id}
                          aria-label={t('booking.changeStatus', { id: booking.id })}
                          onChange={(event) => changeStatus(booking, event.target.value)}
                        >
                          {BOOKING_STATUSES.map((status) => <option value={status} key={status}>{t(`booking.statuses.${status}`)}</option>)}
                        </select>
                      </td>
                      <td>
                        <span className={`booking-deadline is-${bookingDeadlineState(booking)}`}>
                          {formatDate(booking.deadline)}
                          {bookingDeadlineState(booking) === 'overdue' ? <small>{t('booking.overdue')}</small> : null}
                          {bookingDeadlineState(booking) === 'soon' ? <small>{t('booking.dueSoon')}</small> : null}
                        </span>
                      </td>
                      <td className="cell-number">RM {localizedFormatMoney(booking.booking_cost)}</td>
                      <td className="cell-actions">
                        <div className="actions actions--inline">
                          <button type="button" className="button button--ghost button--small" onClick={() => openDetails(booking)}>{t('booking.details')}</button>
                          <button
                            type="button"
                            className="button button--ghost button--small"
                            onClick={() => handleDelete(booking)}
                            disabled={deletingId === booking.id}
                          >
                            {deletingId === booking.id ? t('booking.deleting') : t('booking.delete')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr className="table-state-row">
                  <td className="table-state-cell" colSpan={6}>
                    <div className="empty-state empty-state--compact table-empty-state">{t('booking.noData')}</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {selectedBooking && detailForm ? (
        <div className="koc-drawer-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            setSelectedBooking(null);
            setDetailForm(null);
          }
        }}>
          <aside className="koc-drawer booking-detail-drawer" role="dialog" aria-modal="true" aria-labelledby="booking-detail-title">
            <div className="koc-drawer__header">
              <div>
                <h2 id="booking-detail-title">{t('booking.detailTitle', { id: selectedBooking.id })}</h2>
                <p>{selectedCreatorUsername ? `@${selectedCreatorUsername}` : selectedCreatorName}</p>
              </div>
              <button className="button button--ghost" type="button" aria-label={t('common.close')} onClick={() => { setSelectedBooking(null); setDetailForm(null); }}>×</button>
            </div>
            <div className="koc-drawer__body">
              <section className="drawer-section">
                <div className="drawer-profile">
                  <TargetKocAvatar src={selectedCreatorAvatar} name={selectedCreatorName} />
                  <div><strong>{selectedCreatorName}</strong><span>RM {localizedFormatMoney(selectedBooking.booking_cost)}</span></div>
                </div>
              </section>
              <form className="booking-detail-form" onSubmit={saveDetails}>
                <label className="field"><span>{t('booking.statusColumn')}</span><select value={detailForm.status} onChange={(event) => setDetailForm((current) => ({ ...current, status: event.target.value }))}>{BOOKING_STATUSES.map((status) => <option value={status} key={status}>{t(`booking.statuses.${status}`)}</option>)}</select></label>
                <label className="field"><span>{t('booking.deadline')}</span><input type="date" value={detailForm.deadline} onChange={(event) => setDetailForm((current) => ({ ...current, deadline: event.target.value }))} /></label>
                <label className="field"><span>{t('booking.bookingStaff')}</span><input type="text" value={detailForm.staff_name} onChange={(event) => setDetailForm((current) => ({ ...current, staff_name: event.target.value }))} /></label>
                <label className="field booking-detail-form__wide"><span>{t('booking.note')}</span><textarea rows="5" value={detailForm.note} onChange={(event) => setDetailForm((current) => ({ ...current, note: event.target.value }))} /></label>
                <div className="actions booking-detail-form__wide"><button className="button" type="submit" disabled={updatingId === selectedBooking.id}>{updatingId === selectedBooking.id ? t('common.loading') : t('booking.saveChanges')}</button></div>
              </form>
              <section className="drawer-section">
                <h3>{t('booking.videoColumn')}</h3>
                <div className="drawer-list">
                  {bookingVideos(selectedBooking).map((video, index) => (
                    <div className="drawer-list__item" key={video.id || video.video_url || index}>
                      <strong>{video.title || video.platform_video_id || t('booking.videoColumn')}</strong>
                      {video.video_url ? <a href={video.video_url} target="_blank" rel="noreferrer">{t('booking.openVideo')}</a> : null}
                    </div>
                  ))}
                  {!bookingVideos(selectedBooking).length ? <div className="empty-state empty-state--compact">{t('booking.noVideo')}</div> : null}
                </div>
              </section>
            </div>
          </aside>
        </div>
      ) : null}

    </div>
  );
};

export default BookingManagement;
