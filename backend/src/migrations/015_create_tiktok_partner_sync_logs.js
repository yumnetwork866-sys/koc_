const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS tiktok_partner_sync_logs (
      id SERIAL PRIMARY KEY,
      authorization_id INTEGER NOT NULL REFERENCES tiktok_partner_authorizations(id) ON DELETE CASCADE,
      creator_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status VARCHAR(32) NOT NULL,
      error TEXT,
      synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `, { transaction });
  await sequelize.query('CREATE INDEX IF NOT EXISTS tiktok_partner_sync_logs_creator_date_idx ON tiktok_partner_sync_logs (creator_id, synced_at DESC)', { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query('DROP TABLE IF EXISTS tiktok_partner_sync_logs', { transaction });
};

module.exports = { name: '015_create_tiktok_partner_sync_logs', up, down };
