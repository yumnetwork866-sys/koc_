const up = async ({ sequelize, transaction }) => {
  await sequelize.query(
    'ALTER TABLE tiktok_creator_performance_snapshots ADD COLUMN IF NOT EXISTS creator_open_id VARCHAR(255)',
    { transaction },
  );
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query(
    'ALTER TABLE tiktok_creator_performance_snapshots DROP COLUMN IF EXISTS creator_open_id',
    { transaction },
  );
};

module.exports = { name: '023_add_creator_performance_open_id', up, down };
