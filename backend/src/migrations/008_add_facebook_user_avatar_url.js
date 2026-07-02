const up = async ({ sequelize, transaction }) => {
  await sequelize.query(
    'ALTER TABLE facebook_user_sessions ADD COLUMN IF NOT EXISTS avatar_url TEXT',
    { transaction },
  );
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query('ALTER TABLE facebook_user_sessions DROP COLUMN IF EXISTS avatar_url', { transaction });
};

module.exports = { name: '008_add_facebook_user_avatar_url', up, down };
