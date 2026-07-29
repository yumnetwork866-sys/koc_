require('dotenv').config();

const { Op } = require('sequelize');
const { TikTokCreatorProfile, sequelize } = require('../models');
const {
  cacheCreatorAvatars,
  isLocalCreatorAvatarUrl,
} = require('../services/creatorAvatarStorageService');

const configuredBatchSize = Math.max(
  10,
  Math.min(500, Number(process.env.CREATOR_AVATAR_BACKFILL_BATCH_SIZE) || 100),
);
const configuredConcurrency = Math.max(
  1,
  Math.min(16, Number(process.env.CREATOR_AVATAR_BACKFILL_CONCURRENCY) || 8),
);

const run = async ({
  batchSize = configuredBatchSize,
  concurrency = configuredConcurrency,
  logger = console,
} = {}) => {
  let lastId = 0;
  let scanned = 0;
  let cached = 0;
  let failed = 0;
  while (true) {
    const rows = await TikTokCreatorProfile.findAll({
      where: {
        id: { [Op.gt]: lastId },
        avatar_url: { [Op.like]: 'https://%' },
      },
      order: [['id', 'ASC']],
      limit: batchSize,
    });
    if (!rows.length) break;
    lastId = Number(rows.at(-1).id);
    const creators = rows.map((row) => row.toJSON());
    const localized = new Array(creators.length);
    const indexesByShop = new Map();
    creators.forEach((creator, index) => {
      const key = String(creator.shop_id);
      if (!indexesByShop.has(key)) indexesByShop.set(key, []);
      indexesByShop.get(key).push(index);
    });
    for (const indexes of indexesByShop.values()) {
      const shopCreators = indexes.map((index) => creators[index]);
      const shopResults = await cacheCreatorAvatars(
        shopCreators[0].shop_id,
        shopCreators,
        { concurrency, logger },
      );
      indexes.forEach((originalIndex, resultIndex) => {
        localized[originalIndex] = shopResults[resultIndex];
      });
    }
    for (let index = 0; index < rows.length; index += 1) {
      scanned += 1;
      const avatarUrl = localized[index]?.avatar_url;
      if (!isLocalCreatorAvatarUrl(avatarUrl)) {
        failed += 1;
        continue;
      }
      await rows[index].update({ avatar_url: avatarUrl, updated_at: new Date() });
      cached += 1;
    }
    logger.info('[Creator Avatar Backfill] Progress', {
      scanned,
      cached,
      failed,
      lastId,
    });
  }
  return { scanned, cached, failed };
};

if (require.main === module) {
  run()
    .then((summary) => console.info('[Creator Avatar Backfill] Completed', summary))
    .catch((error) => {
      console.error('[Creator Avatar Backfill] Failed', { message: error.message });
      process.exitCode = 1;
    })
    .finally(() => sequelize.close());
}

module.exports = { run };
