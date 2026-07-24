const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS shop_videos (
      id BIGSERIAL PRIMARY KEY,
      shop_id INTEGER NOT NULL REFERENCES tiktok_shops(id) ON DELETE CASCADE,
      platform_video_id VARCHAR(64) NOT NULL,
      account_type VARCHAR(32) NOT NULL DEFAULT 'AFFILIATE_ACCOUNTS',
      creator_username VARCHAR(255),
      title TEXT,
      video_url TEXT,
      posted_at TIMESTAMPTZ,
      first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      raw_data JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (shop_id, platform_video_id)
    )
  `, { transaction });
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS shop_videos_creator_posted_idx
    ON shop_videos (shop_id, LOWER(creator_username), posted_at DESC)
  `, { transaction });

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS shop_video_performance_snapshots (
      id BIGSERIAL PRIMARY KEY,
      shop_video_id BIGINT NOT NULL REFERENCES shop_videos(id) ON DELETE CASCADE,
      snapshot_date DATE NOT NULL,
      window_start DATE NOT NULL,
      window_end DATE NOT NULL,
      gross_gmv NUMERIC(20, 4) NOT NULL DEFAULT 0,
      orders INTEGER NOT NULL DEFAULT 0,
      items_sold BIGINT NOT NULL DEFAULT 0,
      views BIGINT NOT NULL DEFAULT 0,
      ctr NUMERIC(12, 6),
      currency VARCHAR(16),
      raw_metrics JSONB,
      synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (shop_video_id, snapshot_date)
    )
  `, { transaction });
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS shop_video_snapshots_video_date_idx
    ON shop_video_performance_snapshots (shop_video_id, snapshot_date DESC)
  `, { transaction });

  await sequelize.query(`
    INSERT INTO scheduled_jobs (job_key, name, description, enabled, timezone, run_times)
    VALUES (
      'tiktok_shop_video_catalog',
      'TikTok Shop Video Catalog',
      'Synchronize every page of affiliate video analytics into the local video catalog and daily snapshots.',
      TRUE,
      'Asia/Ho_Chi_Minh',
      '["05:30"]'::jsonb
    )
    ON CONFLICT (job_key) DO NOTHING
  `, { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    DELETE FROM scheduled_jobs WHERE job_key = 'tiktok_shop_video_catalog'
  `, { transaction });
  await sequelize.query('DROP TABLE IF EXISTS shop_video_performance_snapshots', { transaction });
  await sequelize.query('DROP TABLE IF EXISTS shop_videos', { transaction });
};

module.exports = { name: '041_create_shop_video_catalog', up, down };
