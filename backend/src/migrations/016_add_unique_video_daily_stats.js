const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    DELETE FROM video_daily_stats older
    USING video_daily_stats newer
    WHERE older.video_id = newer.video_id AND older.date = newer.date AND older.id < newer.id
  `, { transaction });
  await sequelize.query('CREATE UNIQUE INDEX IF NOT EXISTS video_daily_stats_video_date_unique_idx ON video_daily_stats (video_id, date)', { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query('DROP INDEX IF EXISTS video_daily_stats_video_date_unique_idx', { transaction });
};

module.exports = { name: '016_add_unique_video_daily_stats', up, down };
