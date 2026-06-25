import React, { useEffect, useMemo, useState } from 'react';
import { createVideo, fetchChannels, fetchProducts, fetchVideos } from '../lib/api';
import { PLATFORMS, getPlatformLabel } from '../lib/platforms';

const initialForm = {
  title: '',
  platform_video_id: '',
  channel_id: '',
  platform: 'tiktok',
  published_at: '',
  views: 0,
  likes: 0,
  comments: 0,
  shares: 0,
  campaign: '',
  content_type: '',
  product_ids: [],
};

const formatNumber = (value) => Number(value || 0).toLocaleString();

const VideoTable = ({ heroTitle, heroSubtitle }) => {
  const [videos, setVideos] = useState([]);
  const [channels, setChannels] = useState([]);
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

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
          setError(err.message || 'Failed to load videos');
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

  const totals = useMemo(() => {
    return videos.reduce((acc, video) => {
      acc.views += Number(video.views || 0);
      acc.likes += Number(video.likes || 0);
      acc.comments += Number(video.comments || 0);
      acc.shares += Number(video.shares || 0);
      return acc;
    }, { views: 0, likes: 0, comments: 0, shares: 0 });
  }, [videos]);

  const handleChange = (event) => {
    const { name, value, selectedOptions } = event.target;
    setForm((current) => ({
      ...current,
      [name]: name === 'product_ids'
        ? Array.from(selectedOptions).map((option) => Number(option.value))
        : value,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    try {
      setSaving(true);
      setError('');
      await createVideo({
        ...form,
        platform: form.platform,
        channel_id: Number(form.channel_id),
        views: Number(form.views || 0),
        likes: Number(form.likes || 0),
        comments: Number(form.comments || 0),
        shares: Number(form.shares || 0),
        published_at: form.published_at || null,
      });
      setForm(initialForm);
      await loadData();
    } catch (err) {
      setError(err.message || 'Không tạo được video');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <section className="page__hero">
        <span className="page__eyebrow">Video Library</span>
        <h1 className="page__title">{heroTitle}</h1>
        <p className="page__subtitle">{heroSubtitle}</p>
        <div className="page__stats page__stats--four">
          <article className="stat-card">
            <p className="stat-card__label">Videos</p>
            <p className="stat-card__value">{videos.length}</p>
          </article>
          <article className="stat-card">
            <p className="stat-card__label">Views</p>
            <p className="stat-card__value">{formatNumber(totals.views)}</p>
          </article>
          <article className="stat-card">
            <p className="stat-card__label">Likes</p>
            <p className="stat-card__value">{formatNumber(totals.likes)}</p>
          </article>
          <article className="stat-card">
            <p className="stat-card__label">Shares</p>
            <p className="stat-card__value">{formatNumber(totals.shares)}</p>
          </article>
        </div>
      </section>

      {error ? <section className="section-card empty-state empty-state--compact">{error}</section> : null}

      <section className="section-card">
        <div className="section-card__header">
          <div>
            <h2 className="section-card__title">Thêm video thủ công</h2>
            <p className="section-card__meta">Dùng khi chưa import file hoặc chưa có OAuth/crawler.</p>
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
            <label htmlFor="title">Title</label>
            <input id="title" name="title" value={form.title} onChange={handleChange} required />
          </div>
          <div className="field">
            <label htmlFor="platform_video_id">Platform video ID</label>
            <input id="platform_video_id" name="platform_video_id" value={form.platform_video_id} onChange={handleChange} required />
          </div>
          <div className="field">
            <label htmlFor="channel_id">Channel</label>
            <select id="channel_id" name="channel_id" value={form.channel_id} onChange={handleChange} required>
              <option value="">Chọn channel</option>
              {channels.map((channel) => (
                <option key={channel.id} value={channel.id}>@{channel.username}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="published_at">Published at</label>
            <input id="published_at" name="published_at" type="date" value={form.published_at} onChange={handleChange} />
          </div>
          <div className="field">
            <label htmlFor="views">Views</label>
            <input id="views" name="views" type="number" min="0" value={form.views} onChange={handleChange} />
          </div>
          <div className="field">
            <label htmlFor="likes">Likes</label>
            <input id="likes" name="likes" type="number" min="0" value={form.likes} onChange={handleChange} />
          </div>
          <div className="field">
            <label htmlFor="comments">Comments</label>
            <input id="comments" name="comments" type="number" min="0" value={form.comments} onChange={handleChange} />
          </div>
          <div className="field">
            <label htmlFor="shares">Shares</label>
            <input id="shares" name="shares" type="number" min="0" value={form.shares} onChange={handleChange} />
          </div>
          <div className="field">
            <label htmlFor="campaign">Campaign</label>
            <input id="campaign" name="campaign" value={form.campaign} onChange={handleChange} />
          </div>
          <div className="field">
            <label htmlFor="content_type">Content type</label>
            <input id="content_type" name="content_type" value={form.content_type} onChange={handleChange} />
          </div>
          <div className="field">
            <label htmlFor="product_ids">Products</label>
            <select id="product_ids" name="product_ids" value={form.product_ids.map(String)} onChange={handleChange} multiple>
              {products.map((product) => (
                <option key={product.id} value={product.id}>{product.name}</option>
              ))}
            </select>
          </div>
          <div className="actions">
            <button className="button" type="submit" disabled={saving || !channels.length}>
              {saving ? 'Đang lưu' : 'Thêm video'}
            </button>
          </div>
        </form>
      </section>

      <section className="section-card">
        <div className="section-card__header">
          <div>
            <h2 className="section-card__title">Danh sách video</h2>
            <p className="section-card__meta">Video từ OAuth, import hoặc crawler sẽ hiển thị chung ở đây.</p>
          </div>
          <div className="chip-row">
            <span className="chip chip--blue">Channels: {channels.length}</span>
            <span className="chip chip--positive">Products: {products.length}</span>
          </div>
        </div>

        {loading ? (
          <div className="empty-state">
            <div className="loading-dot" />
            <div>Đang tải video</div>
          </div>
        ) : videos.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Video</th>
                  <th>Platform</th>
                  <th>Channel</th>
                  <th>Products</th>
                  <th>Campaign</th>
                  <th>Views</th>
                  <th>Engagement</th>
                  <th>Assignments</th>
                </tr>
              </thead>
              <tbody>
                {videos.map((video) => (
                  <tr key={video.id}>
                    <td>
                      <span className="row-title">{video.title}</span>
                      <span className="row-subtitle">{video.content_type || 'content'} | {video.platform_video_id}</span>
                    </td>
                    <td><span className="chip">{getPlatformLabel(video.platform || 'tiktok')}</span></td>
                    <td>@{video.channel?.username || video.channel_id}</td>
                    <td>
                      <div className="chip-row">
                        {(video.products || []).map((product) => (
                          <span className="chip" key={product.id}>{product.name}</span>
                        ))}
                      </div>
                    </td>
                    <td>{video.campaign || '-'}</td>
                    <td>{formatNumber(video.views)}</td>
                    <td>{formatNumber(video.likes)} likes | {formatNumber(video.comments)} comments | {formatNumber(video.shares)} shares</td>
                    <td>{video.assignments?.length || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">Chưa có video nào trong hệ thống.</div>
        )}
      </section>
    </div>
  );
};

export default VideoTable;
