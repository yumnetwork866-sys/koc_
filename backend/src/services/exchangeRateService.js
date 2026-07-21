const BNM_EXCHANGE_RATE_URL = 'https://api.bnm.gov.my/public/exchange-rate?session=0900&quote=rm';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

let usdMyrCache = null;

const getUsdMyrRate = async (fetchImpl = fetch) => {
  if (usdMyrCache && usdMyrCache.expiresAt > Date.now()) return usdMyrCache.value;

  const response = await fetchImpl(process.env.BNM_EXCHANGE_RATE_URL || BNM_EXCHANGE_RATE_URL, {
    headers: {
      accept: 'application/vnd.BNM.API.v1+json',
      'user-agent': 'YumReport/1.0',
    },
    signal: AbortSignal.timeout(Math.max(1000, Number(process.env.EXCHANGE_RATE_TIMEOUT_MS || 5000))),
  });
  if (!response.ok) throw new Error(`BNM exchange-rate request failed with status ${response.status}.`);

  const payload = await response.json();
  const usd = Array.isArray(payload.data)
    ? payload.data.find((item) => item.currency_code === 'USD')
    : null;
  const unit = Number(usd?.unit || 1);
  const middleRate = Number(usd?.rate?.middle_rate);
  if (!Number.isFinite(middleRate) || middleRate <= 0 || !Number.isFinite(unit) || unit <= 0) {
    throw new Error('BNM exchange-rate response does not contain a valid USD/MYR middle rate.');
  }

  const value = {
    base: 'USD',
    quote: 'MYR',
    rate: middleRate / unit,
    date: usd.rate.date || null,
    source: 'Bank Negara Malaysia',
  };
  usdMyrCache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
  return value;
};

const convertUsdMoneyToMyr = (money, exchangeRate) => {
  if (!money || money.amount === undefined || money.amount === null || money.amount === '') return null;
  if (money.currency === 'MYR') return { ...money, currency: 'MYR' };
  if (money.currency !== 'USD') return null;
  const amount = Number(money.amount);
  if (!Number.isFinite(amount)) return null;
  return {
    amount: String(amount * exchangeRate.rate),
    currency: 'MYR',
    source_amount: String(money.amount),
    source_currency: 'USD',
    exchange_rate: exchangeRate.rate,
    exchange_rate_date: exchangeRate.date,
  };
};

const addMarketplaceLocalCurrency = async (payload, region, fetchImpl = fetch) => {
  if (String(region || '').toUpperCase() !== 'MY' || !payload?.data) return payload;
  const exchangeRate = await getUsdMyrRate(fetchImpl);
  const addLocalGmv = (creator) => {
    if (!creator) return creator;
    const localGmv = convertUsdMoneyToMyr(creator.gmv, exchangeRate);
    return localGmv ? { ...creator, local_gmv: localGmv } : creator;
  };
  return {
    ...payload,
    data: {
      ...payload.data,
      ...(Array.isArray(payload.data.creators)
        ? { creators: payload.data.creators.map(addLocalGmv) }
        : {}),
      ...(payload.data.creator ? { creator: addLocalGmv(payload.data.creator) } : {}),
      exchange_rate: exchangeRate,
    },
  };
};

const clearExchangeRateCache = () => { usdMyrCache = null; };

module.exports = {
  BNM_EXCHANGE_RATE_URL,
  getUsdMyrRate,
  convertUsdMoneyToMyr,
  addMarketplaceLocalCurrency,
  clearExchangeRateCache,
};
