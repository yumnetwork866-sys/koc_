const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    ALTER TABLE videos
      ALTER COLUMN title TYPE TEXT;
  `, { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    ALTER TABLE videos
      ALTER COLUMN title TYPE VARCHAR(255)
      USING LEFT(title, 255);
  `, { transaction });
};

module.exports = { name: '047_expand_video_title', up, down };
