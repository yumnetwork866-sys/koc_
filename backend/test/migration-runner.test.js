const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { mockModule } = require('./helpers/mockModule');

const modelsPath = require.resolve('../src/models');
const seedPath = require.resolve('../src/migrations/002_seed_data');
const migrationPaths = [
  '../src/migrations/001_create_tables',
  '../src/migrations/003_add_tiktok_token_lifecycle',
  '../src/migrations/004_add_kpi_indexes',
  '../src/migrations/005_add_facebook_chatbot_tables',
  '../src/migrations/006_add_chatbot_settings',
].map((item) => require.resolve(item));

const makeMigration = (name) => ({
  name,
  up: async () => {},
  down: async () => {},
});

test('migration runner backs up, applies, and rolls back migrations', async (t) => {
  const restores = [
    mockModule(modelsPath, { sequelize: {} }),
    mockModule(seedPath, { up: async () => {}, down: async () => {} }),
    ...migrationPaths.map((modulePath) => mockModule(modulePath, makeMigration(path.basename(modulePath, '.js')))),
  ];

  t.after(() => {
    restores.reverse().forEach((restore) => restore());
  });

  const { createMigrationRunner } = require('../src/migrations/run');

  const applied = new Set(['001_create_tables']);
  const queryLog = [];
  const fakeSequelize = {
    async query(sql, options = {}) {
      queryLog.push(sql);

      if (sql.startsWith('CREATE TABLE IF NOT EXISTS schema_migrations')) {
        return [];
      }

      if (sql.startsWith('SELECT name FROM schema_migrations ORDER BY name ASC')) {
        return Array.from(applied).sort().map((name) => ({ name }));
      }

      if (sql.startsWith('SELECT name FROM schema_migrations ORDER BY name DESC LIMIT 1')) {
        const rows = Array.from(applied).sort().reverse().slice(0, 1).map((name) => ({ name }));
        return rows;
      }

      if (sql.startsWith('INSERT INTO schema_migrations')) {
        applied.add(options.replacements.name);
        return [];
      }

      if (sql.startsWith('DELETE FROM schema_migrations')) {
        applied.delete(options.replacements.name);
        return [];
      }

      return [];
    },
    async transaction(fn) {
      return fn({ tx: true });
    },
    async close() {},
  };

  const backupCalls = [];
  const runner = createMigrationRunner({
    sequelizeInstance: fakeSequelize,
    migrationsList: [
      makeMigration('001_create_tables'),
      makeMigration('003_add_tiktok_token_lifecycle'),
      makeMigration('004_add_kpi_indexes'),
      makeMigration('005_add_facebook_chatbot_tables'),
      makeMigration('006_add_chatbot_settings'),
    ],
    seed: { up: async () => {}, down: async () => {} },
    fsModule: {
      async mkdir() {},
    },
    pathModule: path,
    execFileFn: async (cmd, args) => {
      backupCalls.push({ cmd, args });
    },
  });

  const backupPath = await runner.backup();
  assert.equal(backupCalls[0].cmd, 'pg_dump');
  assert.match(backupCalls[0].args.join(' '), /--format=custom/);
  assert.match(backupPath, /\.dump$/);

  await runner.migrate();
  assert.deepEqual(Array.from(applied).sort(), [
    '001_create_tables',
    '003_add_tiktok_token_lifecycle',
    '004_add_kpi_indexes',
    '005_add_facebook_chatbot_tables',
    '006_add_chatbot_settings',
  ]);

  await runner.rollback();
  assert.deepEqual(Array.from(applied).sort(), [
    '001_create_tables',
    '003_add_tiktok_token_lifecycle',
    '004_add_kpi_indexes',
    '005_add_facebook_chatbot_tables',
  ]);

  assert.ok(queryLog.some((sql) => sql.includes('CREATE TABLE IF NOT EXISTS schema_migrations')));
  assert.ok(queryLog.some((sql) => sql.startsWith('INSERT INTO schema_migrations')));
  assert.ok(queryLog.some((sql) => sql.startsWith('DELETE FROM schema_migrations')));
});
