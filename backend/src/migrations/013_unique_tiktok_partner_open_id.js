const up = async ({ sequelize, transaction }) => {
  await sequelize.query(
    'CREATE UNIQUE INDEX IF NOT EXISTS tiktok_partner_authorizations_open_id_unique_idx ON tiktok_partner_authorizations (open_id) WHERE open_id IS NOT NULL',
    { transaction },
  );
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query('DROP INDEX IF EXISTS tiktok_partner_authorizations_open_id_unique_idx', { transaction });
};

module.exports = { name: '013_unique_tiktok_partner_open_id', up, down };
