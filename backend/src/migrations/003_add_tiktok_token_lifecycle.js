const columns = [
  'ADD COLUMN IF NOT EXISTS refresh_token_expires_at TIMESTAMPTZ',
  'ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ',
  'ADD COLUMN IF NOT EXISTS last_sync_status VARCHAR(255)',
  'ADD COLUMN IF NOT EXISTS last_sync_error TEXT',
];

const up = async ({ sequelize, transaction }) => {
  for (const column of columns) {
    await sequelize.query(`ALTER TABLE tiktok_channels ${column}`, { transaction });
  }
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query(
    `ALTER TABLE tiktok_channels
      DROP COLUMN IF EXISTS refresh_token_expires_at,
      DROP COLUMN IF EXISTS last_sync_at,
      DROP COLUMN IF EXISTS last_sync_status,
      DROP COLUMN IF EXISTS last_sync_error`,
    { transaction },
  );
};

module.exports = { name: '003_add_tiktok_token_lifecycle', up, down };
