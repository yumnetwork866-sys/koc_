const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS tiktok_marketplace_creator_details (
      id SERIAL PRIMARY KEY,
      shop_id INTEGER NOT NULL REFERENCES tiktok_shops(id) ON DELETE CASCADE,
      creator_open_id VARCHAR(255) NOT NULL,
      username VARCHAR(255),
      detail JSONB NOT NULL DEFAULT '{}'::jsonb,
      fetched_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (shop_id, creator_open_id)
    )
  `, { transaction });
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS tiktok_marketplace_creator_details_fetched_idx
    ON tiktok_marketplace_creator_details (shop_id, fetched_at DESC)
  `, { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query('DROP TABLE IF EXISTS tiktok_marketplace_creator_details', { transaction });
};

module.exports = { name: '030_create_tiktok_marketplace_creator_details', up, down };
