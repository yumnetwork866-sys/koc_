const up = async ({ sequelize, transaction }) => {
  await sequelize.query(
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE',
    { transaction },
  );
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query('ALTER TABLE users DROP COLUMN IF EXISTS is_active', { transaction });
};

module.exports = { name: '056_add_users_is_active', up, down };
