const XLSX = require('xlsx');
const { Op } = require('sequelize');
const {
  sequelize,
  TikTokCreatorPerformanceExport,
  TikTokCreatorPerformanceSnapshot,
} = require('../models');
const {
  createCompassExportTask,
  listCompassExportTasks,
  downloadCompassExportFile,
  searchSellerSampleApplications,
  searchMarketplaceCreators,
  SELLER_CREATOR_MARKETPLACE_SCOPE,
} = require('./tiktokShopService');
const {
  saveCreatorProfiles,
  hydrateCreatorRows,
} = require('./tiktokCreatorProfileService');

const WINDOW_DAYS = { PAST_24H: 1, PAST_7_DAYS: 7, PAST_30_DAYS: 30 };
const VALID_PLAN_TYPES = new Set(['ALL', 'TARGET', 'OPEN', 'PARTNER']);
const SUCCESS_STATUSES = new Set(['SUCCEEDED', 'SUCCESS', 'COMPLETED']);
const FAILED_STATUSES = new Set(['FAILED', 'FAILURE', 'CANCELLED', 'EXPIRED']);
const REGION_CURRENCY = { MY: 'MYR', VN: 'VND', SG: 'SGD', TH: 'THB', PH: 'PHP', ID: 'IDR', US: 'USD', GB: 'GBP' };
const REGION_TIMEZONE = { MY: 'Asia/Kuala_Lumpur', VN: 'Asia/Ho_Chi_Minh', SG: 'Asia/Singapore', TH: 'Asia/Bangkok', PH: 'Asia/Manila', ID: 'Asia/Jakarta' };

const isoFromEndDay = (endDay) => {
  const value = String(endDay || '');
  if (!/^\d{8}$/.test(value)) throw new Error('end_day must use YYYYMMDD format.');
  const iso = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  const parsed = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== iso) throw new Error('end_day is invalid.');
  return iso;
};

const exportDateRange = (windowType, endDay) => {
  const days = WINDOW_DAYS[windowType];
  if (!days) throw new Error('window_type must be PAST_24H, PAST_7_DAYS, or PAST_30_DAYS.');
  const endDate = isoFromEndDay(endDay);
  const start = new Date(`${endDate}T00:00:00.000Z`);
  start.setUTCDate(start.getUTCDate() - days + 1);
  return { startDate: start.toISOString().slice(0, 10), endDate };
};

const yesterdayEndDay = (region = 'MY', now = new Date()) => {
  const timezone = REGION_TIMEZONE[String(region || '').toUpperCase()] || 'UTC';
  const localParts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  const local = new Date(`${localParts.year}-${localParts.month}-${localParts.day}T00:00:00.000Z`);
  local.setUTCDate(local.getUTCDate() - 1);
  return Number(local.toISOString().slice(0, 10).replaceAll('-', ''));
};

