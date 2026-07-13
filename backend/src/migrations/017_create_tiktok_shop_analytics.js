const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS tiktok_shop_authorizations (
      id SERIAL PRIMARY KEY,
      open_id VARCHAR(255) UNIQUE,
      user_type INTEGER NOT NULL DEFAULT 0,
      granted_scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
      access_token_encrypted TEXT NOT NULL,
      refresh_token_encrypted TEXT,
      access_token_expires_at TIMESTAMPTZ,
      refresh_token_expires_at TIMESTAMPTZ,
      connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_sync_status VARCHAR(32),
      last_sync_error TEXT
    )
  `, { transaction });
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS tiktok_shops (
      id SERIAL PRIMARY KEY,
      authorization_id INTEGER NOT NULL REFERENCES tiktok_shop_authorizations(id) ON DELETE CASCADE,
      platform_shop_id VARCHAR(255) NOT NULL UNIQUE,
      name VARCHAR(255) NOT NULL,
      region VARCHAR(32),
      seller_type VARCHAR(64),
      cipher TEXT NOT NULL UNIQUE,
      code VARCHAR(255),
      last_synced_at TIMESTAMPTZ,
      last_sync_status VARCHAR(32),
      last_sync_error TEXT
    )
  `, { transaction });
  await sequelize.query('CREATE INDEX IF NOT EXISTS tiktok_shops_authorization_idx ON tiktok_shops (authorization_id)', { transaction });
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS tiktok_shop_analytics_snapshots (
      id SERIAL PRIMARY KEY,
      shop_id INTEGER NOT NULL REFERENCES tiktok_shops(id) ON DELETE CASCADE,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      currency VARCHAR(16) NOT NULL DEFAULT 'LOCAL',
      metrics JSONB NOT NULL,
      latest_available_date DATE,
      request_id VARCHAR(255),
      synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (shop_id, start_date, end_date, currency)
    )
  `, { transaction });
  await sequelize.query('CREATE INDEX IF NOT EXISTS tiktok_shop_analytics_shop_synced_idx ON tiktok_shop_analytics_snapshots (shop_id, synced_at DESC)', { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query('DROP TABLE IF EXISTS tiktok_shop_analytics_snapshots', { transaction });
  await sequelize.query('DROP TABLE IF EXISTS tiktok_shops', { transaction });
  await sequelize.query('DROP TABLE IF EXISTS tiktok_shop_authorizations', { transaction });
};

module.exports = { name: '017_create_tiktok_shop_analytics', up, down };
