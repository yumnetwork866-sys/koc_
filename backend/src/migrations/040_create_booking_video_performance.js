const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS booking_videos (
      id BIGSERIAL PRIMARY KEY,
      booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
      platform_video_id VARCHAR(64) NOT NULL,
      video_url TEXT,
      creator_username VARCHAR(255),
      title TEXT,
      posted_at TIMESTAMPTZ,
      attribution_start DATE NOT NULL,
      attribution_end DATE NOT NULL,
      mapping_source VARCHAR(64) NOT NULL DEFAULT 'MANUAL_URL',
      status VARCHAR(32) NOT NULL DEFAULT 'COLLECTING',
      last_synced_at TIMESTAMPTZ,
      last_sync_error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (booking_id, platform_video_id)
    )
  `, { transaction });
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS booking_videos_sync_idx
    ON booking_videos (status, attribution_end)
  `, { transaction });
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS booking_videos_platform_video_idx
    ON booking_videos (platform_video_id)
  `, { transaction });

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS booking_video_performance_snapshots (
      id BIGSERIAL PRIMARY KEY,
      booking_video_id BIGINT NOT NULL REFERENCES booking_videos(id) ON DELETE CASCADE,
      snapshot_date DATE NOT NULL,
      gross_gmv NUMERIC(20, 4) NOT NULL DEFAULT 0,
      refunded_gmv NUMERIC(20, 4),
      net_gmv NUMERIC(20, 4),
      orders INTEGER NOT NULL DEFAULT 0,
      items_sold BIGINT NOT NULL DEFAULT 0,
      views BIGINT NOT NULL DEFAULT 0,
      ctr NUMERIC(12, 6),
      currency VARCHAR(16),
      raw_metrics JSONB,
      synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (booking_video_id, snapshot_date)
    )
  `, { transaction });
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS booking_video_snapshots_video_date_idx
    ON booking_video_performance_snapshots (booking_video_id, snapshot_date DESC)
  `, { transaction });

  await sequelize.query(`
    INSERT INTO booking_videos (
      booking_id, platform_video_id, video_url, creator_username, title, posted_at,
      attribution_start, attribution_end, mapping_source, status, last_synced_at
    )
    SELECT
      b.id,
      b.video_platform_id,
      b.video_url,
      b.creator_username,
      COALESCE(b.evaluation_snapshot->'video_match'->>'title', 'TikTok video'),
      b.posted_at,
      COALESCE(b.posted_at::date, b.created_at::date, CURRENT_DATE),
      COALESCE(b.posted_at::date, b.created_at::date, CURRENT_DATE) + 30,
      COALESCE(b.evaluation_snapshot->'video_match'->>'source', 'LEGACY'),
      CASE
        WHEN COALESCE(b.posted_at::date, b.created_at::date, CURRENT_DATE) + 30 < CURRENT_DATE
          THEN 'FINALIZED'
        ELSE 'COLLECTING'
      END,
      CASE
        WHEN NULLIF(b.evaluation_snapshot->'video_match'->>'matched_at', '') IS NOT NULL
          THEN (b.evaluation_snapshot->'video_match'->>'matched_at')::timestamptz
        ELSE NULL
      END
    FROM bookings b
    WHERE NULLIF(b.video_platform_id, '') IS NOT NULL
    ON CONFLICT (booking_id, platform_video_id) DO NOTHING
  `, { transaction });

  await sequelize.query(`
    INSERT INTO booking_video_performance_snapshots (
      booking_video_id, snapshot_date, gross_gmv, orders, items_sold, views, ctr,
      currency, raw_metrics, synced_at
    )
    SELECT
      bv.id,
      COALESCE(bv.last_synced_at::date, CURRENT_DATE),
      CASE WHEN COALESCE(b.evaluation_snapshot->'video_match'->'gmv'->>'amount', '') ~ '^-?[0-9]+([.][0-9]+)?$'
        THEN (b.evaluation_snapshot->'video_match'->'gmv'->>'amount')::numeric ELSE 0 END,
      CASE WHEN COALESCE(b.evaluation_snapshot->'video_match'->>'orders', '') ~ '^[0-9]+$'
        THEN (b.evaluation_snapshot->'video_match'->>'orders')::integer ELSE 0 END,
      CASE WHEN COALESCE(b.evaluation_snapshot->'video_match'->>'items_sold', '') ~ '^[0-9]+$'
        THEN (b.evaluation_snapshot->'video_match'->>'items_sold')::bigint ELSE 0 END,
      CASE WHEN COALESCE(b.evaluation_snapshot->'video_match'->>'views', '') ~ '^[0-9]+$'
        THEN (b.evaluation_snapshot->'video_match'->>'views')::bigint ELSE 0 END,
      CASE WHEN COALESCE(b.evaluation_snapshot->'video_match'->>'ctr', '') ~ '^-?[0-9]+([.][0-9]+)?$'
        THEN (b.evaluation_snapshot->'video_match'->>'ctr')::numeric ELSE NULL END,
      NULLIF(b.evaluation_snapshot->'video_match'->'gmv'->>'currency', ''),
      b.evaluation_snapshot->'video_match',
      COALESCE(bv.last_synced_at, NOW())
    FROM booking_videos bv
    JOIN bookings b ON b.id = bv.booking_id
    WHERE b.evaluation_snapshot->'video_match' IS NOT NULL
    ON CONFLICT (booking_video_id, snapshot_date) DO NOTHING
  `, { transaction });

  await sequelize.query(`
    INSERT INTO scheduled_jobs (job_key, name, description, enabled, timezone, run_times)
    VALUES (
      'booking_video_performance',
      'Booking Video Performance',
      'Synchronize the attributed performance of each TikTok video linked to a booking.',
      TRUE,
      'Asia/Ho_Chi_Minh',
      '["06:00"]'::jsonb
    )
    ON CONFLICT (job_key) DO NOTHING
  `, { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    DELETE FROM scheduled_jobs WHERE job_key = 'booking_video_performance'
  `, { transaction });
  await sequelize.query('DROP TABLE IF EXISTS booking_video_performance_snapshots', { transaction });
  await sequelize.query('DROP TABLE IF EXISTS booking_videos', { transaction });
};

module.exports = { name: '040_create_booking_video_performance', up, down };
