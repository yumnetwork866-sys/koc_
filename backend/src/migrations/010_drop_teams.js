const up = async ({ sequelize, transaction }) => {
  await sequelize.query('ALTER TABLE users DROP COLUMN IF EXISTS team_id', { transaction });
  await sequelize.query('DROP TABLE IF EXISTS teams CASCADE', { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query(
    `CREATE TABLE IF NOT EXISTS teams (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE
    )`,
    { transaction },
  );

  await sequelize.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS team_id INTEGER REFERENCES teams(id)', { transaction });
};

module.exports = { name: '010_drop_teams', up, down };
