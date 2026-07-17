require('dotenv').config();

const { sequelize } = require('../models');
const { startDatabaseScheduler } = require('../services/scheduledJobService');

const task = startDatabaseScheduler();

const shutdown = async () => {
  task.stop();
  await sequelize.close();
  process.exit(0);
};

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
