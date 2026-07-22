const creatorProfileRefreshCounts = new Map();

const shopKey = (shopId) => String(shopId);

const beginCreatorProfileRefresh = (shopId) => {
  const key = shopKey(shopId);
  creatorProfileRefreshCounts.set(key, Number(creatorProfileRefreshCounts.get(key) || 0) + 1);
};

const endCreatorProfileRefresh = (shopId) => {
  const key = shopKey(shopId);
  const remaining = Number(creatorProfileRefreshCounts.get(key) || 0) - 1;
  if (remaining > 0) creatorProfileRefreshCounts.set(key, remaining);
  else creatorProfileRefreshCounts.delete(key);
};

const isCreatorProfileRefreshActive = (shopId) => (
  Number(creatorProfileRefreshCounts.get(shopKey(shopId)) || 0) > 0
);

module.exports = {
  beginCreatorProfileRefresh,
  endCreatorProfileRefresh,
  isCreatorProfileRefreshActive,
};
