const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    ALTER TABLE tiktok_marketplace_discovery_states
      ADD COLUMN IF NOT EXISTS segment_page_count INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS consecutive_duplicate_pages INTEGER NOT NULL DEFAULT 0;
  `, { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    ALTER TABLE tiktok_marketplace_discovery_states
      DROP COLUMN IF EXISTS consecutive_duplicate_pages,
      DROP COLUMN IF EXISTS segment_page_count;
  `, { transaction });
};

module.exports = { name: '050_add_marketplace_discovery_segment_limits', up, down };
