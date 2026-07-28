const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS content_teams (
      id SERIAL PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      legacy_key VARCHAR(80) UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS content_teams_name_lower_idx
    ON content_teams (LOWER(name));

    CREATE TABLE IF NOT EXISTS user_content_attributions (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      team_id INTEGER REFERENCES content_teams(id) ON DELETE SET NULL,
      hashtags JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT user_content_attributions_hashtags_array
        CHECK (jsonb_typeof(hashtags) = 'array')
    );

    CREATE INDEX IF NOT EXISTS user_content_attributions_team_idx
    ON user_content_attributions (team_id);
  `, { transaction });

  await sequelize.query(`
    WITH rules AS (
      SELECT rule
      FROM tiktok_channels channel
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(channel.content_attribution_rules) = 'array'
            THEN channel.content_attribution_rules
          ELSE '[]'::jsonb
        END
      ) AS rule
      WHERE COALESCE(rule->>'type', '') <> 'settings'
    ),
    team_candidates AS (
      SELECT DISTINCT ON (UPPER(rule->>'group'))
        UPPER(rule->>'group') AS legacy_key,
        LEFT(COALESCE(
          NULLIF(BTRIM(rule->>'team_name'), ''),
          CASE UPPER(rule->>'group')
            WHEN 'CONTENT_MKT' THEN 'Team Content MKT'
            WHEN 'CONTENT_AI' THEN 'Content AI'
            WHEN 'NEWS' THEN 'Team Tin tức'
            ELSE UPPER(rule->>'group')
          END
        ), 120) AS name
      FROM rules
      WHERE NULLIF(BTRIM(rule->>'group'), '') IS NOT NULL
        AND (
          rule->>'type' = 'team'
          OR (NULLIF(rule->>'type', '') IS NULL AND NULLIF(rule->>'user_id', '') IS NULL)
        )
      ORDER BY UPPER(rule->>'group')
    )
    INSERT INTO content_teams (legacy_key, name)
    SELECT legacy_key, name
    FROM team_candidates
    ON CONFLICT DO NOTHING
  `, { transaction });

  await sequelize.query(`
    WITH rules AS (
      SELECT rule
      FROM tiktok_channels channel
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(channel.content_attribution_rules) = 'array'
            THEN channel.content_attribution_rules
          ELSE '[]'::jsonb
        END
      ) AS rule
      WHERE COALESCE(rule->>'type', '') <> 'settings'
    ),
    missing_groups AS (
      SELECT DISTINCT UPPER(rule->>'group') AS legacy_key
      FROM rules
      WHERE NULLIF(rule->>'user_id', '') ~ '^[0-9]+$'
        AND NULLIF(BTRIM(rule->>'group'), '') IS NOT NULL
    )
    INSERT INTO content_teams (legacy_key, name)
    SELECT
      legacy_key,
      CASE legacy_key
        WHEN 'CONTENT_MKT' THEN 'Team Content MKT'
        WHEN 'CONTENT_AI' THEN 'Content AI'
        WHEN 'NEWS' THEN 'Team Tin tức'
        ELSE legacy_key
      END
    FROM missing_groups
    ON CONFLICT DO NOTHING
  `, { transaction });

  await sequelize.query(`
    WITH rules AS (
      SELECT rule
      FROM tiktok_channels channel
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(channel.content_attribution_rules) = 'array'
            THEN channel.content_attribution_rules
          ELSE '[]'::jsonb
        END
      ) AS rule
      WHERE NULLIF(rule->>'user_id', '') ~ '^[0-9]+$'
    ),
    employee_rules AS (
      SELECT DISTINCT ON ((rule->>'user_id')::integer)
        (rule->>'user_id')::integer AS user_id,
        UPPER(rule->>'group') AS legacy_key,
        CASE
          WHEN jsonb_typeof(rule->'hashtags') = 'array' THEN rule->'hashtags'
          ELSE '[]'::jsonb
        END AS hashtags
      FROM rules
      ORDER BY (rule->>'user_id')::integer
    )
    INSERT INTO user_content_attributions (user_id, team_id, hashtags)
    SELECT employee.user_id, team.id, employee.hashtags
    FROM employee_rules employee
    JOIN users ON users.id = employee.user_id
    LEFT JOIN content_teams team ON team.legacy_key = employee.legacy_key
    ON CONFLICT (user_id) DO UPDATE SET
      team_id = EXCLUDED.team_id,
      hashtags = EXCLUDED.hashtags,
      updated_at = NOW()
  `, { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    DROP TABLE IF EXISTS user_content_attributions;
    DROP TABLE IF EXISTS content_teams;
  `, { transaction });
};

module.exports = { name: '045_create_content_teams', up, down };
