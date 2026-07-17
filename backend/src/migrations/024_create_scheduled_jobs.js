const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS scheduled_jobs (
      id SERIAL PRIMARY KEY,
      job_key VARCHAR(100) NOT NULL UNIQUE,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      timezone VARCHAR(100) NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
      run_times JSONB NOT NULL DEFAULT '["03:00"]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `, { transaction });
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS scheduled_job_runs (
      id BIGSERIAL PRIMARY KEY,
      scheduled_job_id INTEGER NOT NULL REFERENCES scheduled_jobs(id) ON DELETE CASCADE,
      trigger_type VARCHAR(32) NOT NULL DEFAULT 'SCHEDULED',
      scheduled_key VARCHAR(255) NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'PROCESSING',
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ,
      summary JSONB,
      error TEXT,
      UNIQUE (scheduled_job_id, scheduled_key)
    )
  `, { transaction });
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS scheduled_job_runs_job_started_idx
    ON scheduled_job_runs (scheduled_job_id, started_at DESC)
  `, { transaction });
  await sequelize.query(`
    INSERT INTO scheduled_jobs (job_key, name, description, enabled, timezone, run_times)
    VALUES
      ('tiktok_creator_performance', 'TikTok Creator Performance', 'Compass Offline Export, creator metrics and profile enrichment for every connected Shop.', TRUE, 'Asia/Kuala_Lumpur', '["04:00"]'::jsonb),
      ('tiktok_shop_analytics', 'TikTok Shop Analytics', 'Shop GMV, orders, buyers, traffic, refunds and cancellations for every connected Shop.', TRUE, 'Asia/Kuala_Lumpur', '["05:00"]'::jsonb),
      ('tiktok_channel_metrics', 'TikTok Channel Metrics', 'Profile, videos and daily video metrics for every connected TikTok creator channel.', TRUE, 'Asia/Ho_Chi_Minh', '["02:00"]'::jsonb)
    ON CONFLICT (job_key) DO NOTHING
  `, { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query('DROP TABLE IF EXISTS scheduled_job_runs', { transaction });
  await sequelize.query('DROP TABLE IF EXISTS scheduled_jobs', { transaction });
};

module.exports = { name: '024_create_scheduled_jobs', up, down };
