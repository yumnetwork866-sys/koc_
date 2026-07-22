const numericFromRaw = (key) => `COALESCE(
  substring(replace(COALESCE(raw_metrics->>'${key}', ''), ',', '') from '-?[0-9]+[.]?[0-9]*'),
  '0'
)::numeric`;

const integerFromRaw = (key) => `ROUND(${numericFromRaw(key)})::bigint`;

const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    ALTER TABLE tiktok_creator_performance_snapshots
      ADD COLUMN IF NOT EXISTS products_sold BIGINT NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS products_added_to_showcase BIGINT NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS total_sample_content BIGINT NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS samples_shipped BIGINT NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS ctor NUMERIC(12, 8) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS customers BIGINT NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS video_views BIGINT NOT NULL DEFAULT 0
  `, { transaction });

  await sequelize.query(`
    UPDATE tiktok_creator_performance_snapshots
    SET
      live_gmv = CASE
        WHEN raw_metrics ? 'Creator LIVE-attributed GMV' THEN ${numericFromRaw('Creator LIVE-attributed GMV')}
        ELSE live_gmv
      END,
      video_gmv = CASE
        WHEN raw_metrics ? 'Creator video-attributed GMV' THEN ${numericFromRaw('Creator video-attributed GMV')}
        ELSE video_gmv
      END,
      product_card_gmv = CASE
        WHEN raw_metrics ? 'Affiliate product card-attributed GMV' THEN ${numericFromRaw('Affiliate product card-attributed GMV')}
        ELSE product_card_gmv
      END,
      affiliate_products_sold = CASE
        WHEN raw_metrics ? 'Products sold' THEN ${integerFromRaw('Products sold')}
        ELSE affiliate_products_sold
      END,
      products_sold = CASE
        WHEN raw_metrics ? 'Products sold' THEN ${integerFromRaw('Products sold')}
        WHEN raw_metrics ? 'Affiliate products sold' THEN ${integerFromRaw('Affiliate products sold')}
        ELSE products_sold
      END,
      products_added_to_showcase = CASE
        WHEN raw_metrics ? 'Products added to showcase' THEN ${integerFromRaw('Products added to showcase')}
        WHEN raw_metrics ? 'Affiliate product showcase' THEN ${integerFromRaw('Affiliate product showcase')}
        ELSE products_added_to_showcase
      END,
      total_sample_content = CASE
        WHEN raw_metrics ? 'Total sample content' THEN ${integerFromRaw('Total sample content')}
        ELSE total_sample_content
      END,
      samples_shipped = CASE
        WHEN raw_metrics ? 'Samples shipped' THEN ${integerFromRaw('Samples shipped')}
        ELSE samples_shipped
      END,
      ctor = CASE
        WHEN raw_metrics ? 'CTOR' THEN ${numericFromRaw('CTOR')} / 100
        ELSE ctor
      END,
      average_affiliate_customers = CASE
        WHEN raw_metrics ? 'Customers' THEN ${integerFromRaw('Customers')}
        ELSE average_affiliate_customers
      END,
      customers = CASE
        WHEN raw_metrics ? 'Customers' THEN ${integerFromRaw('Customers')}
        WHEN raw_metrics ? 'Avg. affiliate customers' THEN ${integerFromRaw('Avg. affiliate customers')}
        ELSE customers
      END,
      video_views = CASE
        WHEN raw_metrics ? 'Video views' THEN ${integerFromRaw('Video views')}
        ELSE video_views
      END
    WHERE raw_metrics IS NOT NULL AND raw_metrics <> '{}'::jsonb
  `, { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    ALTER TABLE tiktok_creator_performance_snapshots
      DROP COLUMN IF EXISTS video_views,
      DROP COLUMN IF EXISTS customers,
      DROP COLUMN IF EXISTS ctor,
      DROP COLUMN IF EXISTS samples_shipped,
      DROP COLUMN IF EXISTS total_sample_content,
      DROP COLUMN IF EXISTS products_added_to_showcase,
      DROP COLUMN IF EXISTS products_sold
  `, { transaction });
};

module.exports = { name: '034_add_creator_performance_full_metrics', up, down };
