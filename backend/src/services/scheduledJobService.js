const crypto = require('crypto');
const cron = require('node-cron');
const {
  ScheduledJob,
  ScheduledJobRun,
  TikTokShop,
  TikTokShopAuthorization,
} = require('../models');
const {
  createCreatorPerformanceExportWithFallback,
  processCreatorPerformanceExport,
  refreshCreatorPerformanceProfiles,
  yesterdayEndDay,
} = require('./tiktokCreatorPerformanceService');
const {
  scheduledAnalyticsRange,
  syncShopAnalyticsSnapshot,
} = require('./tiktokShopAnalyticsSyncService');
const { run: syncTikTokChannels } = require('../jobs/syncTiktokChannels');

const JOB_KEYS = new Set([
  'tiktok_creator_performance',
  'tiktok_shop_analytics',
  'tiktok_channel_metrics',
]);
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

const normalizeRunTimes = (values) => {
  if (!Array.isArray(values)) throw new Error('run_times must be an array.');
  const times = [...new Set(values.map((value) => String(value || '').trim()))].sort();
  if (!times.length || times.length > 6 || times.some((value) => !TIME_PATTERN.test(value))) {
    throw new Error('Configure between 1 and 6 valid run times using HH:mm.');
  }
  return times;
};

const assertTimezone = (value) => {
  const timezone = String(value || '').trim();
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone }).format();
  } catch {
    throw new Error('timezone is invalid.');
  }
  return timezone;
};

const localScheduleParts = (date, timezone) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
};

const connectedShops = () => TikTokShop.findAll({
  include: [{ model: TikTokShopAuthorization, as: 'authorization' }],
  order: [['id', 'ASC']],
});

const runForShops = async (operation) => {
  const shops = await connectedShops();
  const results = [];
  for (const shop of shops) {
    try {
      results.push({ shop_id: shop.id, status: 'SUCCEEDED', ...(await operation(shop)) });
    } catch (error) {
      results.push({ shop_id: shop.id, status: 'FAILED', error: error.message });
    }
  }
  const summary = {
    total: results.length,
    succeeded: results.filter((item) => item.status === 'SUCCEEDED').length,
    failed: results.filter((item) => item.status === 'FAILED').length,
    results,
  };
  if (summary.failed) {
    const error = new Error(`${summary.failed}/${summary.total} Shop syncs failed.`);
    error.summary = summary;
    throw error;
  }
  return summary;
};

const jobHandlers = {
  tiktok_creator_performance: () => runForShops(async (shop) => {
    const { exportRecord, requestedEndDay, endDay } = await createCreatorPerformanceExportWithFallback(shop, {
      windowType: 'PAST_7_DAYS',
      endDay: yesterdayEndDay(shop.region),
      planType: 'ALL',
    });
    if (exportRecord.status === 'PROCESSING') await processCreatorPerformanceExport(shop, exportRecord);
    else await refreshCreatorPerformanceProfiles(shop, exportRecord);
    return { requested_end_day: requestedEndDay, effective_end_day: endDay, export_id: exportRecord.id };
  }),
  tiktok_shop_analytics: () => runForShops(async (shop) => {
    const range = scheduledAnalyticsRange(shop);
    return syncShopAnalyticsSnapshot(shop, range);
  }),
  tiktok_channel_metrics: async () => {
    const summary = await syncTikTokChannels({ closeConnection: false });
    if (summary.failed) {
      const error = new Error(`${summary.failed}/${summary.channels} Channel syncs failed.`);
      error.summary = summary;
      throw error;
    }
    return summary;
  },
};

const processScheduledJobRun = async (job, run) => {
  try {
    const summary = await jobHandlers[job.job_key]();
    await run.update({ status: 'SUCCEEDED', summary, completed_at: new Date(), error: null });
  } catch (error) {
    await run.update({
      status: 'FAILED',
      summary: error.summary || null,
      error: String(error.message || error).slice(0, 4000),
      completed_at: new Date(),
    });
  }
  return run.reload();
};

const createScheduledJobRun = async (job, {
  triggerType = 'MANUAL',
  scheduledKey = `${triggerType}:${Date.now()}:${crypto.randomUUID()}`,
} = {}) => {
  if (!JOB_KEYS.has(job.job_key) || !jobHandlers[job.job_key]) throw new Error(`Unsupported scheduled job: ${job.job_key}`);
  const [run, created] = await ScheduledJobRun.findOrCreate({
    where: { scheduled_job_id: job.id, scheduled_key: scheduledKey },
    defaults: { trigger_type: triggerType, status: 'PROCESSING', started_at: new Date() },
  });
  return { run, created };
};

const executeScheduledJob = async (job, options = {}) => {
  const { run, created } = await createScheduledJobRun(job, options);
  return created ? processScheduledJobRun(job, run) : run;
};

const enqueueScheduledJob = async (job, {
  triggerType = 'MANUAL',
  scheduledKey = `${triggerType}:${Date.now()}:${crypto.randomUUID()}`,
} = {}) => {
  const processing = await ScheduledJobRun.findOne({
    where: { scheduled_job_id: job.id, status: 'PROCESSING' },
    order: [['started_at', 'DESC']],
  });
  if (processing) {
    const configuredStaleAfterMs = Number(process.env.SCHEDULE_JOB_STALE_AFTER_MS);
    const staleAfterMs = Number.isFinite(configuredStaleAfterMs) && configuredStaleAfterMs >= 60 * 60 * 1000
      ? configuredStaleAfterMs
      : 6 * 60 * 60 * 1000;
    if (Date.now() - new Date(processing.started_at).getTime() <= staleAfterMs) {
      return { run: processing, created: false };
    }
    await processing.update({
      status: 'FAILED',
      error: 'Job process stopped before reporting completion.',
      completed_at: new Date(),
    });
  }
  const { run, created } = await createScheduledJobRun(job, { triggerType, scheduledKey });
  if (created) {
    setImmediate(() => processScheduledJobRun(job, run).catch((error) => {
      console.error('[Schedule Manager] Manual run failed', { jobKey: job.job_key, message: error.message });
    }));
  }
  return { run, created };
};

const tickScheduledJobs = async (now = new Date()) => {
  const jobs = await ScheduledJob.findAll({ where: { enabled: true } });
  await Promise.all(jobs.map(async (job) => {
    const local = localScheduleParts(now, job.timezone);
    const times = normalizeRunTimes(job.run_times);
    if (!times.includes(local.time)) return;
    await enqueueScheduledJob(job, {
      triggerType: 'SCHEDULED',
      scheduledKey: `SCHEDULED:${local.date}:${local.time}`,
    });
  }));
};

const startDatabaseScheduler = () => {
  const task = cron.schedule('0 * * * * *', () => tickScheduledJobs().catch((error) => {
    console.error('[Schedule Manager] Tick failed', { message: error.message });
  }), { name: 'database-schedule-manager', noOverlap: true });
  console.info('[Schedule Manager] Started');
  return task;
};

module.exports = {
  JOB_KEYS,
  normalizeRunTimes,
  assertTimezone,
  localScheduleParts,
  executeScheduledJob,
  enqueueScheduledJob,
  tickScheduledJobs,
  startDatabaseScheduler,
};
