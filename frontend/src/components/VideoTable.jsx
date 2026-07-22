import React, { useEffect, useMemo, useState } from 'react';
import { Heart, MessageCircle, Share2 } from 'lucide-react';
import { fetchChannels, fetchVideos } from '../lib/api';
import { useI18n } from '../lib/language';

const PAGE_SIZE = 20;
const getVideoHashtags = (video) => {
  const provided = Array.isArray(video.hashtags)
    ? video.hashtags
    : typeof video.hashtags === 'string'
      ? video.hashtags.split(/[\s,]+/)
      : [];
  const extracted = String(video.title || '').match(/#[\p{L}\p{N}_]+/gu) || [];
  return [...new Set([...provided, ...extracted]
    .map((tag) => String(tag || '').trim())
    .filter(Boolean)
    .map((tag) => tag.startsWith('#') ? tag : `#${tag}`))];
};

const VideoTable = ({ heroTitle }) => {
  const { t, language } = useI18n();
  const formatNumber = (value) => Number(value || 0).toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US');
  const [videos, setVideos] = useState([]);
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedChannelId, setSelectedChannelId] = useState('');
  const [isChannelDropdownOpen, setIsChannelDropdownOpen] = useState(false);
  const [page, setPage] = useState(1);

  const loadData = async (signal) => {
    const [loadedVideos, loadedChannels] = await Promise.all([
      fetchVideos(signal),
      fetchChannels(signal),
    ]);

    setVideos(loadedVideos);
    setChannels(loadedChannels);
    setSelectedChannelId((current) => (
      loadedChannels.some((channel) => String(channel.id) === current)
        ? current
        : String(loadedChannels[0]?.id || '')
    ));
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
          setError(err.message || t('videoLibrary.loadError'));
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
    const handleClickOutside = (event) => {
      if (!event.target.closest('.channel-picker')) {
        setIsChannelDropdownOpen(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const filteredVideos = useMemo(() => {
    if (!selectedChannelId) return [];
    return videos.filter((video) => String(video.channel_id) === selectedChannelId);
  }, [videos, selectedChannelId]);

  const filteredTotals = useMemo(() => {
    return filteredVideos.reduce((acc, video) => {
      acc.views += Number(video.views || 0);
      acc.likes += Number(video.likes || 0);
      acc.comments += Number(video.comments || 0);
      acc.shares += Number(video.shares || 0);
      return acc;
    }, { views: 0, likes: 0, comments: 0, shares: 0 });
  }, [filteredVideos]);

  const pageCount = Math.max(1, Math.ceil(filteredVideos.length / PAGE_SIZE));
  const paginatedVideos = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredVideos.slice(start, start + PAGE_SIZE);
  }, [filteredVideos, page]);

  useEffect(() => {
    setPage(1);
  }, [selectedChannelId]);

  const selectedChannel = useMemo(() => {
    return channels.find((channel) => String(channel.id) === selectedChannelId) || null;
  }, [channels, selectedChannelId]);

  const selectedChannelLabel = selectedChannel
    ? selectedChannel.display_name || selectedChannel.username || t('videoLibrary.channel')
    : t('videoLibrary.noChannels');

  return (
    <div className="page">
      <section className="page__hero">
        <h1 className="page__title">{t('videoLibrary.heroTitle') || heroTitle}</h1>
        <div className="page__stats page__stats--four">
          <article className="stat-card">
            <p className="stat-card__label">{t('videoLibrary.videos')}</p>
            <p className="stat-card__value">{filteredVideos.length}</p>
          </article>
          <article className="stat-card">
            <p className="stat-card__label">{t('videoLibrary.views')}</p>
            <p className="stat-card__value">{formatNumber(filteredTotals.views)}</p>
          </article>
          <article className="stat-card">
            <p className="stat-card__label">{t('videoLibrary.likes')}</p>
            <p className="stat-card__value">{formatNumber(filteredTotals.likes)}</p>
          </article>
          <article className="stat-card">
            <p className="stat-card__label">{t('videoLibrary.shares')}</p>
            <p className="stat-card__value">{formatNumber(filteredTotals.shares)}</p>
          </article>
        </div>
      </section>

      {error ? <section className="section-card empty-state empty-state--compact">{error}</section> : null}

      <section className="section-card">
        <div className="section-card__header">
          <div className="chip-row">
            <span className="chip chip--blue">{t('videoLibrary.channels', { count: channels.length })}</span>
          </div>
        </div>

        <div className="filter-panel filter-panel--compact">
          <div className="field">
            <label htmlFor="channel-filter">{t('videoLibrary.channel')}</label>
            <div className="channel-picker">
              <button
                className="channel-picker__trigger"
                type="button"
                aria-haspopup="listbox"
                aria-expanded={isChannelDropdownOpen}
                disabled={!channels.length}
                onClick={() => setIsChannelDropdownOpen((current) => !current)}
              >
                <span className="channel-picker__current">
                  {selectedChannel?.avatar_url ? (
                    <img
                      className="channel-picker__avatar"
                      src={selectedChannel.avatar_url}
                      alt={selectedChannelLabel}
                      loading="lazy"
                    />
                  ) : (
                    <span className="channel-picker__avatar channel-picker__avatar--empty" aria-hidden="true">
                      CH
                    </span>
                  )}
                  <span className="channel-picker__label">{selectedChannelLabel}</span>
                </span>
                <span className={`sidebar__chevron channel-picker__chevron ${isChannelDropdownOpen ? 'sidebar__chevron--open' : ''}`} aria-hidden="true" />
              </button>

              {isChannelDropdownOpen ? (
                <div className="channel-picker__menu" role="listbox">
                  {channels.map((channel) => {
                    const isActive = String(channel.id) === selectedChannelId;
                    return (
                      <button
                        key={channel.id}
                        className={`channel-picker__option ${isActive ? 'channel-picker__option--active' : ''}`}
                        type="button"
                        role="option"
                        aria-selected={isActive}
                        onClick={() => {
                          setSelectedChannelId(String(channel.id));
                          setIsChannelDropdownOpen(false);
                        }}
                      >
                        {channel.avatar_url ? (
                          <img
                            className="channel-picker__option-avatar"
                            src={channel.avatar_url}
                            alt={channel.display_name || channel.username || t('videoLibrary.channelAvatar')}
                            loading="lazy"
                          />
                        ) : (
                          <span className="channel-picker__option-avatar channel-picker__option-avatar--empty" aria-hidden="true">
                            CH
                          </span>
                        )}
                        <span className="channel-picker__option-meta">
                          <span className="channel-picker__option-title">{channel.display_name || channel.username || channel.id}</span>
                          {channel.username ? (
                            <span className="channel-picker__option-subtitle">@{channel.username}</span>
                          ) : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('videoLibrary.videos')}</th>
                <th>{t('videoLibrary.hashtags')}</th>
                <th className="cell-number">{t('videoLibrary.views')}</th>
                <th className="cell-number">{t('videoLibrary.engagement')}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr className="table-state-row">
                  <td className="table-state-cell" colSpan={4}>
                    <div className="empty-state table-empty-state">
                      <div className="loading-dot" />
                      <div>{t('videoLibrary.loading')}</div>
                    </div>
                  </td>
                </tr>
              ) : filteredVideos.length ? (
                paginatedVideos.map((video) => {
                  const hashtags = getVideoHashtags(video);
                  const displayTitle = String(video.title || '')
                    .replace(/#[\p{L}\p{N}_]+/gu, '')
                    .replace(/\s+/g, ' ')
                    .trim() || t('videoLibrary.untitledVideo');
                  return <tr key={video.id}>
                    <td>
                      <div className="video-cell">
                        {video.thumbnail_url ? (
                          video.video_url ? (
                            <a
                              className="video-cell__thumb-link"
                              href={video.video_url}
                              target="_blank"
                              rel="noreferrer"
                              aria-label={t('videoLibrary.openVideo', { title: displayTitle })}
                            >
                              <img
                                className="video-cell__thumb"
                                src={video.thumbnail_url}
                                alt={displayTitle}
                                loading="lazy"
                              />
                            </a>
                          ) : (
                            <img
                              className="video-cell__thumb"
                              src={video.thumbnail_url}
                              alt={displayTitle}
                              loading="lazy"
                            />
                          )
                        ) : (
                          <div className="video-cell__thumb video-cell__thumb--empty" aria-hidden="true">
                            {t('videoLibrary.noThumbnail')}
                          </div>
                        )}
                        <div className="video-cell__meta">
                          <span className="row-title">{displayTitle}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      {hashtags.length ? (
                        <div className="video-hashtags" title={hashtags.join(' ')}>
                          {hashtags.slice(0, 3).map((hashtag) => <span className="chip" key={hashtag}>{hashtag}</span>)}
                          {hashtags.length > 3 ? <span className="chip">+{hashtags.length - 3}</span> : null}
                        </div>
                      ) : '—'}
                    </td>
                    <td className="cell-number">{formatNumber(video.views)}</td>
                    <td className="cell-number">
                      <div className="video-engagement">
                        <span title={t('videoLibrary.likes')} aria-label={`${t('videoLibrary.likes')}: ${formatNumber(video.likes)}`}>
                          <Heart size={15} strokeWidth={1.8} aria-hidden="true" />
                          {formatNumber(video.likes)}
                        </span>
                        <span title={t('videoLibrary.comments')} aria-label={`${t('videoLibrary.comments')}: ${formatNumber(video.comments)}`}>
                          <MessageCircle size={15} strokeWidth={1.8} aria-hidden="true" />
                          {formatNumber(video.comments)}
                        </span>
                        <span title={t('videoLibrary.shares')} aria-label={`${t('videoLibrary.shares')}: ${formatNumber(video.shares)}`}>
                          <Share2 size={15} strokeWidth={1.8} aria-hidden="true" />
                          {formatNumber(video.shares)}
                        </span>
                      </div>
                    </td>
                  </tr>;
                })
              ) : (
                <tr className="table-state-row">
                  <td className="table-state-cell" colSpan={4}>
                    <div className="empty-state empty-state--compact table-empty-state">
                      <div>{t('videoLibrary.noMatch')}</div>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {filteredVideos.length > PAGE_SIZE ? (
          <nav className="table-pagination" aria-label={t('videoLibrary.pagination')}>
            <span>{t('videoLibrary.pageOf', { page, total: pageCount })}</span>
            <div className="actions actions--inline">
              <button className="button button--small button--ghost" type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
                {t('common.previous')}
              </button>
              <button className="button button--small button--ghost" type="button" disabled={page >= pageCount} onClick={() => setPage((current) => current + 1)}>
                {t('common.next')}
              </button>
            </div>
          </nav>
        ) : null}
      </section>
    </div>
  );
};

export default VideoTable;
