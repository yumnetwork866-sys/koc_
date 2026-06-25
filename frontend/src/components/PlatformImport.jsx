import React, { useState } from 'react';
import { importPlatformData } from '../lib/api';
import { PLATFORMS } from '../lib/platforms';

const samplePayload = JSON.stringify({
  channel: {
    platform: 'tiktok',
    username: 'brandclinic.vn',
    display_name: 'Brand Clinic',
    sync_source: 'import',
  },
  videos: [
    {
      platform_video_id: 'tt_new_001',
      title: 'Hook mới cho sản phẩm Mụn',
      published_at: '2026-06-25',
      views: 12000,
      likes: 900,
      comments: 44,
      shares: 52,
      campaign: 'Q2 Skin Recovery',
      content_type: 'education',
      products: ['Mụn'],
    },
  ],
}, null, 2);

const PlatformImport = ({ heroTitle, heroSubtitle }) => {
  const [payload, setPayload] = useState(samplePayload);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();

    try {
      setImporting(true);
      setError('');
      setResult(null);
      const parsedPayload = JSON.parse(payload);
      const importResult = await importPlatformData(parsedPayload);
      setResult(importResult);
    } catch (err) {
      setError(err.message || 'Không import được dữ liệu');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="page">
      <section className="page__hero">
        <span className="page__eyebrow">Import data</span>
        <h1 className="page__title">{heroTitle}</h1>
        <p className="page__subtitle">{heroSubtitle}</p>
        <div className="page__stats">
          <article className="stat-card">
            <p className="stat-card__label">Nguồn</p>
            <p className="stat-card__value">CSV</p>
          </article>
          <article className="stat-card">
            <p className="stat-card__label">OAuth</p>
            <p className="stat-card__value">OK</p>
          </article>
          <article className="stat-card">
            <p className="stat-card__label">Crawler</p>
            <p className="stat-card__value">Basic</p>
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
            <h2 className="section-card__title">Nhập payload nền tảng</h2>
            <p className="section-card__meta">MVP nhận JSON đã parse từ Excel/CSV; backend sẽ upsert channel, video và product.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="import-panel">
          <textarea
            className="code-input"
            value={payload}
            onChange={(event) => setPayload(event.target.value)}
            spellCheck="false"
          />
          <div className="actions">
            <button className="button" type="submit" disabled={importing}>
              {importing ? 'Đang import' : 'Import dữ liệu'}
            </button>
          </div>
        </form>
      </section>

      {result ? (
        <section className="section-card">
          <div className="section-card__header">
            <div>
              <h2 className="section-card__title">Kết quả import</h2>
              <p className="section-card__meta">@{result.channel?.username}</p>
            </div>
          </div>
          <div className="page__stats">
            <article className="stat-card">
              <p className="stat-card__label">Created</p>
              <p className="stat-card__value">{result.created}</p>
            </article>
            <article className="stat-card">
              <p className="stat-card__label">Updated</p>
              <p className="stat-card__value">{result.updated}</p>
            </article>
            <article className="stat-card">
              <p className="stat-card__label">Skipped</p>
              <p className="stat-card__value">{result.skipped}</p>
            </article>
          </div>
        </section>
      ) : null}
    </div>
  );
};

export default PlatformImport;
