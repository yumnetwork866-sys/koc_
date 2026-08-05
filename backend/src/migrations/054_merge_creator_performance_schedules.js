const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    UPDATE scheduled_job_runs run
    SET
      scheduled_job_id = primary_job.id,
      scheduled_key = 'MERGED_6_MONTH_RUN:' || run.id
    FROM scheduled_jobs old_job, scheduled_jobs primary_job
    WHERE run.scheduled_job_id = old_job.id
      AND old_job.job_key = 'tiktok_creator_performance_6_months'
      AND primary_job.job_key = 'tiktok_creator_performance'
  `, { transaction });
  await sequelize.query(`
    DELETE FROM scheduled_jobs WHERE job_key = 'tiktok_creator_performance_6_months'
  `, { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    INSERT INTO scheduled_jobs (job_key, name, description, enabled, timezone, run_times)
    VALUES (
      'tiktok_creator_performance_6_months',
      'TikTok Creator Performance 6 Months',
      'Backfill six contiguous, non-overlapping 30-day Creator Performance windows.',
      FALSE,
      'Asia/Ho_Chi_Minh',
      '["03:00"]'::jsonb
    )
    ON CONFLICT (job_key) DO NOTHING
  `, { transaction });
};

module.exports = { name: '054_merge_creator_performance_schedules', up, down };
