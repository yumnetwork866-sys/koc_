const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS tiktok_base_performance_snapshots (
      id SERIAL PRIMARY KEY,
      export_id INTEGER NOT NULL REFERENCES tiktok_creator_performance_exports(id) ON DELETE CASCADE,
      shop_id INTEGER NOT NULL REFERENCES tiktok_shops(id) ON DELETE CASCADE,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      window_type VARCHAR(32) NOT NULL,
      currency VARCHAR(16) NOT NULL,
      creator_attributed_gmv NUMERIC(20, 4) NOT NULL DEFAULT 0,
      creator_attributed_items_sold INTEGER NOT NULL DEFAULT 0,
      refunds NUMERIC(20, 4) NOT NULL DEFAULT 0,
      estimated_commission NUMERIC(20, 4) NOT NULL DEFAULT 0,
      videos INTEGER NOT NULL DEFAULT 0,
      live_streams INTEGER NOT NULL DEFAULT 0,
      samples_shipped INTEGER NOT NULL DEFAULT 0,
      items_refunded INTEGER NOT NULL DEFAULT 0,
      average_order_value NUMERIC(20, 4) NOT NULL DEFAULT 0,
      raw_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
      synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (shop_id, start_date, end_date, window_type)
    )
  `, { transaction });
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS base_performance_lookup_idx
    ON tiktok_base_performance_snapshots (shop_id, end_date DESC)
  `, { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query('DROP TABLE IF EXISTS tiktok_base_performance_snapshots', { transaction });
};

module.exports = { name: '026_create_tiktok_base_performance_snapshots', up, down };
