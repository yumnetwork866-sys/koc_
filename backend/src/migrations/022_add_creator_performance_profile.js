const up = async ({ sequelize, transaction }) => {
  await sequelize.query('ALTER TABLE tiktok_creator_performance_snapshots ADD COLUMN IF NOT EXISTS nickname VARCHAR(255)', { transaction });
  await sequelize.query('ALTER TABLE tiktok_creator_performance_snapshots ADD COLUMN IF NOT EXISTS avatar_url TEXT', { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query('ALTER TABLE tiktok_creator_performance_snapshots DROP COLUMN IF EXISTS avatar_url', { transaction });
  await sequelize.query('ALTER TABLE tiktok_creator_performance_snapshots DROP COLUMN IF EXISTS nickname', { transaction });
};

module.exports = { name: '022_add_creator_performance_profile', up, down };
