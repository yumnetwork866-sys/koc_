const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS tiktok_creator_contact_histories (
      id BIGSERIAL PRIMARY KEY,
      shop_id INTEGER NOT NULL REFERENCES tiktok_shops(id) ON DELETE CASCADE,
      creator_open_id VARCHAR(255),
      username VARCHAR(255) NOT NULL,
      last_invited_at TIMESTAMPTZ,
      last_messaged_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (shop_id, username)
    )
  `, { transaction });
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS tiktok_creator_contact_histories_open_id_idx
    ON tiktok_creator_contact_histories (shop_id, creator_open_id)
  `, { transaction });
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS tiktok_creator_contact_histories_recent_idx
    ON tiktok_creator_contact_histories (shop_id, last_invited_at DESC, last_messaged_at DESC)
  `, { transaction });
  await sequelize.query(`
    INSERT INTO tiktok_creator_contact_histories (
      shop_id, creator_open_id, username, last_invited_at, updated_at
    )
    SELECT shop_id, creator_open_id, LOWER(username), refreshed_at, NOW()
    FROM tiktok_creator_profiles
    WHERE source = 'target_collaboration'
      AND username IS NOT NULL
      AND refreshed_at >= NOW() - INTERVAL '90 days'
    ON CONFLICT (shop_id, username) DO UPDATE SET
      creator_open_id = COALESCE(EXCLUDED.creator_open_id, tiktok_creator_contact_histories.creator_open_id),
      last_invited_at = GREATEST(
        tiktok_creator_contact_histories.last_invited_at,
        EXCLUDED.last_invited_at
      ),
      updated_at = NOW()
  `, { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query('DROP TABLE IF EXISTS tiktok_creator_contact_histories', { transaction });
};

module.exports = { name: '035_create_tiktok_creator_contact_histories', up, down };
