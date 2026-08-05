const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    UPDATE scheduled_jobs
    SET
      description = 'Synchronize the latest seven-day and thirty-day Affiliate Center video analytics periods for every connected Shop.',
      updated_at = NOW()
    WHERE job_key = 'tiktok_affiliate_video_performance'
  `, { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    UPDATE scheduled_jobs
    SET
      description = 'Synchronize the latest seven days of Affiliate Center video analytics for every connected Shop.',
      updated_at = NOW()
    WHERE job_key = 'tiktok_affiliate_video_performance'
  `, { transaction });
};

module.exports = { name: '055_update_affiliate_video_schedule_periods', up, down };
