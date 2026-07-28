const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    ALTER TABLE tiktok_channels
    ADD COLUMN IF NOT EXISTS content_attribution_rules JSONB NOT NULL DEFAULT '[]'::jsonb
  `, { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    ALTER TABLE tiktok_channels
    DROP COLUMN IF EXISTS content_attribution_rules
  `, { transaction });
};

module.exports = { name: '044_add_channel_content_attribution_rules', up, down };
