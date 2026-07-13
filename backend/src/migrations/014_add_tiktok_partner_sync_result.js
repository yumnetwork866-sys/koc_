const up = async ({ sequelize, transaction }) => {
  await sequelize.query('ALTER TABLE tiktok_partner_authorizations ADD COLUMN IF NOT EXISTS last_sync_status VARCHAR(32)', { transaction });
  await sequelize.query('ALTER TABLE tiktok_partner_authorizations ADD COLUMN IF NOT EXISTS last_sync_error TEXT', { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query('ALTER TABLE tiktok_partner_authorizations DROP COLUMN IF EXISTS last_sync_error', { transaction });
  await sequelize.query('ALTER TABLE tiktok_partner_authorizations DROP COLUMN IF EXISTS last_sync_status', { transaction });
};

module.exports = { name: '014_add_tiktok_partner_sync_result', up, down };
