const { TikTokApiCooldown } = require('../models');

// This namespace is intentionally isolated to the Creator Discovery tab.
// Creator Performance and scheduled profile jobs keep their own cooldown.
const MARKETPLACE_COOLDOWN_NAMESPACE = 'creator_marketplace_discovery';
const DEFAULT_MARKETPLACE_COOLDOWN_MS = Math.max(
  5 * 60 * 1000,
  Number(process.env.TIKTOK_MARKETPLACE_RATE_LIMIT_COOLDOWN_MS) || 5 * 60 * 1000,
);
const MAX_MARKETPLACE_COOLDOWN_MS = Math.max(
  DEFAULT_MARKETPLACE_COOLDOWN_MS,
  Number(process.env.TIKTOK_MARKETPLACE_RATE_LIMIT_MAX_COOLDOWN_MS) || 60 * 60 * 1000,
);

const marketplaceRateLimitCooldownMs = (consecutiveRateLimits = 1) => Math.min(
  MAX_MARKETPLACE_COOLDOWN_MS,
  DEFAULT_MARKETPLACE_COOLDOWN_MS * (2 ** Math.max(0, Number(consecutiveRateLimits || 1) - 1)),
);

const loadMarketplaceCooldown = async (shopId, model = TikTokApiCooldown) => {
  const row = await model.findOne({
    where: { shop_id: shopId, namespace: MARKETPLACE_COOLDOWN_NAMESPACE },
  });
  if (!row?.cooldown_until) return 0;
  return new Date(row.cooldown_until).getTime();
};

const persistMarketplaceCooldown = async (
  { shopId, cooldownUntil, reason },
  model = TikTokApiCooldown,
) => {
  await model.upsert({
    shop_id: shopId,
    namespace: MARKETPLACE_COOLDOWN_NAMESPACE,
    cooldown_until: new Date(cooldownUntil),
    reason: String(reason || '').slice(0, 2000) || null,
    updated_at: new Date(),
  });
};

const clearMarketplaceCooldown = async (shopId, model = TikTokApiCooldown) => {
  await model.destroy({
    where: { shop_id: shopId, namespace: MARKETPLACE_COOLDOWN_NAMESPACE },
  });
};

module.exports = {
  MARKETPLACE_COOLDOWN_NAMESPACE,
  DEFAULT_MARKETPLACE_COOLDOWN_MS,
  MAX_MARKETPLACE_COOLDOWN_MS,
  marketplaceRateLimitCooldownMs,
  loadMarketplaceCooldown,
  persistMarketplaceCooldown,
  clearMarketplaceCooldown,
};
