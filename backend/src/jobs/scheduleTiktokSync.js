require('dotenv').config();

const cron = require('node-cron');
const { sequelize } = require('../models');
const { run } = require('./syncTiktokChannels');

const schedule = process.env.TIKTOK_SYNC_SCHEDULE || '0 2 * * *';
const timezone = process.env.TIKTOK_SYNC_TIMEZONE || 'UTC';

if (!cron.validate(schedule)) {
  throw new Error(`TIKTOK_SYNC_SCHEDULE is not a valid cron expression: ${schedule}`);
}

const task = cron.schedule(schedule, async () => {
  try {
    await run({ closeConnection: false });
  } catch (error) {
    console.error('[TikTok Sync Scheduler] Run failed', error);
  }
}, {
  name: 'tiktok-daily-sync',
  timezone,
  noOverlap: true,
});

console.info('[TikTok Sync Scheduler] Started', { schedule, timezone });

const shutdown = async () => {
  task.stop();
  await sequelize.close();
  process.exit(0);
};

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
