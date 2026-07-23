const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    ALTER TABLE weekly_reports
    ADD COLUMN IF NOT EXISTS public_share_token VARCHAR(64)
  `, { transaction });
  await sequelize.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS weekly_reports_public_share_token_idx
    ON weekly_reports (public_share_token)
    WHERE public_share_token IS NOT NULL
  `, { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query('DROP INDEX IF EXISTS weekly_reports_public_share_token_idx', { transaction });
  await sequelize.query(`
    ALTER TABLE weekly_reports
    DROP COLUMN IF EXISTS public_share_token
  `, { transaction });
};

module.exports = { name: '039_add_weekly_report_public_sharing', up, down };
