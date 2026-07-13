const statements = [
  'ALTER TABLE tiktok_partner_authorizations ADD COLUMN IF NOT EXISTS username VARCHAR(255)',
  'ALTER TABLE tiktok_partner_authorizations ADD COLUMN IF NOT EXISTS avatar_url TEXT',
  'ALTER TABLE tiktok_partner_authorizations ADD COLUMN IF NOT EXISTS register_region VARCHAR(32)',
  'ALTER TABLE tiktok_partner_authorizations ADD COLUMN IF NOT EXISTS showcase_count INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE tiktok_partner_authorizations ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ',
];

const up = async ({ sequelize, transaction }) => {
  for (const statement of statements) await sequelize.query(statement, { transaction });
};

const down = async ({ sequelize, transaction }) => {
  for (const column of ['last_synced_at', 'showcase_count', 'register_region', 'avatar_url', 'username']) {
    await sequelize.query(`ALTER TABLE tiktok_partner_authorizations DROP COLUMN IF EXISTS ${column}`, { transaction });
  }
};

module.exports = { name: '013_add_tiktok_partner_creator_metadata', up, down };
