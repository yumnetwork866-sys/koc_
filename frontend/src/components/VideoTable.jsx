import React, { useEffect, useMemo, useState } from 'react';
import { fetchChannels, fetchProducts, fetchVideos } from '../lib/api';
import { getPlatformLabel } from '../lib/platforms';
import { useI18n } from '../lib/language';

const VideoTable = ({ heroTitle }) => {
  const { t, language } = useI18n();
  const formatNumber = (value) => Number(value || 0).toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US');
  const [videos, setVideos] = useState([]);
  const [channels, setChannels] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedChannelId, setSelectedChannelId] = useState('all');
  const [isChannelDropdownOpen, setIsChannelDropdownOpen] = useState(false);

  const loadData = async (signal) => {
    const [loadedVideos, loadedChannels, loadedProducts] = await Promise.all([
      fetchVideos(signal),
      fetchChannels(signal),
      fetchProducts(signal),
    ]);

    setVideos(loadedVideos);
    setChannels(loadedChannels);
    setProducts(loadedProducts);
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
    if (selectedChannelId === 'all') {
      return videos;
    }

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

  const selectedChannel = useMemo(() => {
    if (selectedChannelId === 'all') {
      return null;
    }

    return channels.find((channel) => String(channel.id) === selectedChannelId) || null;
  }, [channels, selectedChannelId]);

  const selectedChannelLabel = selectedChannel
    ? selectedChannel.display_name || selectedChannel.username || t('videoLibrary.channel')
    : t('videoLibrary.allChannels');

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
            <span className="chip chip--positive">{t('videoLibrary.products', { count: products.length })}</span>
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
                  <button
                    className={`channel-picker__option ${selectedChannelId === 'all' ? 'channel-picker__option--active' : ''}`}
                    type="button"
                    role="option"
                    aria-selected={selectedChannelId === 'all'}
                    onClick={() => {
                      setSelectedChannelId('all');
                      setIsChannelDropdownOpen(false);
                    }}
                  >
                    <span className="channel-picker__option-avatar channel-picker__option-avatar--empty" aria-hidden="true">*</span>
                    <span className="channel-picker__option-meta">
                      <span className="channel-picker__option-title">{t('videoLibrary.allChannels')}</span>
                    </span>
                  </button>

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
          <div className="actions">
            {selectedChannel ? (
              <button
                className="button button--ghost"
                type="button"
                onClick={() => setSelectedChannelId('all')}
              >
                {t('videoLibrary.clearFilter')}
              </button>
            ) : null}
          </div>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('videoLibrary.videos')}</th>
                <th>{t('videoLibrary.platform')}</th>
                <th>{t('videoLibrary.channel')}</th>
                <th>{t('videoLibrary.productsColumn')}</th>
                <th>{t('videoLibrary.campaign')}</th>
                <th className="cell-number">{t('videoLibrary.views')}</th>
                <th className="cell-number">{t('videoLibrary.engagement')}</th>
                <th className="cell-number">{t('videoLibrary.assignments')}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr className="table-state-row">
                  <td className="table-state-cell" colSpan={8}>
                    <div className="empty-state table-empty-state">
                      <div className="loading-dot" />
                      <div>{t('videoLibrary.loading')}</div>
                    </div>
                  </td>
                </tr>
              ) : filteredVideos.length ? (
                filteredVideos.map((video) => (
                  <tr key={video.id}>
                    <td>
                      <div className="video-cell">
                        {video.thumbnail_url ? (
                          video.video_url ? (
                            <a
                              className="video-cell__thumb-link"
                              href={video.video_url}
                              target="_blank"
                              rel="noreferrer"
                              aria-label={t('videoLibrary.openVideo', { title: video.title })}
                            >
                              <img
                                className="video-cell__thumb"
                                src={video.thumbnail_url}
                                alt={video.title}
                                loading="lazy"
                              />
                            </a>
                          ) : (
                            <img
                              className="video-cell__thumb"
                              src={video.thumbnail_url}
                              alt={video.title}
                              loading="lazy"
                            />
                          )
                        ) : (
                          <div className="video-cell__thumb video-cell__thumb--empty" aria-hidden="true">
                            {t('videoLibrary.noThumbnail')}
                          </div>
                        )}
                        <div className="video-cell__meta">
                          <span className="row-title">{video.title}</span>
                          <span className="row-subtitle">{video.content_type || 'content'} | {video.platform_video_id}</span>
                        </div>
                      </div>
                    </td>
                    <td><span className="chip">{getPlatformLabel(video.platform || 'tiktok')}</span></td>
                    <td>
                      <div className="channel-cell">
                        {video.channel?.avatar_url ? (
                          <img
                            className="channel-cell__avatar"
                            src={video.channel.avatar_url}
                            alt={video.channel?.display_name || video.channel?.username || t('videoLibrary.channelAvatar')}
                            loading="lazy"
                          />
                        ) : (
                          <div className="channel-cell__avatar channel-cell__avatar--empty" aria-hidden="true">
                            CH
                          </div>
                        )}
                        <div className="channel-cell__meta">
                          <span className="row-title">{video.channel?.display_name || video.channel?.username || video.channel_id}</span>
                          {video.channel?.username ? (
                            <span className="row-subtitle">@{video.channel.username}</span>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="chip-row">
                        {(video.products || []).map((product) => (
                          <span className="chip" key={product.id}>{product.name}</span>
                        ))}
                      </div>
                    </td>
                    <td>{video.campaign || '-'}</td>
                    <td className="cell-number">{formatNumber(video.views)}</td>
                    <td className="cell-number">{formatNumber(video.likes)} {t('videoLibrary.likes').toLowerCase()} | {formatNumber(video.comments)} {t('videoLibrary.comments')} | {formatNumber(video.shares)} {t('videoLibrary.shares').toLowerCase()}</td>
                    <td className="cell-number">{video.assignments?.length || 0}</td>
                  </tr>
                ))
              ) : (
                <tr className="table-state-row">
                  <td className="table-state-cell" colSpan={8}>
                    <div className="empty-state empty-state--compact table-empty-state">
                      <div>{t('videoLibrary.noMatch')}</div>
                    </div>
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

export default VideoTable;
