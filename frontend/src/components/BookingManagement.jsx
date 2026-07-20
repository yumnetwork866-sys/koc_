import React, { useEffect, useMemo, useState } from 'react';
import {
  createBooking,
  deleteBooking,
  fetchBookings,
  fetchUsers,
} from '../lib/api';
import { useI18n } from '../lib/language';

const initialForm = {
  staff_id: '',
  creator_id: '',
  booking_cost: '',
  deadline: '',
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

const BookingManagement = ({ heroTitle, heroSubtitle }) => {
  const { t, language } = useI18n();
  const [bookings, setBookings] = useState([]);
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState('');

  const loadData = async (signal) => {
    const [loadedBookings, loadedUsers] = await Promise.all([
      fetchBookings(signal),
      fetchUsers(signal),
    ]);

    setBookings(loadedBookings);
    setUsers(loadedUsers);
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
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const creatorId = params.get('creator_id');
    if (creatorId) setForm((current) => ({ ...current, creator_id: creatorId }));
    window.history.replaceState({}, '', window.location.pathname);
  }, []);

  const kocUsers = useMemo(() => users.filter((user) => user.role === 'koc'), [users]);
  const staffUsers = useMemo(() => users.filter((user) => user.role !== 'koc'), [users]);
  const localizedFormatMoney = (value) => Number(value || 0).toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US');

  const userNameById = useMemo(() => {
    return new Map(users.map((user) => [String(user.id), user.name]));
  }, [users]);

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
      await createBooking({
        staff_id: Number(form.staff_id),
        creator_id: Number(form.creator_id),
        booking_cost: Number(form.booking_cost),
        deadline: form.deadline,
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
            <p className="stat-card__value">{kocUsers.length}</p>
          </article>
          <article className="stat-card">
            <p className="stat-card__label">{t('booking.staff')}</p>
            <p className="stat-card__value">{staffUsers.length}</p>
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
            <label htmlFor="staff_id">{t('booking.bookingStaff')}</label>
            <select id="staff_id" name="staff_id" value={form.staff_id} onChange={handleChange} required>
              <option value="">{t('booking.selectStaff')}</option>
              {staffUsers.map((user) => (
                <option key={user.id} value={user.id}>{user.name}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="creator_id">{t('booking.koc')}</label>
            <select id="creator_id" name="creator_id" value={form.creator_id} onChange={handleChange} required>
              <option value="">{t('booking.selectKoc')}</option>
              {kocUsers.map((user) => (
                <option key={user.id} value={user.id}>{user.name}</option>
              ))}
            </select>
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
          <div className="field">
            <label htmlFor="deadline">{t('booking.deadline')}</label>
            <input id="deadline" name="deadline" type="date" value={form.deadline} onChange={handleChange} required />
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
                <th className="cell-number">{t('booking.costColumn')}</th>
                <th>{t('booking.deadlineColumn')}</th>
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
                      <td>{getKocDisplayName(booking.creator?.name || userNameById.get(String(booking.creator_id)) || booking.creator_id)}</td>
                      <td className="cell-number">{localizedFormatMoney(booking.booking_cost)}</td>
                      <td>{booking.deadline || '-'}</td>
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
