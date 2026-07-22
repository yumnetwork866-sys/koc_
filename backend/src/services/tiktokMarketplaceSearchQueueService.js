const crypto = require('node:crypto');
const { TikTokMarketplaceSearchSnapshot } = require('../models');

const SEARCH_RESULT_TTL_MS = 12 * 60 * 60 * 1000;
const normalizeSearchKeyword = (value) => String(value || '').trim().replace(/^@+/, '').toLowerCase();
const searchCacheKey = (keyword) => crypto.createHash('sha256').update(normalizeSearchKeyword(keyword)).digest('hex');

const createMarketplaceSearchQueueService = ({
  SearchModel = TikTokMarketplaceSearchSnapshot,
  now = () => new Date(),
} = {}) => {
  const queueSearch = async (shopId, keyword) => {
    const normalizedKeyword = normalizeSearchKeyword(keyword);
    if (!normalizedKeyword) return { status: 'EMPTY', keyword: '' };
    const cacheKey = searchCacheKey(normalizedKeyword);
    const existing = await SearchModel.findOne({ where: { shop_id: shopId, cache_key: cacheKey } });
    const existingStatus = existing?.payload?.status;
    const fetchedAt = existing?.fetched_at ? new Date(existing.fetched_at).getTime() : 0;
    if (existingStatus === 'PENDING') return { status: 'PENDING', keyword: normalizedKeyword };
    if (existingStatus === 'SUCCEEDED' && fetchedAt > now().getTime() - SEARCH_RESULT_TTL_MS) {
      return { status: 'SUCCEEDED', keyword: normalizedKeyword };
    }
    await SearchModel.upsert({
      shop_id: shopId,
      cache_key: cacheKey,
      payload: { keyword: normalizedKeyword, status: 'PENDING' },
      fetched_at: now(),
      updated_at: now(),
    });
    return { status: 'PENDING', keyword: normalizedKeyword };
  };

  const nextPendingSearch = async (shopId) => {
    const snapshots = await SearchModel.findAll({
      where: { shop_id: shopId },
      order: [['updated_at', 'ASC']],
      limit: 100,
    });
    return snapshots.find((snapshot) => snapshot?.payload?.status === 'PENDING') || null;
  };

  const completeSearch = async (snapshot, creatorCount) => snapshot.update({
    payload: { ...snapshot.payload, status: 'SUCCEEDED', creator_count: creatorCount, error: null },
    fetched_at: now(),
    updated_at: now(),
  });

  const retrySearch = async (snapshot, error) => snapshot.update({
    payload: { ...snapshot.payload, status: 'PENDING', error: String(error?.message || error).slice(0, 2000) },
    updated_at: now(),
  });

  return { queueSearch, nextPendingSearch, completeSearch, retrySearch };
};

const marketplaceSearchQueueService = createMarketplaceSearchQueueService();

module.exports = {
  SEARCH_RESULT_TTL_MS,
  normalizeSearchKeyword,
  searchCacheKey,
  createMarketplaceSearchQueueService,
  marketplaceSearchQueueService,
};
