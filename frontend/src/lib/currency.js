import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { fetchExchangeRates } from './api.js';

const CURRENCY_STORAGE_KEY = 'content_report_currency';
const DEFAULT_CURRENCY = 'MYR';
const SUPPORTED_CURRENCIES = new Set(['MYR', 'VND']);
let exchangeRatesSnapshot = null;
let exchangeRatesRequested = false;
const exchangeRateListeners = new Set();

function isSupportedCurrency(value) {
  return SUPPORTED_CURRENCIES.has(value);
}

export function getStoredCurrency() {
  try {
    const stored = localStorage.getItem(CURRENCY_STORAGE_KEY);
    return isSupportedCurrency(stored) ? stored : DEFAULT_CURRENCY;
  } catch {
    return DEFAULT_CURRENCY;
  }
}

export function setStoredCurrency(currency) {
  const nextCurrency = isSupportedCurrency(currency) ? currency : DEFAULT_CURRENCY;

  try {
    localStorage.setItem(CURRENCY_STORAGE_KEY, nextCurrency);
  } catch {
    // Ignore storage failures and keep the in-memory event flow working.
  }

  window.dispatchEvent(new Event('content-report-currency-change'));
}

function subscribe(callback) {
  const handler = () => callback();

  window.addEventListener('storage', handler);
  window.addEventListener('content-report-currency-change', handler);

  return () => {
    window.removeEventListener('storage', handler);
    window.removeEventListener('content-report-currency-change', handler);
  };
}

export function useCurrency() {
  return useSyncExternalStore(subscribe, getStoredCurrency, () => DEFAULT_CURRENCY);
}

function subscribeExchangeRates(callback) {
  exchangeRateListeners.add(callback);
  return () => exchangeRateListeners.delete(callback);
}

function getExchangeRatesSnapshot() {
  return exchangeRatesSnapshot;
}

async function loadExchangeRates() {
  if (exchangeRatesRequested) return;
  exchangeRatesRequested = true;
  try {
    const payload = await fetchExchangeRates();
    if (payload?.base === 'MYR' && payload?.rates) {
      exchangeRatesSnapshot = payload;
      exchangeRateListeners.forEach((listener) => listener());
    }
  } catch {
    // Keep original monetary values when the rate service is unavailable.
  }
}

export function useExchangeRates() {
  const rates = useSyncExternalStore(subscribeExchangeRates, getExchangeRatesSnapshot, () => null);
  useEffect(() => { loadExchangeRates(); }, []);
  return rates;
}

function normalizeCurrency(currency) {
  const normalized = String(currency || DEFAULT_CURRENCY).trim().toUpperCase();
  return normalized === 'LOCAL' ? DEFAULT_CURRENCY : normalized;
}

export function convertCurrencyAmount(amount, sourceCurrency, targetCurrency, exchangeRates) {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount)) return null;
  const source = normalizeCurrency(sourceCurrency);
  const target = normalizeCurrency(targetCurrency);
  if (source === target) return numericAmount;
  const sourceRate = Number(exchangeRates?.rates?.[source]);
  const targetRate = Number(exchangeRates?.rates?.[target]);
  if (!Number.isFinite(sourceRate) || sourceRate <= 0 || !Number.isFinite(targetRate) || targetRate <= 0) return null;
  return numericAmount * sourceRate / targetRate;
}

export function formatCurrencyAmount(amount, sourceCurrency, targetCurrency, exchangeRates, locale, options = {}) {
  const source = normalizeCurrency(sourceCurrency);
  const target = normalizeCurrency(targetCurrency);
  const converted = convertCurrencyAmount(amount, source, target, exchangeRates);
  const displayCurrency = converted === null ? source : target;
  const displayAmount = converted === null ? Number(amount) : converted;
  if (!Number.isFinite(displayAmount)) return '—';
  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: displayCurrency,
    maximumFractionDigits: displayCurrency === 'VND' ? 0 : 2,
    ...(options.compact ? { notation: 'compact', maximumFractionDigits: 1 } : {}),
  });
  if (displayCurrency === 'MYR' || displayCurrency === 'VND') {
    const symbol = displayCurrency === 'MYR' ? 'RM' : 'VNĐ';
    return formatter.formatToParts(displayAmount)
      .map((part) => part.type === 'currency' ? symbol : part.value)
      .join('');
  }
  return formatter.format(displayAmount);
}

export function useMoneyFormatter(locale) {
  const currency = useCurrency();
  const exchangeRates = useExchangeRates();
  return useMemo(() => ({
    currency,
    exchangeRates,
    convertAmount: (amount, sourceCurrency) => convertCurrencyAmount(amount, sourceCurrency, currency, exchangeRates),
    formatMoney: (amount, sourceCurrency, options) => formatCurrencyAmount(
      amount,
      sourceCurrency,
      currency,
      exchangeRates,
      locale,
      options,
    ),
  }), [currency, exchangeRates, locale]);
}

export { CURRENCY_STORAGE_KEY, DEFAULT_CURRENCY };
