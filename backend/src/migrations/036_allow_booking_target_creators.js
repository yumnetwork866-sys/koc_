const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    ALTER TABLE bookings
      ADD COLUMN IF NOT EXISTS staff_name VARCHAR(255),
      ADD COLUMN IF NOT EXISTS creator_open_id VARCHAR(255),
      ADD COLUMN IF NOT EXISTS creator_username VARCHAR(255),
      ADD COLUMN IF NOT EXISTS creator_name VARCHAR(255),
      ADD COLUMN IF NOT EXISTS creator_avatar_url TEXT,
      ADD COLUMN IF NOT EXISTS target_shop_id INTEGER REFERENCES tiktok_shops(id) ON DELETE SET NULL
  `, { transaction });
  await sequelize.query(`
    UPDATE bookings b
    SET staff_name = COALESCE(b.staff_name, staff.name),
        creator_name = COALESCE(b.creator_name, creator.name)
    FROM users staff, users creator
    WHERE staff.id = b.staff_id
      AND creator.id = b.creator_id
  `, { transaction });
  await sequelize.query('ALTER TABLE bookings ALTER COLUMN staff_id DROP NOT NULL', { transaction });
  await sequelize.query('ALTER TABLE bookings ALTER COLUMN creator_id DROP NOT NULL', { transaction });
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS bookings_creator_open_id_idx
    ON bookings (creator_open_id)
  `, { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    ALTER TABLE bookings
      DROP COLUMN IF EXISTS target_shop_id,
      DROP COLUMN IF EXISTS creator_avatar_url,
      DROP COLUMN IF EXISTS creator_name,
      DROP COLUMN IF EXISTS creator_username,
      DROP COLUMN IF EXISTS creator_open_id,
      DROP COLUMN IF EXISTS staff_name
  `, { transaction });
};

module.exports = { name: '036_allow_booking_target_creators', up, down };
