const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    ALTER TABLE bookings
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  `, { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    ALTER TABLE bookings
      DROP COLUMN IF EXISTS updated_at,
      DROP COLUMN IF EXISTS created_at
  `, { transaction });
};

module.exports = { name: '037_add_booking_timestamps', up, down };
