const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    INSERT INTO scheduled_jobs (job_key, name, description, enabled, timezone, run_times)
    VALUES (
      'tiktok_creator_performance_6_months',
      'TikTok Creator Performance 6 Months',
      'Backfill six contiguous, non-overlapping 30-day Creator Performance windows (approximately 180 days).',
      FALSE,
      'Asia/Kuala_Lumpur',
      '["03:00"]'::jsonb
    )
    ON CONFLICT (job_key) DO NOTHING
  `, { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    DELETE FROM scheduled_jobs
    WHERE job_key = 'tiktok_creator_performance_6_months'
  `, { transaction });
};

module.exports = { name: '043_add_creator_performance_six_month_schedule', up, down };
