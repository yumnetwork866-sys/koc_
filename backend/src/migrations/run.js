require('dotenv').config();

const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs/promises');
const path = require('path');
const { QueryTypes } = require('sequelize');
const seedData = require('./002_seed_data');
const { sequelize } = require('../models');

const execFileAsync = promisify(execFile);
const migrations = [
  require('./001_create_tables'),
  require('./003_add_tiktok_token_lifecycle'),
  require('./004_add_kpi_indexes'),
];

const createMigrationTable = () => sequelize.query(`
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
  const directory = path.resolve(process.env.DB_BACKUP_DIR || path.join(process.cwd(), 'backups'));
  await fs.mkdir(directory, { recursive: true });
  const filename = `report-${new Date().toISOString().replace(/[:.]/g, '-')}.dump`;
  const output = path.join(directory, filename);
  await execFileAsync('pg_dump', ['--format=custom', '--no-owner', '--no-privileges', '--file', output, getDatabaseUrl()]);
  console.log(`Database backup created: ${output}`);
  return output;
};

const appliedMigrationNames = async () => {
  const rows = await sequelize.query('SELECT name FROM schema_migrations ORDER BY name ASC', { type: QueryTypes.SELECT });
  return new Set(rows.map((row) => row.name));
};

const migrate = async () => {
  await createMigrationTable();
  const applied = await appliedMigrationNames();
  for (const migration of migrations) {
    if (applied.has(migration.name)) continue;
    await sequelize.transaction(async (transaction) => {
      await migration.up({ sequelize, transaction });
      await sequelize.query('INSERT INTO schema_migrations (name) VALUES (:name)', {
        replacements: { name: migration.name }, transaction,
      });
    });
    console.log(`Applied migration: ${migration.name}`);
  }
};

const rollback = async () => {
  await createMigrationTable();
  const rows = await sequelize.query('SELECT name FROM schema_migrations ORDER BY name DESC LIMIT 1', { type: QueryTypes.SELECT });
  if (!rows.length) {
    console.log('No migration to roll back.');
    return;
  }
  const migration = migrations.find((item) => item.name === rows[0].name);
  if (!migration) throw new Error(`Migration ${rows[0].name} is not available in this release.`);
  await sequelize.transaction(async (transaction) => {
    await migration.down({ sequelize, transaction });
    await sequelize.query('DELETE FROM schema_migrations WHERE name = :name', {
      replacements: { name: migration.name }, transaction,
    });
  });
  console.log(`Rolled back migration: ${migration.name}`);
};

const rollbackAll = async () => {
  while (true) {
    const rows = await sequelize.query('SELECT name FROM schema_migrations ORDER BY name DESC LIMIT 1', { type: QueryTypes.SELECT });
    if (!rows.length) return;
    await rollback();
  }
};

const taskName = process.argv[2] || 'migrate';
const skipBackup = process.argv.includes('--no-backup');
const tasks = {
  backup,
  migrate,
  rollback,
  seed: () => seedData.up(),
  init: async () => { await migrate(); await seedData.up(); },
  reset: async () => { await seedData.down(); await rollbackAll(); },
};

const task = tasks[taskName];
if (!task) {
  console.error(`Unknown migration task: ${taskName}`);
  process.exit(1);
}

(async () => {
  try {
    if (!skipBackup && taskName !== 'backup') await backup();
    await task();
  } finally {
    await sequelize.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
