require('dotenv').config();

const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs/promises');
const path = require('path');
const { QueryTypes } = require('sequelize');
const seedData = require('./002_seed_data');
const { sequelize } = require('../models');
const migrations = [
  require('./001_create_tables'),
  require('./003_add_tiktok_token_lifecycle'),
  require('./004_add_kpi_indexes'),
  require('./005_add_facebook_chatbot_tables'),
  require('./006_add_chatbot_settings'),
  require('./007_add_chatbot_message_profile_fields'),
  require('./008_add_facebook_user_avatar_url'),
  require('./009_add_facebook_page_avatar_url'),
  require('./010_drop_teams'),
  require('./011_create_bookings'),
];

const createMigrationRunner = ({
  sequelizeInstance = sequelize,
  migrationsList = migrations,
  seed = seedData,
  fsModule = fs,
  pathModule = path,
  execFileFn = promisify(execFile),
} = {}) => {
  const createMigrationTable = () => sequelizeInstance.query(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    name VARCHAR(255) PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`);

  const getDatabaseUrl = () => {
    if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
    const required = ['DB_NAME', 'DB_USER', 'DB_PASSWORD', 'DB_HOST'];
    if (required.some((key) => !process.env[key])) throw new Error('DATABASE_URL or DB_* variables are required for a backup.');
    const user = encodeURIComponent(process.env.DB_USER);
    const password = encodeURIComponent(process.env.DB_PASSWORD);
    return `postgresql://${user}:${password}@${process.env.DB_HOST}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME}`;
  };

  const backup = async () => {
    const directory = pathModule.resolve(process.env.DB_BACKUP_DIR || pathModule.join(process.cwd(), 'backups'));
    await fsModule.mkdir(directory, { recursive: true });
    const filename = `report-${new Date().toISOString().replace(/[:.]/g, '-')}.dump`;
    const output = pathModule.join(directory, filename);
    await execFileFn('pg_dump', ['--format=custom', '--no-owner', '--no-privileges', '--file', output, getDatabaseUrl()]);
    console.log(`Database backup created: ${output}`);
    return output;
  };

  const appliedMigrationNames = async () => {
    const rows = await sequelizeInstance.query('SELECT name FROM schema_migrations ORDER BY name ASC', { type: QueryTypes.SELECT });
    return new Set(rows.map((row) => row.name));
  };

  const migrate = async () => {
    await createMigrationTable();
    const applied = await appliedMigrationNames();
    for (const migration of migrationsList) {
      if (applied.has(migration.name)) continue;
      await sequelizeInstance.transaction(async (transaction) => {
        await migration.up({ sequelize: sequelizeInstance, transaction });
        await sequelizeInstance.query('INSERT INTO schema_migrations (name) VALUES (:name)', {
          replacements: { name: migration.name }, transaction,
        });
      });
      console.log(`Applied migration: ${migration.name}`);
    }
  };

  const rollback = async () => {
    await createMigrationTable();
    const rows = await sequelizeInstance.query('SELECT name FROM schema_migrations ORDER BY name DESC LIMIT 1', { type: QueryTypes.SELECT });
    if (!rows.length) {
      console.log('No migration to roll back.');
      return;
    }
    const migration = migrationsList.find((item) => item.name === rows[0].name);
    if (!migration) throw new Error(`Migration ${rows[0].name} is not available in this release.`);
    await sequelizeInstance.transaction(async (transaction) => {
      await migration.down({ sequelize: sequelizeInstance, transaction });
      await sequelizeInstance.query('DELETE FROM schema_migrations WHERE name = :name', {
        replacements: { name: migration.name }, transaction,
      });
    });
    console.log(`Rolled back migration: ${migration.name}`);
  };

  const rollbackAll = async () => {
    while (true) {
      const rows = await sequelizeInstance.query('SELECT name FROM schema_migrations ORDER BY name DESC LIMIT 1', { type: QueryTypes.SELECT });
      if (!rows.length) return;
      await rollback();
    }
  };

  const tasks = {
    backup,
    migrate,
    rollback,
    seed: () => seed.up(),
    init: async () => { await migrate(); await seed.up(); },
    reset: async () => { await seed.down(); await rollbackAll(); },
  };

  return {
    backup,
    migrate,
    rollback,
    rollbackAll,
    close: () => sequelizeInstance.close(),
    tasks,
  };
};

const runTask = async ({ taskName = process.argv[2] || 'migrate', skipBackup = process.argv.includes('--no-backup'), runner = createMigrationRunner() } = {}) => {
  const task = runner.tasks[taskName];
  if (!task) {
    throw new Error(`Unknown migration task: ${taskName}`);
  }

  try {
    if (!skipBackup && taskName !== 'backup') await runner.backup();
    await task();
  } finally {
    if (typeof runner.close === 'function') {
      await runner.close();
    }
  }
};

if (require.main === module) {
  runTask().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { createMigrationRunner, runTask };
