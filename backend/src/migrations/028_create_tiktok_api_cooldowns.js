const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS tiktok_api_cooldowns (
      shop_id INTEGER NOT NULL REFERENCES tiktok_shops(id) ON DELETE CASCADE,
      namespace VARCHAR(100) NOT NULL,
      cooldown_until TIMESTAMPTZ NOT NULL,
      reason TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (shop_id, namespace)
    )
  `, { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query('DROP TABLE IF EXISTS tiktok_api_cooldowns', { transaction });
};

module.exports = { name: '028_create_tiktok_api_cooldowns', up, down };
