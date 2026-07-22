const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS tiktok_marketplace_request_gates (
      shop_id INTEGER PRIMARY KEY REFERENCES tiktok_shops(id) ON DELETE CASCADE,
      next_request_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `, { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query('DROP TABLE IF EXISTS tiktok_marketplace_request_gates', { transaction });
};

module.exports = { name: '032_create_tiktok_marketplace_request_gates', up, down };
