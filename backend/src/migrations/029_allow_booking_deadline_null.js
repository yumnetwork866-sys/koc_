const up = async ({ sequelize, transaction }) => {
  await sequelize.query('ALTER TABLE bookings ALTER COLUMN deadline DROP NOT NULL', { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query('UPDATE bookings SET deadline = CURRENT_DATE WHERE deadline IS NULL', { transaction });
  await sequelize.query('ALTER TABLE bookings ALTER COLUMN deadline SET NOT NULL', { transaction });
};

module.exports = { name: '029_allow_booking_deadline_null', up, down };
