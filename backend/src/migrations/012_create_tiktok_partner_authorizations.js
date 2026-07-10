const statements = [
  `CREATE TABLE IF NOT EXISTS tiktok_partner_authorizations (
    id SERIAL PRIMARY KEY,
    creator_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    open_id VARCHAR(255),
    user_type INTEGER NOT NULL DEFAULT 1,
    granted_scopes TEXT,
    access_token_encrypted TEXT NOT NULL,
    refresh_token_encrypted TEXT,
    access_token_expires_at TIMESTAMPTZ,
    refresh_token_expires_at TIMESTAMPTZ,
    shop_id VARCHAR(255),
    connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  'CREATE INDEX IF NOT EXISTS tiktok_partner_authorizations_creator_id_idx ON tiktok_partner_authorizations (creator_id)',
  'CREATE INDEX IF NOT EXISTS tiktok_partner_authorizations_open_id_idx ON tiktok_partner_authorizations (open_id)',
];

const up = async ({ sequelize, transaction }) => {
  for (const statement of statements) await sequelize.query(statement, { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query('DROP TABLE IF EXISTS tiktok_partner_authorizations CASCADE', { transaction });
};

module.exports = { name: '012_create_tiktok_partner_authorizations', up, down };
