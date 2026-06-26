const indexes = [
  'CREATE INDEX IF NOT EXISTS videos_published_at_idx ON videos (published_at)',
  'CREATE INDEX IF NOT EXISTS videos_channel_id_idx ON videos (channel_id)',
  'CREATE INDEX IF NOT EXISTS video_assignments_user_id_video_id_idx ON video_assignments (user_id, video_id)',
  'CREATE INDEX IF NOT EXISTS video_daily_stats_video_id_date_idx ON video_daily_stats (video_id, date)',
  'CREATE INDEX IF NOT EXISTS video_daily_stats_date_idx ON video_daily_stats (date)',
];

const up = async ({ sequelize, transaction }) => {
  for (const statement of indexes) await sequelize.query(statement, { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query(
    'DROP INDEX IF EXISTS videos_published_at_idx, videos_channel_id_idx, video_assignments_user_id_video_id_idx, video_daily_stats_video_id_date_idx, video_daily_stats_date_idx',
    { transaction },
  );
};

module.exports = { name: '004_add_kpi_indexes', up, down };
