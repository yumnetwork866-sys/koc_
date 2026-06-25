const createTables = require('./001_create_tables');
const seedData = require('./002_seed_data');
const { sequelize } = require('../models');

const tasks = {
  migrate: async () => createTables.up(),
  seed: async () => seedData.up(),
  init: async () => {
    await createTables.up();
    await seedData.up();
  },
  reset: async () => {
    await seedData.down();
    await createTables.down();
  },
};

const taskName = process.argv[2] || 'init';
const task = tasks[taskName];

if (!task) {
  console.error(`Unknown migration task: ${taskName}`);
  process.exit(1);
}

task()
  .then(async () => {
    await sequelize.close();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error(error);
    await sequelize.close();
    process.exit(1);
  });
