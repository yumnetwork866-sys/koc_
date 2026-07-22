import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  createBooking,
  deleteBooking,
  fetchBookingTargetKocs,
  fetchBookings,
} from '../lib/api';
import { useI18n } from '../lib/language';

const initialForm = {
  staff_name: '',
  creator_key: '',
  booking_cost: '',
};

const normalizeBookingVideo = (video) => ({
  id: video?.id,
  title: video?.title || '',
  video_url: video?.video_url || '',
  thumbnail_url: video?.thumbnail_url || '',
  platform: video?.platform || '',
  platform_video_id: video?.platform_video_id || '',
});

const parseBookingVideos = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(normalizeBookingVideo).filter((video) => video.id || video.video_url || video.title);

  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) return [];

    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return parsed.map(normalizeBookingVideo).filter((video) => video.id || video.video_url || video.title);
      }
      if (parsed && typeof parsed === 'object') {
        return [normalizeBookingVideo(parsed)];
      }
    } catch {
      // fall through and treat as a legacy single link
    }

    return [normalizeBookingVideo({ title: text, video_url: text })];
  }

  if (typeof value === 'object') {
    return [normalizeBookingVideo(value)];
  }

  return [];
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
  const staffCount = useMemo(() => new Set(bookings.map((booking) => booking.staff_name || booking.staff?.name).filter(Boolean)).size, [bookings]);

  const stats = useMemo(() => {
    return bookings.reduce(
      (acc, booking) => {
        acc.total += 1;
        acc.totalCost += Number(booking.booking_cost || 0);
        return acc;
      },
      { total: 0, totalCost: 0 },
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
      await loadData();
    } catch (err) {
      setError(err.message || t('booking.errorDelete'));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="page">
      <section className="page__hero">
        <h1 className="page__title">{t('booking.heroTitle') || heroTitle}</h1>
        <div className="page__stats page__stats--four">
          <article className="stat-card">
            <p className="stat-card__label">{t('booking.bookings')}</p>
            <p className="stat-card__value">{stats.total}</p>
          </article>
          <article className="stat-card">
            <p className="stat-card__label">{t('booking.koc')}</p>
            <p className="stat-card__value">{targetKocs.length}</p>
          </article>
          <article className="stat-card">
            <p className="stat-card__label">{t('booking.staff')}</p>
            <p className="stat-card__value">{staffCount}</p>
          </article>
          <article className="stat-card">
            <p className="stat-card__label">{t('booking.totalCost')}</p>
            <p className="stat-card__value">{localizedFormatMoney(stats.totalCost)}</p>
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
              step="1000"
              value={form.booking_cost}
              onChange={handleChange}
              required
            />
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
                <th>{t('booking.staffColumn')}</th>
                <th>{t('booking.kocColumn')}</th>
                <th className="cell-number">{t('booking.costColumn')}</th>
                <th className="cell-number">{t('booking.viewsColumn')}</th>
                <th className="cell-number">{t('booking.likesColumn')}</th>
                <th className="cell-number">{t('booking.sharesColumn')}</th>
                <th>{t('booking.videoColumn')}</th>
                <th className="cell-actions">{t('booking.actionsColumn')}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr className="table-state-row">
                  <td className="table-state-cell" colSpan={9}>
                    <div className="empty-state table-empty-state">
                      <div className="loading-dot" />
                      <div>{t('booking.loading')}</div>
                    </div>
                  </td>
                </tr>
              ) : bookings.length ? (
                bookings.map((booking) => {
                  const bookingVideos = parseBookingVideos(booking.video_url);
                  const bookingVideoStats = bookingVideos.reduce((acc, video) => {
                    acc.views += Number(video.views || 0);
                    acc.likes += Number(video.likes || 0);
                    acc.shares += Number(video.shares || 0);
                    return acc;
                  }, { views: 0, likes: 0, shares: 0 });

                  return (
                    <tr key={booking.id}>
                      <td className="cell-number"><span className="row-title">#{booking.id}</span></td>
                      <td>{booking.staff_name || booking.staff?.name || '—'}</td>
                      <td>{getKocDisplayName(booking.creator_name || booking.creator?.name || booking.creator_username || booking.creator_id)}</td>
                      <td className="cell-number">{localizedFormatMoney(booking.booking_cost)}</td>
                      <td className="cell-number">{localizedFormatMoney(bookingVideoStats.views)}</td>
                      <td className="cell-number">{localizedFormatMoney(bookingVideoStats.likes)}</td>
                      <td className="cell-number">{localizedFormatMoney(bookingVideoStats.shares)}</td>
                      <td>
                        <div className="booking-video-list">
                          {bookingVideos.length ? (
                            bookingVideos.map((video) => (
                              <a
                                key={`${booking.id}-${video.id || video.video_url || video.title}`}
                                className="booking-video-list__item"
                                href={video.video_url || '#'}
                                target={video.video_url ? '_blank' : undefined}
                                rel={video.video_url ? 'noreferrer' : undefined}
                                onClick={video.video_url ? undefined : (event) => event.preventDefault()}
                              >
                                <span className="booking-video-list__title">
                                  {video.title || video.platform_video_id || video.video_url}
                                </span>
                              </a>
                            ))
                          ) : (
                            <div className="row-subtitle">{t('booking.noVideo')}</div>
                          )}
                        </div>
                      </td>
                      <td className="cell-actions">
                        <div className="actions actions--inline">
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
                  <td className="table-state-cell" colSpan={9}>
                    <div className="empty-state empty-state--compact table-empty-state">{t('booking.noData')}</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

    </div>
  );
};

export default BookingManagement;
