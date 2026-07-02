const statements = [
  `CREATE TABLE IF NOT EXISTS bookings (
    id SERIAL PRIMARY KEY,
    staff_id INTEGER NOT NULL REFERENCES users(id),
    creator_id INTEGER NOT NULL REFERENCES users(id),
    booking_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
    status VARCHAR(255) NOT NULL DEFAULT 'booked',
    deadline DATE NOT NULL,
    note TEXT,
    video_platform_id VARCHAR(255),
    video_url TEXT,
    posted_at TIMESTAMPTZ
  )`,
  'CREATE INDEX IF NOT EXISTS bookings_staff_id_idx ON bookings (staff_id)',
  'CREATE INDEX IF NOT EXISTS bookings_creator_id_idx ON bookings (creator_id)',
  'CREATE INDEX IF NOT EXISTS bookings_status_idx ON bookings (status)',
  'CREATE INDEX IF NOT EXISTS bookings_deadline_idx ON bookings (deadline)',
];

const up = async ({ sequelize, transaction }) => {
  for (const statement of statements) {
    await sequelize.query(statement, { transaction });
  }
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query('DROP TABLE IF EXISTS bookings CASCADE', { transaction });
};

module.exports = { name: '011_create_bookings', up, down };
