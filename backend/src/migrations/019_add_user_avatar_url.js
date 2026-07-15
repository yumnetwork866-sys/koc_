const up = async ({ sequelize, transaction }) => {
  await sequelize.query(
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT',
    { transaction },
  );
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query('ALTER TABLE users DROP COLUMN IF EXISTS avatar_url', { transaction });
};

module.exports = { name: '019_add_user_avatar_url', up, down };
