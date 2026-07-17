const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS tiktok_creator_profiles (
      id SERIAL PRIMARY KEY,
      shop_id INTEGER NOT NULL REFERENCES tiktok_shops(id) ON DELETE CASCADE,
      creator_open_id VARCHAR(255),
      username VARCHAR(255) NOT NULL,
      nickname VARCHAR(255),
      avatar_url TEXT,
      follower_count BIGINT NOT NULL DEFAULT 0,
      source VARCHAR(32) NOT NULL DEFAULT 'unknown',
      refreshed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (shop_id, username)
    )
  `, { transaction });
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS tiktok_creator_profiles_open_id_idx
    ON tiktok_creator_profiles (shop_id, creator_open_id)
  `, { transaction });
  await sequelize.query(`
    INSERT INTO tiktok_creator_profiles (
      shop_id, creator_open_id, username, nickname, avatar_url,
      follower_count, source, refreshed_at, updated_at
    )
    SELECT DISTINCT ON (shop_id, LOWER(TRIM(LEADING '@' FROM username)))
      shop_id,
      creator_open_id,
      LOWER(TRIM(LEADING '@' FROM username)),
      nickname,
      avatar_url,
      COALESCE(followers, 0),
      'performance',
      synced_at,
      NOW()
    FROM tiktok_creator_performance_snapshots
    WHERE NULLIF(TRIM(LEADING '@' FROM username), '') IS NOT NULL
    ORDER BY
      shop_id,
      LOWER(TRIM(LEADING '@' FROM username)),
      (avatar_url IS NOT NULL) DESC,
      synced_at DESC
    ON CONFLICT (shop_id, username) DO NOTHING
  `, { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query('DROP TABLE IF EXISTS tiktok_creator_profiles', { transaction });
};

module.exports = { name: '025_create_tiktok_creator_profiles', up, down };