const shiftEndDay = (endDay, days) => {
  const iso = isoFromEndDay(endDay);
  const date = new Date(`${iso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return Number(date.toISOString().slice(0, 10).replaceAll('-', ''));
};

const numeric = (value) => {
  if (value === null || value === undefined || value === '' || value === '--') return 0;
  const normalized = String(value).replaceAll(',', '').replace(/[^\d.-]/g, '').trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const nullableNumeric = (value) => (value === '--' || value === '' || value === null || value === undefined ? null : numeric(value));
const integer = (value) => Math.round(numeric(value));
const normalizeUsername = (value) => String(value || '').trim().replace(/^@/, '').toLowerCase();
const avatarUrlExpired = (value, now = Date.now()) => {
  try {
    const expiresAt = Number(new URL(String(value || '')).searchParams.get('x-expires'));
    return Number.isFinite(expiresAt) && expiresAt > 0 && expiresAt * 1000 <= now;
  } catch {
    return false;
  }
};

const parseCreatorPerformanceWorkbook = (buffer, {
  exportId, shopId, startDate, endDate, windowType, planType, currency,
}) => {
  const workbook = XLSX.read(buffer, { type: 'buffer', raw: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error('TikTok Compass workbook does not contain a worksheet.');
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
  return rows.filter((row) => String(row['Creator username'] || row['Creator name'] || '').trim()).map((row) => ({
    export_id: exportId,
    shop_id: shopId,
    username: String(row['Creator username'] || row['Creator name']).trim().replace(/^@/, ''),
    nickname: null,
    avatar_url: null,
    creator_open_id: null,
    start_date: startDate,
    end_date: endDate,
    window_type: windowType,
    plan_type: planType,
    currency,
    affiliate_gmv: numeric(row['Affiliate GMV'] ?? row['Creator-attributed GMV']),
    live_gmv: numeric(row['Affiliate LIVE GMV']),
    video_gmv: numeric(row['Affiliate shoppable video GMV']),
    product_card_gmv: numeric(row['Affiliate product card GMV']),
    affiliate_products_sold: integer(row['Affiliate products sold']),
    items_sold: integer(row['Items sold'] ?? row['Creator-attributed items sold']),
    estimated_commission: numeric(row['Est. commission']),
    estimated_flat_fee: nullableNumeric(row['Est. flat fee']),
    average_order_value: numeric(row['Avg. order value'] ?? row.AOV),
    product_showcase_count: integer(row['Affiliate product showcase'] ?? row['Samples shipped']),
    affiliate_orders: integer(row['Affiliate orders'] ?? row['Attributed orders']),
    ctr: numeric(row.CTR) / 100,
    product_impressions: integer(row['Product impressions']),
    average_affiliate_customers: numeric(row['Avg. affiliate customers']),
    live_streams: integer(row['Affiliate LIVE streams'] ?? row['LIVE streams']),
    shoppable_videos: integer(row['Affiliate shoppable videos'] ?? row.Videos),
    target_gmv: numeric(row['Target collaboration GMV']),
    target_estimated_commission: numeric(row['Target collaboration est. commission']),
    open_gmv: numeric(row['Open collaboration GMV']),
    open_estimated_commission: numeric(row['Open collaboration est. commission']),
    refunded_gmv: numeric(row['Affiliate refunded GMV'] ?? row.Refunds),
    items_refunded: integer(row['Affiliate items refunded'] ?? row['Items refunded']),
    followers: integer(row['Affiliate followers']),
    raw_metrics: row,
    synced_at: new Date(),
  }));
};

const taskRows = (payload) => payload?.data?.tasks
  || payload?.data?.offline_tasks
  || payload?.data?.task_list
  || [];

const findTask = (payload, taskId) => taskRows(payload).find(
  (task) => String(task.id || task.task_id) === String(taskId),
);

const normalizeCreatorProfile = (creator = {}) => ({
  username: String(creator.username || '').trim().replace(/^@/, ''),
  nickname: creator.nickname || null,
  avatar_url: creator.avatar_url || creator.avatar?.url || null,
  follower_count: Number(creator.follower_count) || 0,
  creator_open_id: creator.creator_open_id || creator.creator_user_open_id || creator.user_id || null,
});

const loadCreatorProfiles = async (shop, searchSamples = searchSellerSampleApplications) => {
  const profiles = new Map();
  let pageToken;
  for (let page = 0; page < 20; page += 1) {
    const payload = await searchSamples({
      authorization: shop.authorization,
      shopCipher: shop.cipher,
      pageSize: 50,
      pageToken,
    });
    for (const application of payload.data?.sample_applications || []) {
      const creator = normalizeCreatorProfile(application.creator);
      const username = normalizeUsername(creator.username);
      if (username && !profiles.has(username)) profiles.set(username, creator);
    }
    pageToken = payload.data?.next_page_token;
    if (!pageToken) break;
  }
  return profiles;
};

const loadMarketplaceCreatorProfiles = async (
  shop,
  usernames,
  searchMarketplace = searchMarketplaceCreators,
  {
    concurrency = Number(process.env.TIKTOK_CREATOR_PROFILE_CONCURRENCY || 1),
    minIntervalMs = Number(process.env.TIKTOK_CREATOR_PROFILE_MIN_INTERVAL_MS || 2500),
    retryCount = Number(process.env.TIKTOK_CREATOR_PROFILE_RETRY_COUNT || 3),
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  } = {},
) => {
  const scopes = Array.isArray(shop.authorization?.granted_scopes) ? shop.authorization.granted_scopes : [];
  if (!scopes.includes(SELLER_CREATOR_MARKETPLACE_SCOPE)) return new Map();
  const queue = [...new Set(usernames.map(normalizeUsername).filter(Boolean))];
  const profiles = new Map();
  const workerCount = Math.min(queue.length, Math.max(1, Math.min(10, Number(concurrency) || 1)));
  const requestInterval = Math.max(0, Number(minIntervalMs) || 0);
  const retries = Math.max(0, Math.min(8, Number(retryCount) || 0));
  let nextIndex = 0;
  let nextRequestAt = 0;
  const waitForRequestSlot = async () => {
    const now = Date.now();
    const scheduledAt = Math.max(now, nextRequestAt);
    nextRequestAt = scheduledAt + requestInterval;
    if (scheduledAt > now) await sleep(scheduledAt - now);
  };
  const worker = async () => {
    while (nextIndex < queue.length) {
      const username = queue[nextIndex];
      nextIndex += 1;
      for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
          await waitForRequestSlot();
          const payload = await searchMarketplace({
            authorization: shop.authorization,
            shopCipher: shop.cipher,
            pageSize: 20,
            keyword: username,
          });
          const creators = payload.data?.creators || [];
          const exactMatch = creators.find((creator) => normalizeUsername(creator.username) === username);
          if (exactMatch) profiles.set(username, normalizeCreatorProfile(exactMatch));
          break;
        } catch (error) {
          const rateLimited = [36009002, 36009037].includes(Number(error.tiktokCode));
          if (rateLimited && attempt < retries) {
            await sleep(Math.min(60000, 5000 * (2 ** attempt)));
            continue;
          }
          console.warn('[Creator Performance] Marketplace profile lookup failed', {
            shopId: shop.id,
            username,
            attempt: attempt + 1,
            message: error.message,
          });
          break;
        }
      }
    }
  };
  await Promise.all(Array.from({ length: workerCount }, worker));
  return profiles;
};

const applyCreatorProfile = (row, profile) => {
  if (!profile) return;
  row.nickname = profile.nickname || row.nickname || null;
  row.avatar_url = profile.avatar_url || row.avatar_url || null;
  row.creator_open_id = profile.creator_open_id || row.creator_open_id || null;
  if (!row.followers) row.followers = Number(profile.follower_count) || 0;
};

const enrichCreatorRows = async (shop, rows, {
  searchSamples = searchSellerSampleApplications,
  searchMarketplace = searchMarketplaceCreators,
  refreshMarketplace = false,
  marketplaceOptions,
} = {}) => {
  const sampleProfiles = await loadCreatorProfiles(shop, searchSamples).catch(() => new Map());
  for (const row of rows) applyCreatorProfile(row, sampleProfiles.get(normalizeUsername(row.username)));
  const missingUsernames = rows
    .filter((row) => !row.avatar_url || (refreshMarketplace && avatarUrlExpired(row.avatar_url)))
    .map((row) => row.username);
  const marketplaceProfiles = await loadMarketplaceCreatorProfiles(
    shop,
    missingUsernames,
    searchMarketplace,
    marketplaceOptions,
  );
  for (const row of rows) applyCreatorProfile(row, marketplaceProfiles.get(normalizeUsername(row.username)));
  return rows;
};

const refreshCreatorPerformanceProfiles = async (shop, exportRecord, dependencies = {}) => {
  const {
    searchSamples = searchSellerSampleApplications,
    searchMarketplace = searchMarketplaceCreators,
    marketplaceOptions,
  } = dependencies;
  const snapshots = await TikTokCreatorPerformanceSnapshot.findAll({
    where: {
      shop_id: shop.id,
      start_date: exportRecord.start_date,
      end_date: exportRecord.end_date,
      plan_type: exportRecord.plan_type,
    },
  });
  if (!snapshots.length) return 0;
  const rows = snapshots.map((snapshot) => snapshot.toJSON());
  const persistRows = async (profileRows) => {
    if (!profileRows.length) return;
    await saveCreatorProfiles(shop.id, profileRows, 'performance');
    const sharedRows = await hydrateCreatorRows(shop.id, profileRows);
    await TikTokCreatorPerformanceSnapshot.bulkCreate(sharedRows, {
      conflictAttributes: ['shop_id', 'username', 'start_date', 'end_date', 'plan_type'],
      updateOnDuplicate: ['nickname', 'avatar_url', 'creator_open_id', 'followers'],
    });
  };
  const refreshed = new Set();
  const sampleProfiles = await loadCreatorProfiles(shop, searchSamples).catch(() => new Map());
  const sampleRows = [];
  for (const row of rows) {
    const profile = sampleProfiles.get(normalizeUsername(row.username));
    if (!profile) continue;
    applyCreatorProfile(row, profile);
    sampleRows.push(row);
    refreshed.add(normalizeUsername(row.username));
  }
  await persistRows(sampleRows);

  const candidates = rows.filter((row) => !row.avatar_url || avatarUrlExpired(row.avatar_url));
  const batchSize = Math.max(1, Math.min(50, Number(process.env.TIKTOK_CREATOR_PROFILE_BATCH_SIZE || 20)));
  for (let index = 0; index < candidates.length; index += batchSize) {
    const batch = candidates.slice(index, index + batchSize);
    const profiles = await loadMarketplaceCreatorProfiles(
      shop,
      batch.map((row) => row.username),
      searchMarketplace,
      marketplaceOptions,
    );
    const enrichedRows = [];
    for (const row of batch) {
      const profile = profiles.get(normalizeUsername(row.username));
      if (!profile) continue;
      applyCreatorProfile(row, profile);
      enrichedRows.push(row);
      refreshed.add(normalizeUsername(row.username));
    }
    await persistRows(enrichedRows);
  }
  return refreshed.size;
};

const createCreatorPerformanceExport = async (shop, {
  windowType = 'PAST_7_DAYS', endDay = yesterdayEndDay(shop.region), planType = 'ALL',
} = {}, dependencies = {}) => {
  const normalizedWindow = String(windowType).toUpperCase();
  const normalizedPlan = String(planType).toUpperCase();
  if (!VALID_PLAN_TYPES.has(normalizedPlan)) throw new Error('plan_type must be ALL, TARGET, OPEN, or PARTNER.');
  const { startDate, endDate } = exportDateRange(normalizedWindow, endDay);
  const existing = await TikTokCreatorPerformanceExport.findOne({
    where: {
      shop_id: shop.id,
      window_type: normalizedWindow,
      plan_type: normalizedPlan,
      start_date: startDate,
      end_date: endDate,
      status: { [Op.in]: ['PROCESSING', 'SUCCEEDED'] },
    },
    order: [['created_at', 'DESC']],
  });
  if (existing) return existing;
  const payload = await (dependencies.createTask || createCompassExportTask)({
    authorization: shop.authorization,
    shopCipher: shop.cipher,
    windowType: normalizedWindow,
    endDay,
    planType: normalizedPlan,
  });
  const taskId = payload.data?.task?.id || payload.data?.task_id;
  if (!taskId) throw new Error('TikTok Compass did not return a task id.');
  return TikTokCreatorPerformanceExport.create({
    shop_id: shop.id,
    task_id: String(taskId),
    module_type: 'CREATOR',
    window_type: normalizedWindow,
    plan_type: normalizedPlan,
    start_date: startDate,
    end_date: endDate,
    status: 'PROCESSING',
    request_id: payload.request_id || null,
  });
};

const createCreatorPerformanceExportWithFallback = async (shop, options = {}, {
  maxFallbackDays = 7,
  createExport = createCreatorPerformanceExport,
} = {}) => {
  const requestedEndDay = Number(options.endDay || yesterdayEndDay(shop.region));
  let endDay = requestedEndDay;
  for (let fallbackDays = 0; fallbackDays <= maxFallbackDays; fallbackDays += 1) {
    try {
      const exportRecord = await createExport(shop, { ...options, endDay });
      return { exportRecord, requestedEndDay, endDay, fallbackDays };
    } catch (error) {
      if (Number(error.tiktokCode) !== 13017003 || fallbackDays === maxFallbackDays) throw error;
      endDay = shiftEndDay(endDay, -1);
    }
  }
  throw new Error('TikTok Compass export date is not available.');
};

const processCreatorPerformanceExport = async (shop, exportRecord, {
  pollIntervalMs = 5000, timeoutMs = 15 * 60 * 1000, listTasks = listCompassExportTasks,
  downloadFile = downloadCompassExportFile, searchSamples = searchSellerSampleApplications,
  searchMarketplace = searchMarketplaceCreators,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) => {
  const startedAt = Date.now();
  try {
    while (Date.now() - startedAt < timeoutMs) {
      const payload = await listTasks({ authorization: shop.authorization, shopCipher: shop.cipher, pageSize: 100 });
      const task = findTask(payload, exportRecord.task_id);
      const status = String(task?.status || task?.task_status || '').toUpperCase();
      if (FAILED_STATUSES.has(status)) throw new Error(task?.fail_reason || task?.error_message || `TikTok Compass task ${status}.`);
      if (SUCCESS_STATUSES.has(status)) {
        const filePayload = await downloadFile({
          authorization: shop.authorization, shopCipher: shop.cipher, taskId: exportRecord.task_id,
        });
        const base64 = filePayload.data?.file?.base64 || filePayload.data?.base64;
        if (!base64) throw new Error('TikTok Compass did not return the XLSX file.');
        const rows = parseCreatorPerformanceWorkbook(Buffer.from(base64, 'base64'), {
          exportId: exportRecord.id,
          shopId: shop.id,
          startDate: exportRecord.start_date,
          endDate: exportRecord.end_date,
          windowType: exportRecord.window_type,
          planType: exportRecord.plan_type,
          currency: REGION_CURRENCY[String(shop.region || '').toUpperCase()] || 'USD',
        });
        await enrichCreatorRows(shop, rows, { searchSamples, searchMarketplace });
        await saveCreatorProfiles(shop.id, rows, 'performance');
        const sharedRows = await hydrateCreatorRows(shop.id, rows);
        rows.splice(0, rows.length, ...sharedRows);
        await sequelize.transaction(async (transaction) => {
          if (rows.length) {
            await TikTokCreatorPerformanceSnapshot.bulkCreate(rows, {
              transaction,
              conflictAttributes: ['shop_id', 'username', 'start_date', 'end_date', 'plan_type'],
              updateOnDuplicate: Object.keys(rows[0]).filter((key) => !['id', 'shop_id', 'username', 'start_date', 'end_date', 'plan_type'].includes(key)),
            });
          }
          await exportRecord.update({
            status: 'SUCCEEDED', row_count: rows.length, completed_at: new Date(), error: null,
          }, { transaction });
        });
        return exportRecord.reload();
      }
      await sleep(pollIntervalMs);
    }
    throw new Error('TikTok Compass report timed out after 15 minutes.');
  } catch (error) {
    await exportRecord.update({ status: 'FAILED', error: String(error.message).slice(0, 2000), completed_at: new Date() });
    throw error;
  }
};

module.exports = {
  WINDOW_DAYS,
  exportDateRange,
  yesterdayEndDay,
  shiftEndDay,
  parseCreatorPerformanceWorkbook,
  createCreatorPerformanceExport,
  createCreatorPerformanceExportWithFallback,
  processCreatorPerformanceExport,
  loadCreatorProfiles,
  loadMarketplaceCreatorProfiles,
  enrichCreatorRows,
  refreshCreatorPerformanceProfiles,
};
