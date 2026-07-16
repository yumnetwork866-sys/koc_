const createTtlPromiseCache = ({ ttlMs, maxEntries = 1000, now = Date.now } = {}) => {
  const entries = new Map();
  const normalizedTtlMs = Math.max(0, Number(ttlMs) || 0);
  const normalizedMaxEntries = Math.max(1, Number(maxEntries) || 1000);

  const prune = () => {
    const currentTime = now();
    for (const [key, entry] of entries) {
      if (!entry.pending && entry.expiresAt <= currentTime) entries.delete(key);
    }
    while (entries.size >= normalizedMaxEntries) entries.delete(entries.keys().next().value);
  };

  const getOrLoad = async (key, loader) => {
    if (!normalizedTtlMs) return { value: await loader(), hit: false };
    const existing = entries.get(key);
    if (existing && (existing.pending || existing.expiresAt > now())) {
      return { value: await existing.promise, hit: true };
    }
    if (existing) entries.delete(key);
    prune();
    const entry = { pending: true, expiresAt: Infinity, promise: null };
    entry.promise = Promise.resolve()
      .then(loader)
      .then((value) => {
        entry.pending = false;
        entry.expiresAt = now() + normalizedTtlMs;
        return value;
      })
      .catch((error) => {
        if (entries.get(key) === entry) entries.delete(key);
        throw error;
      });
    entries.set(key, entry);
    return { value: await entry.promise, hit: false };
  };

  return {
    getOrLoad,
    clear: () => entries.clear(),
  };
};

module.exports = { createTtlPromiseCache };
