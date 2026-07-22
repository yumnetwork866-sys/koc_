const { sequelize } = require('../models');

const DISCOVERY_LOCK_NAMESPACE = 81427;
const MINUTE_MS = 60 * 1000;
const DEFAULT_MIN_INTERVAL_MS = Math.max(
  MINUTE_MS,
  Number(process.env.TIKTOK_MARKETPLACE_DISCOVERY_MIN_INTERVAL_MS) || MINUTE_MS,
);

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const createMarketplaceRequestGate = ({
  sequelizeInstance = sequelize,
  minIntervalMs = DEFAULT_MIN_INTERVAL_MS,
  now = () => Date.now(),
  sleep = delay,
} = {}) => async (shopId, operation) => {
  const enforcedIntervalMs = Math.max(MINUTE_MS, Number(minIntervalMs) || DEFAULT_MIN_INTERVAL_MS);
  const outcome = await sequelizeInstance.transaction(async (transaction) => {
    await sequelizeInstance.query(
      'SELECT pg_advisory_xact_lock(:namespace, :shopId)',
      { replacements: { namespace: DISCOVERY_LOCK_NAMESPACE, shopId: Number(shopId) }, transaction },
    );
    const [rows] = await sequelizeInstance.query(
      'SELECT next_request_at FROM tiktok_marketplace_request_gates WHERE shop_id = :shopId FOR UPDATE',
      { replacements: { shopId: Number(shopId) }, transaction },
    );
    const nextRequestAt = rows[0]?.next_request_at ? new Date(rows[0].next_request_at).getTime() : 0;
    if (nextRequestAt > now()) await sleep(nextRequestAt - now());
    const requestedAt = now();
    await sequelizeInstance.query(`
      INSERT INTO tiktok_marketplace_request_gates (shop_id, next_request_at, updated_at)
      VALUES (:shopId, :nextRequestAt, NOW())
      ON CONFLICT (shop_id) DO UPDATE SET
        next_request_at = EXCLUDED.next_request_at,
        updated_at = NOW()
    `, {
      replacements: {
        shopId: Number(shopId),
        nextRequestAt: new Date(requestedAt + enforcedIntervalMs),
      },
      transaction,
    });
    try {
      return { value: await operation() };
    } catch (error) {
      // Return the error so the transaction commits the request slot before
      // propagating it. A failed TikTok call must still consume its slot.
      return { error };
    }
  });
  if (outcome.error) throw outcome.error;
  return outcome.value;
};

const runMarketplaceDiscoveryRequest = createMarketplaceRequestGate();

module.exports = {
  createMarketplaceRequestGate,
  runMarketplaceDiscoveryRequest,
  DEFAULT_MIN_INTERVAL_MS,
  MINUTE_MS,
};
