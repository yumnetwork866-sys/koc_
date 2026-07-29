const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    ALTER TABLE tiktok_marketplace_discovery_states
      ADD COLUMN IF NOT EXISTS recovery_successes INTEGER NOT NULL DEFAULT 0;
  `, { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    ALTER TABLE tiktok_marketplace_discovery_states
      DROP COLUMN IF EXISTS recovery_successes;
  `, { transaction });
};

module.exports = { name: '049_add_marketplace_discovery_recovery_state', up, down };
