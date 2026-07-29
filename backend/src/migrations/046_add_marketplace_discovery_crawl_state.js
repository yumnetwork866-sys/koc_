const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    ALTER TABLE tiktok_marketplace_discovery_states
      ADD COLUMN IF NOT EXISTS segment_index INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS crawl_status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
      ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS next_refresh_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS consecutive_rate_limits INTEGER NOT NULL DEFAULT 0;

    UPDATE tiktok_marketplace_discovery_states
    SET segment_index = 1
    WHERE next_page_token IS NULL
      AND last_succeeded_at IS NOT NULL
      AND segment_index = 0;
  `, { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    ALTER TABLE tiktok_marketplace_discovery_states
      DROP COLUMN IF EXISTS consecutive_rate_limits,
      DROP COLUMN IF EXISTS next_refresh_at,
      DROP COLUMN IF EXISTS completed_at,
      DROP COLUMN IF EXISTS crawl_status,
      DROP COLUMN IF EXISTS segment_index;
  `, { transaction });
};

module.exports = { name: '046_add_marketplace_discovery_crawl_state', up, down };
