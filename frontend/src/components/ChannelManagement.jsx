import React, { useEffect, useMemo, useState } from 'react';
import { createChannel, fetchChannels } from '../lib/api';
import { PLATFORMS, getPlatformLabel } from '../lib/platforms';

const initialForm = {
  username: '',
  display_name: '',
  profile_url: '',
  sync_source: 'import',
  platform: 'tiktok',
};

const ChannelManagement = ({ heroTitle, heroSubtitle }) => {
  const [channels, setChannels] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

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
  }, []);

  const sourceCounts = useMemo(() => {
    return channels.reduce((acc, channel) => {
      acc[channel.sync_source] = (acc[channel.sync_source] || 0) + 1;
      return acc;
    }, {});
  }, [channels]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    try {
      setSaving(true);
      setError('');
      const username = form.username.replace(/^@/, '').trim();
      await createChannel({
        ...form,
        username,
        display_name: form.display_name || username,
        profile_url: form.profile_url || '',
      });
      setForm(initialForm);
      await loadChannels();
    } catch (err) {
      setError(err.message || 'Không tạo được kênh');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page">
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
            <p className="section-card__meta">OAuth lưu token mã hóa; import/crawler theo dõi dữ liệu public hoặc file xuất từ nền tảng.</p>
          </div>
        </div>

        <form className="filter-panel" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="platform">Platform</label>
            <select id="platform" name="platform" value={form.platform} onChange={handleChange}>
              {PLATFORMS.map((platform) => (
                <option key={platform.key} value={platform.key}>
                  {platform.label}{platform.status === 'placeholder' ? ' (placeholder)' : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="username">Username</label>
            <input id="username" name="username" value={form.username} onChange={handleChange} placeholder="@brand" required />
          </div>
          <div className="field">
            <label htmlFor="display_name">Display name</label>
            <input id="display_name" name="display_name" value={form.display_name} onChange={handleChange} />
          </div>
          <div className="field">
            <label htmlFor="sync_source">Nguồn sync</label>
            <select id="sync_source" name="sync_source" value={form.sync_source} onChange={handleChange}>
              <option value="oauth">oauth</option>
              <option value="import">import</option>
              <option value="crawler">crawler</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="profile_url">Profile URL</label>
            <input id="profile_url" name="profile_url" value={form.profile_url} onChange={handleChange} />
          </div>
          <div className="actions">
            <button className="button" type="submit" disabled={saving}>
              {saving ? 'Đang thêm' : 'Thêm kênh'}
            </button>
          </div>
        </form>
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
    </div>
  );
};

export default ChannelManagement;
