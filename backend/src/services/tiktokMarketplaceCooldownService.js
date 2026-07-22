const { TikTokApiCooldown } = require('../models');

// This namespace is intentionally isolated to the Creator Discovery tab.
// Creator Performance and scheduled profile jobs keep their own cooldown.
const MARKETPLACE_COOLDOWN_NAMESPACE = 'creator_marketplace_discovery';
const DEFAULT_MARKETPLACE_COOLDOWN_MS = Math.max(
  60 * 1000,
  Number(process.env.TIKTOK_MARKETPLACE_RATE_LIMIT_COOLDOWN_MS) || 30 * 60 * 1000,
);

const loadMarketplaceCooldown = async (shopId, model = TikTokApiCooldown) => {
  const row = await model.findOne({
    where: { shop_id: shopId, namespace: MARKETPLACE_COOLDOWN_NAMESPACE },
  });
  return row?.cooldown_until ? new Date(row.cooldown_until).getTime() : 0;
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

module.exports = {
  MARKETPLACE_COOLDOWN_NAMESPACE,
  DEFAULT_MARKETPLACE_COOLDOWN_MS,
  loadMarketplaceCooldown,
  persistMarketplaceCooldown,
};
