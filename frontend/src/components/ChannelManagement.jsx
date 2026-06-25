import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { deleteChannel, fetchChannels, syncChannelVideos } from '../lib/api';
import { PLATFORMS, getPlatformLabel } from '../lib/platforms';

const ChannelManagement = ({ heroTitle, heroSubtitle }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isOauthOpen, setIsOauthOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [deletingChannelId, setDeletingChannelId] = useState(null);
  const [syncingChannelId, setSyncingChannelId] = useState(null);
  const [openActions, setOpenActions] = useState({
    id: null,
    direction: 'down',
    top: 0,
    bottom: 0,
    right: 0,
  });
  const tiktokOauthUrl = '/api/channels/oauth/tiktok/start';
  const oauthParams = new URLSearchParams(location.search);
  const oauthStatus = oauthParams.get('oauth_status');
  const oauthMessage = oauthParams.get('oauth_message');

  const loadChannels = async (signal) => {
    const loadedChannels = await fetchChannels(signal);
    setChannels(loadedChannels);
  };

  useEffect(() => {
    const controller = new AbortController();

    const load = async () => {
      try {
        setLoading(true);
        setError('');
        await loadChannels(controller.signal);
      } catch (err) {
        if (err.name !== 'AbortError') {
          setError(err.message || 'Failed to load channels');
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    load();

    return () => controller.abort();
  }, [location.search]);

  useEffect(() => {
    if (!oauthStatus) {
      setToast(null);
      return undefined;
    }

    setToast({
      status: oauthStatus,
      message: oauthMessage || (oauthStatus === 'success' ? 'TikTok channel connected' : 'TikTok OAuth failed'),
    });

    const timeoutId = window.setTimeout(() => {
      setToast(null);
    }, 4000);

    navigate({ pathname: location.pathname, search: '' }, { replace: true });

    return () => window.clearTimeout(timeoutId);
  }, [oauthStatus, oauthMessage, navigate, location.pathname]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!event.target.closest('.action-menu')) {
        setOpenActions({ id: null, direction: 'down', top: 0, bottom: 0, right: 0 });
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const sourceCounts = useMemo(() => {
    return channels.reduce((acc, channel) => {
      acc[channel.sync_source] = (acc[channel.sync_source] || 0) + 1;
      return acc;
    }, {});
  }, [channels]);

  const startOauth = () => {
    window.location.assign(tiktokOauthUrl);
  };

  const isFallbackUsername = (value) => {
    const text = String(value || '').trim();
    return !text || text.startsWith('tiktok_') || text.startsWith('-');
  };

  const handleDeleteChannel = async (channel) => {
    const confirmed = window.confirm(
      `Xóa channel "${channel.display_name}"? Video liên quan cũng sẽ bị xóa.`
    );

    if (!confirmed) {
      return;
    }

    try {
      setDeletingChannelId(channel.id);
      setError('');
      await deleteChannel(channel.id);
      await loadChannels();
    } catch (err) {
      setError(err.message || 'Không xóa được channel');
    } finally {
      setDeletingChannelId(null);
    }
  };

  const handleSyncChannelVideos = async (channel) => {
    try {
      setSyncingChannelId(channel.id);
      setError('');
      const result = await syncChannelVideos(channel.id);
      setToast({
        status: 'success',
        message: result?.message || 'Synced videos successfully',
      });
      await loadChannels();
    } catch (err) {
      setError(err.message || 'Không sync được video');
    } finally {
      setSyncingChannelId(null);
      setOpenActions({ id: null, direction: 'down', top: 0, bottom: 0, right: 0 });
    }
  };

  const toggleActionsMenu = (channelId, triggerElement) => {
    setOpenActions((current) => {
      if (current.id === channelId) {
        return { id: null, direction: 'down', top: 0, bottom: 0, right: 0 };
      }

      const rect = triggerElement.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const direction = spaceBelow < 180 && spaceAbove > spaceBelow ? 'up' : 'down';
      const right = Math.max(12, window.innerWidth - rect.right);
      const top = Math.min(window.innerHeight - 12, rect.bottom + 8);
      const bottom = Math.max(12, window.innerHeight - (rect.top - 8));

      return { id: channelId, direction, top, bottom, right };
    });
  };

  return (
    <div className="page">
      {toast ? (
        <div className={`toast ${toast.status === 'success' ? 'toast--success' : 'toast--error'}`} role="status" aria-live="polite">
          {toast.message}
        </div>
      ) : null}

      <section className="page__hero">
        <span className="page__eyebrow">Kênh</span>
        <h1 className="page__title">{heroTitle}</h1>
        <p className="page__subtitle">{heroSubtitle}</p>
        <div className="page__stats">
          <article className="stat-card">
            <p className="stat-card__label">Channels</p>
            <p className="stat-card__value">{channels.length}</p>
          </article>
          <article className="stat-card">
            <p className="stat-card__label">OAuth</p>
            <p className="stat-card__value">{sourceCounts.oauth || 0}</p>
          </article>
          <article className="stat-card">
            <p className="stat-card__label">Import/Crawl</p>
            <p className="stat-card__value">{(sourceCounts.import || 0) + (sourceCounts.crawler || 0)}</p>
          </article>
        </div>
        <div className="platform-strip">
          {PLATFORMS.map((platform) => (
            <span
              key={platform.key}
              className={`chip ${platform.status === 'active' ? 'chip--positive' : 'chip--amber'}`}
            >
              {platform.label}{platform.status === 'placeholder' ? ' placeholder' : ''}
            </span>
          ))}
        </div>
      </section>

      {error ? <section className="section-card empty-state empty-state--compact">{error}</section> : null}

      <section className="section-card">
        <div className="section-card__header">
          <div>
            <h2 className="section-card__title">Thêm kênh</h2>
          </div>
          <div className="actions">
            <button
              className="button"
              type="button"
              onClick={() => setIsOauthOpen(true)}
            >
              Thêm kênh
            </button>
          </div>
        </div>
        <div className="oauth-cta">
          <div className="oauth-cta__copy">
            <p className="oauth-cta__subtitle">Kết nối kênh bằng OAuth để đồng bộ dữ liệu tự động.</p>
          </div>
        </div>
      </section>

      <section className="section-card">
        <div className="section-card__header">
          <div>
            <h2 className="section-card__title">Danh sách kênh</h2>
          </div>
        </div>

        {loading ? (
          <div className="empty-state">
            <div className="loading-dot" />
            <div>Đang tải kênh</div>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Channel</th>
                  <th>Platform</th>
                  <th>Nguồn</th>
                  <th>Videos</th>
                  <th>Profile</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {channels.map((channel) => (
                  <tr key={channel.id}>
                    <td>
                      <span className="row-title">{channel.display_name}</span>
                      {!isFallbackUsername(channel.username) ? (
                        <div className="row-subtitle">@{channel.username}</div>
                      ) : null}
                    </td>
                    <td>{getPlatformLabel(channel.platform || 'tiktok')}</td>
                    <td><span className="chip">{channel.sync_source}</span></td>
                    <td>{channel.videos?.length || 0}</td>
                    <td>{channel.profile_url ? <a href={channel.profile_url}>{channel.profile_url}</a> : '-'}</td>
                    <td>
                      <div className="action-menu">
                        <button
                          className="action-menu__trigger"
                          type="button"
                          aria-haspopup="menu"
                          aria-expanded={openActions.id === channel.id}
                          onClick={(event) => toggleActionsMenu(channel.id, event.currentTarget)}
                        >
                          ...
                        </button>
                        {openActions.id === channel.id ? (
                          <div
                            className={`action-menu__panel action-menu__panel--${openActions.direction}`}
                            role="menu"
                            style={{
                              position: 'fixed',
                              right: `${openActions.right}px`,
                              top: openActions.direction === 'down' ? `${openActions.top}px` : 'auto',
                              bottom: openActions.direction === 'up' ? `${openActions.bottom}px` : 'auto',
                            }}
                          >
                            <button
                              className="action-menu__item"
                              type="button"
                              role="menuitem"
                              onClick={() => handleSyncChannelVideos(channel)}
                              disabled={syncingChannelId === channel.id}
                            >
                              {syncingChannelId === channel.id ? 'Đang sync' : 'Sync video'}
                            </button>
                            <button
                              className="action-menu__item action-menu__item--danger"
                              type="button"
                              role="menuitem"
                              onClick={() => handleDeleteChannel(channel)}
                              disabled={deletingChannelId === channel.id}
                            >
                              {deletingChannelId === channel.id ? 'Đang xóa' : 'Xóa kênh'}
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {isOauthOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setIsOauthOpen(false)}>
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="oauth-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="section-card__header">
              <div>
                <h2 className="section-card__title" id="oauth-title">Kết nối TikTok</h2>
                <p className="section-card__meta">
                  Bạn sẽ được chuyển sang TikTok để đăng nhập và cấp quyền cho web.
                </p>
              </div>
            </div>
            <div className="modal-card__actions">
              <button className="button" type="button" onClick={startOauth}>
                Tiếp tục với TikTok
              </button>
              <button className="button button--ghost" type="button" onClick={() => setIsOauthOpen(false)}>
                Hủy
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default ChannelManagement;
