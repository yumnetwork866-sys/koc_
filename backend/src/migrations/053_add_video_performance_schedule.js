const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    INSERT INTO scheduled_jobs (job_key, name, description, enabled, timezone, run_times)
    VALUES (
      'tiktok_affiliate_video_performance',
      'TikTok Affiliate Video Performance',
      'Synchronize the latest seven days of Affiliate Center video analytics for every connected Shop.',
      TRUE,
      'Asia/Ho_Chi_Minh',
      '["06:00"]'::jsonb
    )
    ON CONFLICT (job_key) DO NOTHING
  `, { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    DELETE FROM scheduled_jobs WHERE job_key = 'tiktok_affiliate_video_performance'
  `, { transaction });
};

module.exports = { name: '053_add_video_performance_schedule', up, down };
