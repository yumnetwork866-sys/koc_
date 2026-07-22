const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS tiktok_marketplace_creators (
      id BIGSERIAL PRIMARY KEY,
      shop_id INTEGER NOT NULL REFERENCES tiktok_shops(id) ON DELETE CASCADE,
      creator_open_id VARCHAR(255) NOT NULL,
      username VARCHAR(255),
      nickname VARCHAR(255),
      profile JSONB NOT NULL DEFAULT '{}'::jsonb,
      first_seen_at TIMESTAMPTZ NOT NULL,
      last_seen_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (shop_id, creator_open_id)
    )
  `, { transaction });
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS tiktok_marketplace_creators_browse_idx
    ON tiktok_marketplace_creators (shop_id, first_seen_at DESC)
  `, { transaction });
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS tiktok_marketplace_creators_username_idx
    ON tiktok_marketplace_creators (shop_id, LOWER(username))
  `, { transaction });
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS tiktok_marketplace_discovery_states (
      shop_id INTEGER PRIMARY KEY REFERENCES tiktok_shops(id) ON DELETE CASCADE,
      next_page_token TEXT,
      search_key TEXT,
      last_requested_at TIMESTAMPTZ,
      last_succeeded_at TIMESTAMPTZ,
      last_status VARCHAR(32),
      last_error TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `, { transaction });
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS tiktok_marketplace_discovery_runs (
      shop_id INTEGER NOT NULL REFERENCES tiktok_shops(id) ON DELETE CASCADE,
      scheduled_minute TIMESTAMPTZ NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'PROCESSING',
      creator_count INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ,
      PRIMARY KEY (shop_id, scheduled_minute)
    )
  `, { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query('DROP TABLE IF EXISTS tiktok_marketplace_discovery_runs', { transaction });
  await sequelize.query('DROP TABLE IF EXISTS tiktok_marketplace_discovery_states', { transaction });
  await sequelize.query('DROP TABLE IF EXISTS tiktok_marketplace_creators', { transaction });
};

module.exports = { name: '033_create_tiktok_marketplace_discovery_store', up, down };
