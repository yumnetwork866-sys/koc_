const up = async ({ sequelize, transaction }) => {
  await sequelize.query(
    'ALTER TABLE facebook_pages ADD COLUMN IF NOT EXISTS avatar_url TEXT',
    { transaction },
  );
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query('ALTER TABLE facebook_pages DROP COLUMN IF EXISTS avatar_url', { transaction });
};

module.exports = { name: '009_add_facebook_page_avatar_url', up, down };
