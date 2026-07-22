const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS tiktok_marketplace_search_snapshots (
      id SERIAL PRIMARY KEY,
      shop_id INTEGER NOT NULL REFERENCES tiktok_shops(id) ON DELETE CASCADE,
      cache_key VARCHAR(64) NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      fetched_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (shop_id, cache_key)
    )
  `, { transaction });
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS tiktok_marketplace_search_snapshots_fetched_idx
    ON tiktok_marketplace_search_snapshots (shop_id, fetched_at DESC)
  `, { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query('DROP TABLE IF EXISTS tiktok_marketplace_search_snapshots', { transaction });
};

module.exports = { name: '031_create_tiktok_marketplace_search_snapshots', up, down };
