const statements = [
  `CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL, email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255),
    role VARCHAR(255) NOT NULL DEFAULT 'member'
  )`,
  `CREATE TABLE IF NOT EXISTS tiktok_channels (
    id SERIAL PRIMARY KEY, platform VARCHAR(255) NOT NULL DEFAULT 'tiktok',
    tiktok_open_id VARCHAR(255) UNIQUE, username VARCHAR(255) NOT NULL UNIQUE,
    display_name VARCHAR(255) NOT NULL, avatar_url TEXT, avatar_large_url TEXT,
    bio_description TEXT, is_verified BOOLEAN, follower_count INTEGER, following_count INTEGER,
    likes_count INTEGER, video_count INTEGER, profile_url TEXT,
    access_token_encrypted TEXT, refresh_token_encrypted TEXT, token_expires_at TIMESTAMPTZ,
    sync_source VARCHAR(255) NOT NULL DEFAULT 'import'
  )`,
  `CREATE TABLE IF NOT EXISTS videos (
    id SERIAL PRIMARY KEY, platform VARCHAR(255) NOT NULL DEFAULT 'tiktok',
    platform_video_id VARCHAR(255) NOT NULL UNIQUE,
    channel_id INTEGER NOT NULL REFERENCES tiktok_channels(id), title VARCHAR(255) NOT NULL,
    video_url TEXT, thumbnail_url TEXT, published_at TIMESTAMPTZ,
    views INTEGER DEFAULT 0, likes INTEGER DEFAULT 0, comments INTEGER DEFAULT 0, shares INTEGER DEFAULT 0,
    duration INTEGER, campaign VARCHAR(255), content_type VARCHAR(255), last_synced_at TIMESTAMPTZ
  )`,
  `CREATE TABLE IF NOT EXISTS products (id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL UNIQUE)`,
  `CREATE TABLE IF NOT EXISTS video_products (
    video_id INTEGER NOT NULL REFERENCES videos(id), product_id INTEGER NOT NULL REFERENCES products(id),
    PRIMARY KEY (video_id, product_id)
  )`,
  `CREATE TABLE IF NOT EXISTS video_assignments (
    id SERIAL PRIMARY KEY, video_id INTEGER NOT NULL REFERENCES videos(id),
    user_id INTEGER NOT NULL REFERENCES users(id), assignment_role VARCHAR(255) NOT NULL,
    UNIQUE (video_id, user_id, assignment_role)
  )`,
  `CREATE TABLE IF NOT EXISTS video_daily_stats (
    id SERIAL PRIMARY KEY, video_id INTEGER NOT NULL REFERENCES videos(id), date DATE NOT NULL,
    views INTEGER DEFAULT 0, likes INTEGER DEFAULT 0, comments INTEGER DEFAULT 0, shares INTEGER DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS weekly_reports (
    id SERIAL PRIMARY KEY, week_start DATE NOT NULL, week_end DATE NOT NULL, generated_content TEXT NOT NULL
  )`,
];

const up = async ({ sequelize, transaction }) => {
  for (const statement of statements) {
    await sequelize.query(statement, { transaction });
  }
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query(
    'DROP TABLE IF EXISTS weekly_reports, video_daily_stats, video_assignments, video_products, products, videos, tiktok_channels, users CASCADE',
    { transaction },
  );
};

module.exports = { name: '001_create_tables', up, down };
