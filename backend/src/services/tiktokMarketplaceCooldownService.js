const { TikTokApiCooldown } = require('../models');

// This namespace is intentionally isolated to the Creator Discovery tab.
// Creator Performance and scheduled profile jobs keep their own cooldown.
const MARKETPLACE_COOLDOWN_NAMESPACE = 'creator_marketplace_discovery';
const DEFAULT_MARKETPLACE_COOLDOWN_MS = Math.max(
  60 * 1000,
  Number(process.env.TIKTOK_MARKETPLACE_RATE_LIMIT_COOLDOWN_MS) || 60 * 1000,
);

const loadMarketplaceCooldown = async (shopId, model = TikTokApiCooldown) => {
  const row = await model.findOne({
    where: { shop_id: shopId, namespace: MARKETPLACE_COOLDOWN_NAMESPACE },
  });
  if (!row?.cooldown_until) return 0;
  const persistedUntil = new Date(row.cooldown_until).getTime();
  if (!row.updated_at) return persistedUntil;
  const updatedAt = new Date(row.updated_at || 0).getTime();
  if (!Number.isFinite(updatedAt)) return persistedUntil;
  return Math.min(persistedUntil, updatedAt + DEFAULT_MARKETPLACE_COOLDOWN_MS);
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
