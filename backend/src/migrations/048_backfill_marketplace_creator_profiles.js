const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    WITH marketplace_profiles AS (
      SELECT DISTINCT ON (shop_id, LOWER(username))
        shop_id,
        creator_open_id,
        LOWER(username) AS username,
        nickname,
        COALESCE(profile #>> '{avatar,url}', profile->>'avatar_url') AS avatar_url,
        CASE
          WHEN COALESCE(profile->>'follower_count', profile->>'followers', '') ~ '^[0-9]+$'
            THEN COALESCE(profile->>'follower_count', profile->>'followers')::BIGINT
          ELSE 0
        END AS follower_count,
        last_seen_at
      FROM tiktok_marketplace_creators
      WHERE NULLIF(BTRIM(username), '') IS NOT NULL
      ORDER BY shop_id, LOWER(username), last_seen_at DESC
    )
    INSERT INTO tiktok_creator_profiles (
      shop_id,
      creator_open_id,
      username,
      nickname,
      avatar_url,
      follower_count,
      source,
      refreshed_at,
      updated_at
    )
    SELECT
      shop_id,
      creator_open_id,
      username,
      nickname,
      avatar_url,
      follower_count,
      'marketplace_discovery',
      last_seen_at,
      NOW()
    FROM marketplace_profiles
    ON CONFLICT (shop_id, username) DO UPDATE SET
      creator_open_id = COALESCE(EXCLUDED.creator_open_id, tiktok_creator_profiles.creator_open_id),
      nickname = COALESCE(EXCLUDED.nickname, tiktok_creator_profiles.nickname),
      avatar_url = COALESCE(EXCLUDED.avatar_url, tiktok_creator_profiles.avatar_url),
      follower_count = CASE
        WHEN EXCLUDED.follower_count > 0 THEN EXCLUDED.follower_count
        ELSE tiktok_creator_profiles.follower_count
      END,
      source = 'marketplace_discovery',
      refreshed_at = GREATEST(tiktok_creator_profiles.refreshed_at, EXCLUDED.refreshed_at),
      updated_at = NOW();
  `, { transaction });
};

// This is a cache backfill. Rolling it back must not delete profiles that may
// already be shared by Performance, Discovery, and collaboration screens.
const down = async () => {};

module.exports = { name: '048_backfill_marketplace_creator_profiles', up, down };
