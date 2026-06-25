import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { fetchChannels } from '../lib/api';
import { PLATFORMS, getPlatformLabel } from '../lib/platforms';

const ChannelManagement = ({ heroTitle, heroSubtitle }) => {
  const location = useLocation();
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isOauthOpen, setIsOauthOpen] = useState(false);
  const [toast, setToast] = useState(null);
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

    return () => window.clearTimeout(timeoutId);
  }, [oauthStatus, oauthMessage]);

  const sourceCounts = useMemo(() => {
    return channels.reduce((acc, channel) => {
      acc[channel.sync_source] = (acc[channel.sync_source] || 0) + 1;
      return acc;
    }, {});
  }, [channels]);

  const startOauth = () => {
    window.location.assign(tiktokOauthUrl);
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
            <p className="section-card__meta">Video import hoặc đồng bộ sẽ gắn vào channel tương ứng.</p>
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
                  <th>Username</th>
                  <th>Platform</th>
                  <th>Display name</th>
                  <th>Nguồn</th>
                  <th>Videos</th>
                  <th>Profile</th>
                </tr>
              </thead>
              <tbody>
                {channels.map((channel) => (
                  <tr key={channel.id}>
                    <td><span className="row-title">@{channel.username}</span></td>
                    <td>{getPlatformLabel(channel.platform || 'tiktok')}</td>
                    <td>{channel.display_name}</td>
                    <td><span className="chip">{channel.sync_source}</span></td>
                    <td>{channel.videos?.length || 0}</td>
                    <td>{channel.profile_url ? <a href={channel.profile_url}>{channel.profile_url}</a> : '-'}</td>
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
