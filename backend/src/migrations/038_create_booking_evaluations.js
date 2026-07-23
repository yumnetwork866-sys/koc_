const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS tiktok_target_collaboration_snapshots (
      id BIGSERIAL PRIMARY KEY,
      shop_id INTEGER NOT NULL REFERENCES tiktok_shops(id) ON DELETE CASCADE,
      collaboration_id VARCHAR(255) NOT NULL,
      name VARCHAR(500),
      status VARCHAR(64),
      start_at TIMESTAMPTZ,
      end_at TIMESTAMPTZ,
      raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
      synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (shop_id, collaboration_id)
    )
  `, { transaction });
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS target_collaboration_snapshot_status_idx
    ON tiktok_target_collaboration_snapshots (shop_id, status, end_at)
  `, { transaction });
  await sequelize.query(`
    ALTER TABLE bookings
      ADD COLUMN IF NOT EXISTS target_collaboration_id VARCHAR(255),
      ADD COLUMN IF NOT EXISTS evaluation_snapshot JSONB
  `, { transaction });
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS bookings_target_collaboration_idx
    ON bookings (target_shop_id, target_collaboration_id)
  `, { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query('DROP INDEX IF EXISTS bookings_target_collaboration_idx', { transaction });
  await sequelize.query(`
    ALTER TABLE bookings
      DROP COLUMN IF EXISTS evaluation_snapshot,
      DROP COLUMN IF EXISTS target_collaboration_id
  `, { transaction });
  await sequelize.query('DROP TABLE IF EXISTS tiktok_target_collaboration_snapshots', { transaction });
};

module.exports = { name: '038_create_booking_evaluations', up, down };
