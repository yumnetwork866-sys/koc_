const up = async ({ sequelize, transaction }) => {
  await sequelize.query(
    'ALTER TABLE tiktok_channels ADD COLUMN IF NOT EXISTS creator_id INTEGER',
    { transaction },
  );
  await sequelize.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tiktok_channels_creator_id_fkey') THEN
        ALTER TABLE tiktok_channels
          ADD CONSTRAINT tiktok_channels_creator_id_fkey
          FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE SET NULL;
      END IF;
    END $$
  `, { transaction });
  await sequelize.query(
    'CREATE UNIQUE INDEX IF NOT EXISTS tiktok_channels_creator_id_unique_idx ON tiktok_channels (creator_id) WHERE creator_id IS NOT NULL',
    { transaction },
  );
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query('DROP INDEX IF EXISTS tiktok_channels_creator_id_unique_idx', { transaction });
  await sequelize.query('ALTER TABLE tiktok_channels DROP CONSTRAINT IF EXISTS tiktok_channels_creator_id_fkey', { transaction });
  await sequelize.query('ALTER TABLE tiktok_channels DROP COLUMN IF EXISTS creator_id', { transaction });
};

module.exports = { name: '020_add_koc_tiktok_channel_mapping', up, down };
