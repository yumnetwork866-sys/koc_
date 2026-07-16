const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS tiktok_creator_performance_exports (
      id SERIAL PRIMARY KEY,
      shop_id INTEGER NOT NULL REFERENCES tiktok_shops(id) ON DELETE CASCADE,
      task_id VARCHAR(255) NOT NULL,
      module_type VARCHAR(32) NOT NULL DEFAULT 'CREATOR',
      window_type VARCHAR(32) NOT NULL,
      plan_type VARCHAR(32) NOT NULL DEFAULT 'ALL',
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'PROCESSING',
      request_id VARCHAR(255),
      row_count INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ,
      UNIQUE (shop_id, task_id)
    )
  `, { transaction });
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS tiktok_creator_performance_snapshots (
      id SERIAL PRIMARY KEY,
      export_id INTEGER NOT NULL REFERENCES tiktok_creator_performance_exports(id) ON DELETE CASCADE,
      shop_id INTEGER NOT NULL REFERENCES tiktok_shops(id) ON DELETE CASCADE,
      username VARCHAR(255) NOT NULL,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      window_type VARCHAR(32) NOT NULL,
      plan_type VARCHAR(32) NOT NULL DEFAULT 'ALL',
      currency VARCHAR(16) NOT NULL,
      affiliate_gmv NUMERIC(20, 4) NOT NULL DEFAULT 0,
      live_gmv NUMERIC(20, 4) NOT NULL DEFAULT 0,
      video_gmv NUMERIC(20, 4) NOT NULL DEFAULT 0,
      product_card_gmv NUMERIC(20, 4) NOT NULL DEFAULT 0,
      affiliate_products_sold INTEGER NOT NULL DEFAULT 0,
      items_sold INTEGER NOT NULL DEFAULT 0,
      estimated_commission NUMERIC(20, 4) NOT NULL DEFAULT 0,
      estimated_flat_fee NUMERIC(20, 4),
      average_order_value NUMERIC(20, 4) NOT NULL DEFAULT 0,
      product_showcase_count INTEGER NOT NULL DEFAULT 0,
      affiliate_orders INTEGER NOT NULL DEFAULT 0,
      ctr NUMERIC(12, 8) NOT NULL DEFAULT 0,
      product_impressions BIGINT NOT NULL DEFAULT 0,
      average_affiliate_customers NUMERIC(20, 4) NOT NULL DEFAULT 0,
      live_streams INTEGER NOT NULL DEFAULT 0,
      shoppable_videos INTEGER NOT NULL DEFAULT 0,
      target_gmv NUMERIC(20, 4) NOT NULL DEFAULT 0,
      target_estimated_commission NUMERIC(20, 4) NOT NULL DEFAULT 0,
      open_gmv NUMERIC(20, 4) NOT NULL DEFAULT 0,
      open_estimated_commission NUMERIC(20, 4) NOT NULL DEFAULT 0,
      refunded_gmv NUMERIC(20, 4) NOT NULL DEFAULT 0,
      items_refunded INTEGER NOT NULL DEFAULT 0,
      followers BIGINT NOT NULL DEFAULT 0,
      raw_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
      synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (shop_id, username, start_date, end_date, plan_type)
    )
  `, { transaction });
  await sequelize.query('CREATE INDEX IF NOT EXISTS creator_performance_lookup_idx ON tiktok_creator_performance_snapshots (shop_id, end_date DESC, affiliate_gmv DESC)', { transaction });
  await sequelize.query('CREATE INDEX IF NOT EXISTS creator_performance_export_status_idx ON tiktok_creator_performance_exports (shop_id, status, created_at DESC)', { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query('DROP TABLE IF EXISTS tiktok_creator_performance_snapshots', { transaction });
  await sequelize.query('DROP TABLE IF EXISTS tiktok_creator_performance_exports', { transaction });
};

module.exports = { name: '021_create_tiktok_creator_performance', up, down };
