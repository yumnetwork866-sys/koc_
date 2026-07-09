import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  createBooking,
  deleteBooking,
  fetchBookings,
  fetchVideos,
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

const getChannelAvatarText = (channel) => {
  const source = String(channel?.display_name || channel?.username || `Channel ${channel?.id || ''}` || 'CH').trim();
  const parts = source.split(/\s+/).filter(Boolean);
  const initials = parts.length >= 2
    ? `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`
    : source.slice(0, 2);
  return initials.toUpperCase();
};

const BookingManagement = ({ heroTitle, heroSubtitle }) => {
  const { t, language } = useI18n();
  const [bookings, setBookings] = useState([]);
  const [users, setUsers] = useState([]);
  const [videos, setVideos] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [selectedVideoIds, setSelectedVideoIds] = useState([]);
  const [selectedChannelId, setSelectedChannelId] = useState('all');
  const [videoSearch, setVideoSearch] = useState('');
  const [isChannelDropdownOpen, setIsChannelDropdownOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [isVideoPickerOpen, setIsVideoPickerOpen] = useState(false);
  const [error, setError] = useState('');

  const loadData = async (signal) => {
    const [loadedBookings, loadedUsers] = await Promise.all([
      fetchBookings(signal),
      fetchUsers(signal),
    ]);

    setBookings(loadedBookings);
    setUsers(loadedUsers);

    try {
      const loadedVideos = await fetchVideos(signal);
      setVideos(loadedVideos);
    } catch (videoError) {
      if (videoError.name !== 'AbortError') {
        console.error('Failed to load videos for booking picker:', videoError);
      }
    }
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

  const kocUsers = useMemo(() => users.filter((user) => user.role === 'koc'), [users]);
  const staffUsers = useMemo(() => users.filter((user) => user.role !== 'koc'), [users]);
  const localizedFormatMoney = (value) => Number(value || 0).toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US');

  const userNameById = useMemo(() => {
    return new Map(users.map((user) => [String(user.id), user.name]));
  }, [users]);

  const selectedVideos = useMemo(
    () => videos.filter((video) => selectedVideoIds.includes(String(video.id))),
    [selectedVideoIds, videos],
  );

  const channelOptions = useMemo(() => {
    const map = new Map();

    for (const video of videos) {
      const channelId = String(video.channel?.id || video.channel_id || '');
      if (!channelId) continue;
      if (!map.has(channelId)) {
        map.set(channelId, {
          id: channelId,
          label: video.channel?.display_name || video.channel?.username || `Channel ${channelId}`,
          username: video.channel?.username || '',
          avatarUrl: video.channel?.avatar_url || '',
          avatarText: getChannelAvatarText(video.channel || { id: channelId }),
        });
      }
    }

    return Array.from(map.values());
  }, [videos]);

  const filteredPickerVideos = useMemo(() => {
    const query = videoSearch.trim().toLowerCase();

    return videos.filter((video) => {
      const channelId = String(video.channel?.id || video.channel_id || '');
      const matchesChannel = selectedChannelId === 'all' || channelId === selectedChannelId;
      if (!matchesChannel) return false;

      if (!query) return true;

      const haystack = [
        video.title,
        video.platform_video_id,
        video.video_url,
        video.channel?.display_name,
        video.channel?.username,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [selectedChannelId, videoSearch, videos]);

  const filteredPickerVideoIds = useMemo(
    () => filteredPickerVideos.map((video) => String(video.id)),
    [filteredPickerVideos],
  );

  const filteredPickerSelectedCount = useMemo(
    () => filteredPickerVideoIds.filter((id) => selectedVideoIds.includes(id)).length,
    [filteredPickerVideoIds, selectedVideoIds],
  );

  const isAllFilteredSelected = filteredPickerVideoIds.length > 0
    && filteredPickerSelectedCount === filteredPickerVideoIds.length;

  const isSomeFilteredSelected = filteredPickerSelectedCount > 0 && !isAllFilteredSelected;

  const selectedVideoLabel = selectedVideos.length
    ? `${t('booking.selectedVideos')} (${selectedVideos.length})`
    : t('booking.chooseVideos');

  const selectedChannel = useMemo(
    () => channelOptions.find((channel) => String(channel.id) === String(selectedChannelId)) || null,
    [channelOptions, selectedChannelId],
  );

  const channelDropdownRef = useRef(null);

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
    setSelectedVideoIds([]);
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
        video_url: selectedVideos.length ? selectedVideos : null,
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

  const handleVideoToggle = (videoId) => {
    setSelectedVideoIds((current) => {
      const nextId = String(videoId);
      if (current.includes(nextId)) {
        return current.filter((id) => id !== nextId);
      }
      return [...current, nextId];
    });
  };

  const handleToggleAllFilteredVideos = () => {
    setSelectedVideoIds((current) => {
      if (!filteredPickerVideoIds.length) return current;
      const currentSet = new Set(current);

      if (filteredPickerVideoIds.every((id) => currentSet.has(id))) {
        const filteredSet = new Set(filteredPickerVideoIds);
        return current.filter((id) => !filteredSet.has(id));
      }

      return Array.from(new Set([...current, ...filteredPickerVideoIds]));
    });
  };

  const handleCloseVideoPicker = () => {
    setIsVideoPickerOpen(false);
  };

  const handleSelectChannel = (channelId) => {
    setSelectedChannelId(channelId);
    setIsChannelDropdownOpen(false);
  };

  useEffect(() => {
    if (!isChannelDropdownOpen) return undefined;

    const handlePointerDown = (event) => {
      if (channelDropdownRef.current && !channelDropdownRef.current.contains(event.target)) {
        setIsChannelDropdownOpen(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsChannelDropdownOpen(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isChannelDropdownOpen]);

  return (
    <div className="page">
      <section className="page__hero">
        <h1 className="page__title">{t('booking.heroTitle') || heroTitle}</h1>
        <p className="page__subtitle">{t('booking.heroSubtitle') || heroSubtitle}</p>
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
            <p className="section-card__meta">{t('booking.createBookingMeta')}</p>
          </div>
        </div>

        <form className="filter-panel" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="staff_id">{t('booking.bookingStaff')}</label>
            <select id="staff_id" name="staff_id" value={form.staff_id} onChange={handleChange} required>
              <option value="">{t('booking.selectStaff')}</option>
              {staffUsers.map((user) => (
                <option key={user.id} value={user.id}>{user.name} ({user.role})</option>
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
          <div className="field">
            <label>{t('booking.videoLink')}</label>
            <button
              type="button"
              className="button button--ghost booking-video-button"
              aria-haspopup="dialog"
              aria-expanded={isVideoPickerOpen}
              onClick={() => setIsVideoPickerOpen(true)}
            >
              {selectedVideoLabel}
            </button>
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
                <th>{t('booking.videoColumn')}</th>
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
                  const bookingVideos = parseBookingVideos(booking.video_url);

                  return (
                    <tr key={booking.id}>
                      <td className="cell-number"><span className="row-title">#{booking.id}</span></td>
                      <td>{booking.creator?.name || userNameById.get(String(booking.creator_id)) || booking.creator_id}</td>
                      <td className="cell-number">{localizedFormatMoney(booking.booking_cost)}</td>
                      <td>{booking.deadline || '-'}</td>
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
                  <td className="table-state-cell" colSpan={6}>
                    <div className="empty-state empty-state--compact table-empty-state">{t('booking.noData')}</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {isVideoPickerOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={handleCloseVideoPicker}>
          <div
            className="modal-card booking-video-picker"
            role="dialog"
            aria-modal="true"
            aria-labelledby="booking-video-picker-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="section-card__header">
              <div>
                <h2 className="section-card__title" id="booking-video-picker-title">
                  {t('booking.videoModalTitle')}
                </h2>
              </div>
              <label className="booking-video-picker__select-all-inline">
                <input
                  type="checkbox"
                  checked={isAllFilteredSelected}
                  ref={(input) => {
                    if (input) input.indeterminate = isSomeFilteredSelected;
                  }}
                  onChange={handleToggleAllFilteredVideos}
                  disabled={!filteredPickerVideoIds.length}
                />
                <span>
                  {isAllFilteredSelected
                    ? t('booking.videoModalDeselectAll')
                    : t('booking.videoModalSelectAll')}
                </span>
              </label>
            </div>

            <div className="booking-video-picker__filters">
              <div className="field" ref={channelDropdownRef}>
                <label htmlFor="booking-video-channel-filter">{t('booking.channelFilter')}</label>
                <div className="booking-video-channel-picker">
                  <button
                    type="button"
                    className="booking-video-channel-picker__trigger"
                    aria-haspopup="listbox"
                    aria-expanded={isChannelDropdownOpen}
                    onClick={() => setIsChannelDropdownOpen((current) => !current)}
                  >
                    <span className="booking-video-channel-picker__current">
                      <span className="booking-video-channel-picker__avatar" aria-hidden="true">
                        {selectedChannel?.avatarUrl ? (
                          <img src={selectedChannel.avatarUrl} alt="" loading="lazy" />
                        ) : (
                          selectedChannel?.avatarText || getChannelAvatarText(null)
                        )}
                      </span>
                      <span className="booking-video-channel-picker__name">
                        {selectedChannel?.label || t('booking.allChannels')}
                      </span>
                    </span>
                    <span className={`sidebar__chevron booking-video-channel-picker__chevron ${isChannelDropdownOpen ? 'sidebar__chevron--open' : ''}`} aria-hidden="true" />
                  </button>

                  {isChannelDropdownOpen ? (
                    <div className="booking-video-channel-picker__menu" role="listbox">
                      <button
                        type="button"
                        className={`booking-video-channel-picker__option${selectedChannelId === 'all' ? ' booking-video-channel-picker__option--active' : ''}`}
                        role="option"
                        aria-selected={selectedChannelId === 'all'}
                        onClick={() => handleSelectChannel('all')}
                      >
                        <span className="booking-video-channel-picker__avatar booking-video-channel-picker__avatar--empty" aria-hidden="true">
                          {getChannelAvatarText({ id: 'all', display_name: t('booking.allChannels') })}
                        </span>
                        <span className="booking-video-channel-picker__name">{t('booking.allChannels')}</span>
                      </button>

                      {channelOptions.map((channel) => (
                        <button
                          key={channel.id}
                          type="button"
                          className={`booking-video-channel-picker__option${String(channel.id) === String(selectedChannelId) ? ' booking-video-channel-picker__option--active' : ''}`}
                          role="option"
                          aria-selected={String(channel.id) === String(selectedChannelId)}
                          onClick={() => handleSelectChannel(String(channel.id))}
                        >
                          <span className="booking-video-channel-picker__avatar" aria-hidden="true">
                            {channel.avatarUrl ? (
                              <img src={channel.avatarUrl} alt="" loading="lazy" />
                            ) : (
                              channel.avatarText
                            )}
                          </span>
                          <span className="booking-video-channel-picker__name">{channel.label}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="field">
                <label htmlFor="booking-video-search">{t('booking.searchVideos')}</label>
                <input
                  id="booking-video-search"
                  type="search"
                  value={videoSearch}
                  onChange={(event) => setVideoSearch(event.target.value)}
                  placeholder={t('booking.searchVideosPlaceholder')}
                />
              </div>
            </div>

            <div className="booking-video-picker__list" role="list" aria-label={t('booking.videoModalTitle')}>
              {filteredPickerVideos.length ? (
                filteredPickerVideos.map((video) => {
                  const isSelected = selectedVideoIds.includes(String(video.id));
                  return (
                    <label
                      key={video.id}
                      className={`booking-video-picker__item${isSelected ? ' booking-video-picker__item--selected' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleVideoToggle(video.id)}
                      />
                      {video.thumbnail_url ? (
                        <img
                          className="booking-video-picker__thumb"
                          src={video.thumbnail_url}
                          alt=""
                          loading="lazy"
                        />
                      ) : (
                        <span className="booking-video-picker__thumb booking-video-picker__thumb--empty" aria-hidden="true">
                          Video
                        </span>
                      )}
                      <span className="booking-video-picker__avatar" aria-hidden="true">
                        {video.channel?.avatar_url ? (
                          <img src={video.channel.avatar_url} alt="" loading="lazy" />
                        ) : (
                          getChannelAvatarText(video.channel || { id: video.channel_id })
                        )}
                      </span>
                      <span className="booking-video-picker__meta">
                        <strong>{video.title || video.platform_video_id || video.video_url}</strong>
                        <span className="booking-video-picker__channel">
                          {video.channel?.display_name || video.channel?.username || `Channel ${video.channel_id || ''}`}
                        </span>
                      </span>
                    </label>
                  );
                })
              ) : (
                <div className="empty-state empty-state--compact table-empty-state">
                  {videos.length ? t('booking.noVideosMatch') : t('booking.noVideosAvailable')}
                </div>
              )}
            </div>

            <div className="modal-card__actions">
              <button type="button" className="button button--ghost" onClick={handleCloseVideoPicker}>
                {t('common.cancel')}
              </button>
              <button type="button" className="button" onClick={handleCloseVideoPicker}>
                {t('booking.videoModalDone')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default BookingManagement;
