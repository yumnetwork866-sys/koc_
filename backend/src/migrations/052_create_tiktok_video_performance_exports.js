const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS tiktok_video_performance_snapshots (
      id SERIAL PRIMARY KEY,
      export_id INTEGER NOT NULL REFERENCES tiktok_creator_performance_exports(id) ON DELETE CASCADE,
      shop_id INTEGER NOT NULL REFERENCES tiktok_shops(id) ON DELETE CASCADE,
      video_title TEXT,
      video_id VARCHAR(128) NOT NULL,
      post_date VARCHAR(64),
      video_link TEXT,
      creator_name VARCHAR(255),
      product_id TEXT,
      creator_attributed_gmv NUMERIC(20, 4) NOT NULL DEFAULT 0,
      attributed_orders INTEGER NOT NULL DEFAULT 0,
      aov NUMERIC(20, 4) NOT NULL DEFAULT 0,
      attributed_items_sold INTEGER NOT NULL DEFAULT 0,
      refunds NUMERIC(20, 4) NOT NULL DEFAULT 0,
      items_refunded INTEGER NOT NULL DEFAULT 0,
      likes BIGINT NOT NULL DEFAULT 0,
      comments BIGINT NOT NULL DEFAULT 0,
      shares BIGINT NOT NULL DEFAULT 0,
      product_impressions BIGINT NOT NULL DEFAULT 0,
      product_clicks BIGINT NOT NULL DEFAULT 0,
      completion_rate NUMERIC(12, 6),
      video_views BIGINT NOT NULL DEFAULT 0,
      ctr NUMERIC(12, 6),
      video_gpm NUMERIC(20, 4) NOT NULL DEFAULT 0,
      engagement NUMERIC(12, 6),
      avg_gmv_per_customer NUMERIC(20, 4) NOT NULL DEFAULT 0,
      estimated_commission NUMERIC(20, 4) NOT NULL DEFAULT 0,
      raw_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
      synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (export_id, video_id)
    )
  `, { transaction });
  await sequelize.query('CREATE INDEX IF NOT EXISTS tiktok_video_performance_lookup_idx ON tiktok_video_performance_snapshots (shop_id, post_date, creator_attributed_gmv DESC)', { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query('DROP TABLE IF EXISTS tiktok_video_performance_snapshots', { transaction });
};

module.exports = { name: '052_create_tiktok_video_performance_exports', up, down };
