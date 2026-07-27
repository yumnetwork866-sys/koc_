const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    ALTER TABLE bookings
      ADD COLUMN IF NOT EXISTS total_cost NUMERIC(14, 2),
      ADD COLUMN IF NOT EXISTS cost_note TEXT,
      ADD COLUMN IF NOT EXISTS currency VARCHAR(16) NOT NULL DEFAULT 'MYR'
  `, { transaction });
  await sequelize.query(`
    UPDATE bookings
    SET total_cost = booking_cost
    WHERE total_cost IS NULL
  `, { transaction });

  await sequelize.query(`
    ALTER TABLE tiktok_creator_performance_snapshots
      ALTER COLUMN video_views DROP DEFAULT,
      ALTER COLUMN video_views DROP NOT NULL
  `, { transaction });
  await sequelize.query(`
    UPDATE tiktok_creator_performance_snapshots
    SET video_views = NULL
    WHERE NOT (COALESCE(raw_metrics, '{}'::jsonb) ? 'Video views')
  `, { transaction });

  await sequelize.query(`
    UPDATE scheduled_jobs
    SET run_times = '["00:00","06:00","12:00","18:00"]'::jsonb,
        updated_at = NOW()
    WHERE job_key = 'booking_video_performance'
  `, { transaction });
  await sequelize.query(`
    UPDATE scheduled_jobs
    SET run_times = '["05:30","11:30","17:30","23:30"]'::jsonb,
        updated_at = NOW()
    WHERE job_key = 'tiktok_shop_video_catalog'
  `, { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    UPDATE scheduled_jobs
    SET run_times = '["06:00"]'::jsonb,
        updated_at = NOW()
    WHERE job_key = 'booking_video_performance'
  `, { transaction });
  await sequelize.query(`
    UPDATE scheduled_jobs
    SET run_times = '["05:30"]'::jsonb,
        updated_at = NOW()
    WHERE job_key = 'tiktok_shop_video_catalog'
  `, { transaction });
  await sequelize.query(`
    UPDATE tiktok_creator_performance_snapshots
    SET video_views = 0
    WHERE video_views IS NULL
  `, { transaction });
  await sequelize.query(`
    ALTER TABLE tiktok_creator_performance_snapshots
      ALTER COLUMN video_views SET DEFAULT 0,
      ALTER COLUMN video_views SET NOT NULL
  `, { transaction });
  await sequelize.query(`
    ALTER TABLE bookings
      DROP COLUMN IF EXISTS currency,
      DROP COLUMN IF EXISTS cost_note,
      DROP COLUMN IF EXISTS total_cost
  `, { transaction });
};

module.exports = { name: '042_improve_booking_evaluation_data', up, down };
