import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  disconnectTikTokShopAuthorization,
  fetchTikTokShopAnalytics,
  fetchTikTokShopConnections,
  fetchTikTokShops,
  startTikTokShopOauth,
  syncTikTokShopAnalytics,
} from '../lib/api';
import { useI18n } from '../lib/language';
import ShopDropdown from './ShopDropdown';

const REQUIRED_SCOPE = 'data.shop_analytics.public.read';
const SOURCE_COLORS = [
  'var(--color-social-cyan-strong)',
  'var(--color-social-magenta)',
  'var(--color-primary)',
  'var(--color-warning)',
  'var(--color-success)',
];
const CHART_TOOLTIP_STYLE = {
  borderRadius: 8,
  border: '1px solid #e2e8f0',
  boxShadow: '0 18px 40px -12px rgba(15, 23, 42, 0.24)',
  color: '#0f172a',
};
const CHART_TICK = { fill: '#64748b', fontSize: 12 };

const ICON_PATHS = {
  shop: ['M4 9h16', 'M5 9l1-5h12l1 5', 'M6 9v11h12V9', 'M9 20v-6h6v6'],
  gmv: ['M12 3v18', 'M17 7.5C17 5.6 15.2 4 12.5 4S8 5.4 8 7.5s1.8 3 4.5 3 4.5 1.4 4.5 3S15.2 17 12.5 17 8 15.4 8 13.5'],
  orders: ['M5 7h14l-1 13H6L5 7Z', 'M9 9V6a3 3 0 0 1 6 0v3'],
  unitsSold: ['M4 8l8-4 8 4-8 4-8-4Z', 'M4 8v8l8 4 8-4V8', 'M12 12v8'],
  buyers: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z', 'M5 21a7 7 0 0 1 14 0'],
  avgOrderValue: ['M4 6h16v12H4z', 'M8 12h8', 'M12 9v6'],
  refunds: ['M8 7H4v-4', 'M4 7a8 8 0 1 1-1 7', 'M4 7l4-4'],
  sync: ['M20 7h-5V2', 'M4 17h5v5', 'M19 12a7 7 0 0 0-12-5l-2 2', 'M5 12a7 7 0 0 0 12 5l2-2'],
  connect: ['M12 5v14', 'M5 12h14'],
  analytics: ['M4 19V9', 'M10 19V5', 'M16 19v-7', 'M3 19h18'],
  connections: ['M8 12h8', 'M9 8H7a4 4 0 0 0 0 8h2', 'M15 8h2a4 4 0 0 1 0 8h-2'],
};

const AnalyticsIcon = ({ name, className = '' }) => (
  <svg
    className={`shop-analytics__icon ${className}`.trim()}
    viewBox="0 0 24 24"
    aria-hidden="true"
    focusable="false"
  >
    {(ICON_PATHS[name] || ICON_PATHS.analytics).map((path) => (
      <path key={path} d={path} />
    ))}
  </svg>
);

const dateOnly = (date) => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, '0'),
  String(date.getDate()).padStart(2, '0'),
].join('-');

const shiftDate = (value, days) => {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  date.setDate(date.getDate() + days);
  return dateOnly(date);
};

const rangeForDays = (days) => {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - days);
  return { startDate: dateOnly(start), endDate: dateOnly(end) };
};

const numericValue = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const moneyValue = (value) => numericValue(value?.amount ?? value);
const padDatePart = (value) => String(value).padStart(2, '0');

const dateParts = (value) => {
  const match = String(value || '').slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? { year: match[1], month: match[2], day: match[3] } : null;
};

const formatDisplayDate = (value, fallback) => {
  const parts = dateParts(value);
  return parts ? `${parts.day}/${parts.month}/${parts.year}` : fallback;
};

const formatDisplayDateTime = (value, fallback) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return `${padDatePart(date.getHours())}:${padDatePart(date.getMinutes())} ${padDatePart(date.getDate())}/${padDatePart(date.getMonth() + 1)}/${date.getFullYear()}`;
};

const scopesOf = (authorization) => {
  if (Array.isArray(authorization?.granted_scopes)) return authorization.granted_scopes;
  return String(authorization?.granted_scopes || '')
    .split(',')
    .map((scope) => scope.trim())
    .filter(Boolean);
};

const sumBy = (rows, key, value = numericValue) => rows.reduce(
  (total, row) => total + value(row?.[key]),
  0,
);

const totalsFor = (rows) => {
  const gmv = sumBy(rows, 'gmv', moneyValue);
  const orders = sumBy(rows, 'orders');
  const cancellationRows = rows.filter((row) => row?.cancellations_and_returns !== null
    && row?.cancellations_and_returns !== undefined);
  return {
    gmv,
    orders,
    unitsSold: sumBy(rows, 'units_sold'),
    buyers: sumBy(rows, 'buyers'),
    impressions: sumBy(rows, 'product_impressions'),
    pageViews: sumBy(rows, 'product_page_views'),
    refunds: sumBy(rows, 'refunds', moneyValue),
    cancellations: cancellationRows.length ? sumBy(cancellationRows, 'cancellations_and_returns') : null,
    avgOrderValue: orders ? gmv / orders : 0,
  };
};

const percentage = (value, total) => (total > 0 ? value / total * 100 : 0);
const boundedPercentage = (value) => Math.min(100, Math.max(0, value));

const ShopAnalytics = () => {
  const { t, language } = useI18n();
  const locale = language === 'vi' ? 'vi-VN' : 'en-US';
  const initialRange = useMemo(() => rangeForDays(30), []);
  const [activeTab, setActiveTab] = useState('analytics');
  const [shops, setShops] = useState([]);
  const [connections, setConnections] = useState([]);
  const [selectedShopId, setSelectedShopId] = useState('');
  const [startDate, setStartDate] = useState(initialRange.startDate);
  const [endDate, setEndDate] = useState(initialRange.endDate);
  const [periodPreset, setPeriodPreset] = useState('30d');
  const currency = 'LOCAL';
  const [chartMetric, setChartMetric] = useState('gmv');
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [disconnectingId, setDisconnectingId] = useState(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);

  const formatNumber = (value) => numericValue(value).toLocaleString(locale, {
    maximumFractionDigits: 2,
  });
  const formatOptionalNumber = (value) => value === null || value === undefined ? '—' : formatNumber(value);
  const formatPercent = (value) => `${numericValue(value).toLocaleString(locale, {
    maximumFractionDigits: 1,
  })}%`;
  const formatDate = (value) => formatDisplayDate(value, t('common.noData'));
  const formatDateTime = (value) => formatDisplayDateTime(value, t('common.noData'));

  const loadInventory = useCallback(async (signal) => {
    setLoading(true);
    setError('');
    try {
      const [loadedShops, loadedConnections] = await Promise.all([
        fetchTikTokShops(signal),
        fetchTikTokShopConnections(signal),
      ]);
      setShops(Array.isArray(loadedShops) ? loadedShops : []);
      setConnections(Array.isArray(loadedConnections) ? loadedConnections : []);
    } catch (requestError) {
      if (requestError.name !== 'AbortError') {
        setError(requestError.message || t('shopAnalytics.loadError'));
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    const controller = new AbortController();
    loadInventory(controller.signal);
    return () => controller.abort();
  }, [loadInventory]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('shop_oauth_status');
    if (!status) return;
    setToast({
      type: status === 'success' ? 'success' : status === 'warning' ? 'info' : 'error',
      message: params.get('shop_oauth_message') || t(
        status === 'success'
          ? 'shopAnalytics.oauthSuccess'
          : status === 'warning'
            ? 'shopAnalytics.oauthWarning'
            : 'shopAnalytics.oauthError',
      ),
    });
    params.delete('shop_oauth_status');
    params.delete('shop_oauth_message');
    const query = params.toString();
    window.history.replaceState(
      {},
      '',
      `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`,
    );
  }, [t]);

  useEffect(() => {
    setSelectedShopId((current) => {
      if (shops.some((shop) => String(shop.id) === String(current))) return current;
      return shops[0]?.id ? String(shops[0].id) : '';
    });
  }, [shops]);

  const invalidRange = !startDate || !endDate || startDate >= endDate;

  useEffect(() => {
    if (!selectedShopId || invalidRange) {
      setSnapshot(null);
      setAnalyticsLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    setAnalyticsLoading(true);
    setSnapshot(null);
    setError('');
    fetchTikTokShopAnalytics(selectedShopId, {
      signal: controller.signal,
      startDate,
      endDate,
      currency,
    }).then((payload) => {
      setSnapshot(payload?.snapshots?.[0] || null);
    }).catch((requestError) => {
      if (requestError.name !== 'AbortError') {
        setError(requestError.message || t('shopAnalytics.loadError'));
      }
    }).finally(() => {
      if (!controller.signal.aborted) setAnalyticsLoading(false);
    });
    return () => controller.abort();
  }, [currency, endDate, invalidRange, selectedShopId, startDate, t]);

  const selectedShop = useMemo(
    () => shops.find((shop) => String(shop.id) === String(selectedShopId)) || null,
    [selectedShopId, shops],
  );
  const selectedAuthorization = useMemo(() => connections.find(
    (authorization) => String(authorization.id) === String(selectedShop?.authorization?.id),
  ) || selectedShop?.authorization || null, [connections, selectedShop]);
  const selectedScopes = useMemo(() => scopesOf(selectedAuthorization), [selectedAuthorization]);
  const missingAnalyticsScope = Boolean(selectedShop) && !selectedScopes.includes(REQUIRED_SCOPE);
  const tokenExpired = Boolean(
    selectedAuthorization?.refresh_token_expires_at
      && new Date(selectedAuthorization.refresh_token_expires_at).getTime() <= Date.now(),
  );

  const intervals = useMemo(() => (
    Array.isArray(snapshot?.metrics?.intervals) ? snapshot.metrics.intervals : []
  ), [snapshot]);
  const comparisonIntervals = useMemo(() => (
    Array.isArray(snapshot?.metrics?.comparison_intervals)
      ? snapshot.metrics.comparison_intervals
      : []
  ), [snapshot]);
  const totals = useMemo(() => totalsFor(intervals), [intervals]);
  const comparisonTotals = useMemo(() => totalsFor(comparisonIntervals), [comparisonIntervals]);
  const hasData = intervals.length > 0;
  const hasComparison = comparisonIntervals.length > 0;
  const displayCurrency = intervals.find((row) => row?.gmv?.currency)?.gmv?.currency
    || (currency === 'USD' ? 'USD' : 'VND');

  const formatMoney = (value) => {
    try {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: displayCurrency,
        maximumFractionDigits: displayCurrency === 'VND' ? 0 : 2,
      }).format(numericValue(value));
    } catch {
      return `${formatNumber(value)} ${displayCurrency}`;
    }
  };

  const changeFrom = (current, previous) => {
    if (!hasComparison || previous === 0) return null;
    return (current - previous) / Math.abs(previous) * 100;
  };

  const chartData = useMemo(() => intervals.map((row) => ({
    date: row.start_date,
    gmv: moneyValue(row.gmv),
    orders: numericValue(row.orders),
    unitsSold: numericValue(row.units_sold),
    buyers: numericValue(row.buyers),
  })), [intervals]);

  const breakdowns = useMemo(() => {
    const values = new Map();
    intervals.forEach((row) => (Array.isArray(row.gmv_breakdowns) ? row.gmv_breakdowns : [])
      .forEach((item) => {
        const type = item.type || t('common.unknown');
        values.set(type, (values.get(type) || 0) + moneyValue(item));
      }));
    return [...values.entries()]
      .map(([type, amount]) => ({ type, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [intervals, t]);
  const breakdownTotal = useMemo(
    () => breakdowns.reduce((total, item) => total + item.amount, 0),
    [breakdowns],
  );

  const sourceLabel = (type) => {
    const translationKeys = {
      LIVE: 'shopAnalytics.sourceLive',
      VIDEO: 'shopAnalytics.sourceVideo',
      PRODUCT_CARD: 'shopAnalytics.sourceProductCard',
    };
    return translationKeys[type] ? t(translationKeys[type]) : type;
  };

  const syncAnalytics = async () => {
    if (!selectedShopId || invalidRange || missingAnalyticsScope || tokenExpired || syncing) return;
    try {
      setSyncing(true);
      setError('');
      const payload = await syncTikTokShopAnalytics(selectedShopId, {
        start_date: startDate,
        end_date: endDate,
        currency,
      });
      setSnapshot(payload?.snapshot || null);
      if (payload?.shop) {
        setShops((current) => current.map((shop) => (
          String(shop.id) === String(payload.shop.id)
            ? { ...shop, ...payload.shop, authorization: shop.authorization }
            : shop
        )));
      }
      setToast({ type: 'success', message: t('shopAnalytics.syncSuccess') });
    } catch (requestError) {
      setToast({ type: 'error', message: requestError.message || t('shopAnalytics.syncError') });
    } finally {
      setSyncing(false);
    }
  };

  const startConnect = async () => {
    if (disconnectingId !== null) return;
    try {
      setConnecting(true);
      setError('');
      const { authorizeUrl } = await startTikTokShopOauth();
      if (!authorizeUrl) throw new Error(t('shopAnalytics.oauthError'));
      window.location.assign(authorizeUrl);
    } catch (requestError) {
      setToast({ type: 'error', message: requestError.message || t('shopAnalytics.oauthError') });
      setConnecting(false);
    }
  };

  const disconnect = async (authorization) => {
    if (!window.confirm(t('shopAnalytics.disconnectConfirm'))) return;
    try {
      setDisconnectingId(authorization.id);
      await disconnectTikTokShopAuthorization(authorization.id);
      if (String(selectedShop?.authorization?.id) === String(authorization.id)) {
        setSnapshot(null);
      }
      await loadInventory();
      setToast({ type: 'success', message: t('shopAnalytics.disconnectSuccess') });
    } catch (requestError) {
      setToast({ type: 'error', message: requestError.message || t('shopAnalytics.disconnectError') });
    } finally {
      setDisconnectingId(null);
    }
  };

  const changeCustomDate = (setter, currentValue) => (event) => {
    const nextValue = event.target.value;
    if (nextValue === currentValue) return;
    setSnapshot(null);
    setter(nextValue);
  };

  const changeSelectedShop = (nextShopId) => {
    if (nextShopId === selectedShopId) return;
    setSnapshot(null);
    setSelectedShopId(nextShopId);
  };

  const changePeriodPreset = (event) => {
    const nextPreset = event.target.value;
    setPeriodPreset(nextPreset);
    if (nextPreset === 'custom') return;
    const days = Number(nextPreset.replace(/d$/, ''));
    if (!Number.isFinite(days) || days <= 0) return;
    const nextRange = rangeForDays(days);
    setSnapshot(null);
    setStartDate(nextRange.startDate);
    setEndDate(nextRange.endDate);
  };

  const kpis = [
    { key: 'gmv', value: formatMoney(totals.gmv), change: changeFrom(totals.gmv, comparisonTotals.gmv) },
    { key: 'orders', value: formatNumber(totals.orders), change: changeFrom(totals.orders, comparisonTotals.orders) },
    { key: 'unitsSold', value: formatNumber(totals.unitsSold), change: changeFrom(totals.unitsSold, comparisonTotals.unitsSold) },
    { key: 'buyers', value: formatNumber(totals.buyers), change: changeFrom(totals.buyers, comparisonTotals.buyers) },
    { key: 'avgOrderValue', value: formatMoney(totals.avgOrderValue), change: changeFrom(totals.avgOrderValue, comparisonTotals.avgOrderValue) },
    { key: 'refunds', value: formatMoney(totals.refunds), change: changeFrom(totals.refunds, comparisonTotals.refunds), inverse: true },
  ];
  const chartLabel = t(`shopAnalytics.${chartMetric}`);
  const funnel = [
    {
      key: 'impressions',
      value: totals.impressions,
      rate: 100,
      barRate: 100,
      rateLabel: t('shopAnalytics.funnelBaseline'),
    },
    {
      key: 'pageViews',
      value: totals.pageViews,
      rate: percentage(totals.pageViews, totals.impressions),
      barRate: percentage(totals.pageViews, totals.impressions),
      rateLabel: t('shopAnalytics.fromImpressions'),
    },
    {
      key: 'buyers',
      value: totals.buyers,
      rate: percentage(totals.buyers, totals.pageViews),
      barRate: percentage(totals.buyers, totals.impressions),
      rateLabel: t('shopAnalytics.fromPageViews'),
    },
  ];

  const renderDelta = (kpi) => {
    if (analyticsLoading) {
      return <span className="shop-analytics__change is-muted">{t('common.loading')}</span>;
    }
    if (!hasData) return <span className="shop-analytics__change is-muted">{t('shopAnalytics.awaitingData')}</span>;
    if (kpi.change === null) {
      return <span className="shop-analytics__change is-muted">{t('shopAnalytics.noComparison')}</span>;
    }
    const favorable = kpi.change === 0 || (kpi.inverse ? kpi.change < 0 : kpi.change > 0);
    const tone = kpi.change === 0 ? 'is-neutral' : favorable ? 'is-positive' : 'is-negative';
    const direction = kpi.change > 0
      ? t('shopAnalytics.increased')
      : kpi.change < 0
        ? t('shopAnalytics.decreased')
        : t('shopAnalytics.unchanged');
    return (
      <span className={`shop-analytics__change ${tone}`}>
        <span aria-hidden="true">{kpi.change > 0 ? '↑' : kpi.change < 0 ? '↓' : '→'}</span>
        {' '}{direction}{' '}
        {Math.abs(kpi.change).toLocaleString(locale, { maximumFractionDigits: 1 })}%{' '}
        {t('shopAnalytics.vsPrevious')}
      </span>
    );
  };

  return (
    <div className="page shop-analytics">
      <section className="page__hero shop-analytics__hero">
        <div className="shop-analytics__hero-row">
          <div className="shop-analytics__hero-copy">
            <h1 className="page__title">{t('shopAnalytics.heroTitle')}</h1>
          </div>
        </div>

      </section>

      {toast ? (
        <div
          className={`koc-toast koc-toast--${toast.type}`}
          role={toast.type === 'error' ? 'alert' : 'status'}
          aria-live="polite"
        >
          <span>{toast.message}</span>
          <button
            className="koc-toast__close"
            type="button"
            aria-label={t('common.close')}
            onClick={() => setToast(null)}
          >×</button>
        </div>
      ) : null}
      {error ? <section className="section-card shop-analytics__error" role="alert">{error}</section> : null}

      <div
        className="shop-analytics__tabs"
        role="tablist"
        aria-label={t('shopAnalytics.tabsLabel')}
        onKeyDown={(event) => {
          if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
            event.preventDefault();
            const tabs = [...event.currentTarget.querySelectorAll('[role="tab"]')];
            const currentIndex = tabs.indexOf(document.activeElement);
            const direction = event.key === 'ArrowRight' ? 1 : -1;
            const nextIndex = (Math.max(currentIndex, 0) + direction + tabs.length) % tabs.length;
            tabs[nextIndex]?.focus();
            setActiveTab(tabs[nextIndex]?.id === 'shop-connections-tab' ? 'connections' : 'analytics');
          }
        }}
      >
        <button
          id="shop-analytics-tab"
          className={activeTab === 'analytics' ? 'is-active' : ''}
          type="button"
          role="tab"
          aria-selected={activeTab === 'analytics'}
          aria-controls="shop-analytics-panel"
          tabIndex={activeTab === 'analytics' ? 0 : -1}
          onClick={() => setActiveTab('analytics')}
        >
          <AnalyticsIcon name="analytics" />
          {t('shopAnalytics.analyticsTab')}
          <span>{shops.length}</span>
        </button>
        <button
          id="shop-connections-tab"
          className={activeTab === 'connections' ? 'is-active' : ''}
          type="button"
          role="tab"
          aria-selected={activeTab === 'connections'}
          aria-controls="shop-connections-panel"
          tabIndex={activeTab === 'connections' ? 0 : -1}
          onClick={() => setActiveTab('connections')}
        >
          <AnalyticsIcon name="connections" />
          {t('shopAnalytics.connectionsTab')}
          <span>{connections.length}</span>
        </button>
      </div>

      {activeTab === 'analytics' ? (
        <div
          id="shop-analytics-panel"
          className="shop-analytics__tab-panel"
          role="tabpanel"
          aria-labelledby="shop-analytics-tab"
        >
          <section className="section-card shop-analytics__filters" aria-labelledby="shop-analytics-filters-title">
            <div className="shop-analytics__filter-heading">
              <div>
                <h2 className="section-card__title" id="shop-analytics-filters-title">
                  {t('shopAnalytics.filtersTitle')}
                </h2>
              </div>
              <button
                className="button shop-analytics__sync-button"
                type="button"
                onClick={syncAnalytics}
                disabled={!selectedShopId || invalidRange || missingAnalyticsScope || tokenExpired || syncing}
              >
                <AnalyticsIcon name="sync" />
                {syncing ? t('shopAnalytics.syncing') : t('shopAnalytics.syncNow')}
              </button>
            </div>
            <div className="shop-analytics__filter-grid">
              <div className="field">
                <label htmlFor="analytics-shop">{t('shopAnalytics.shop')}</label>
                <ShopDropdown
                  id="analytics-shop"
                  value={selectedShopId}
                  shops={shops}
                  disabled={loading || !shops.length}
                  onChange={changeSelectedShop}
                  placeholder={loading ? t('common.loading') : t('shopAnalytics.selectShop')}
                  unknownLabel={t('common.unknown')}
                />
              </div>
              <div className="field">
                <label htmlFor="analytics-period">{t('shopAnalytics.period')}</label>
                <select id="analytics-period" value={periodPreset} onChange={changePeriodPreset}>
                  <option value="7d">{t('shopAnalytics.period7d')}</option>
                  <option value="30d">{t('shopAnalytics.period30d')}</option>
                  <option value="90d">{t('shopAnalytics.period90d')}</option>
                  <option value="custom">{t('shopAnalytics.periodCustom')}</option>
                </select>
              </div>
              {periodPreset === 'custom' ? (
                <>
                  <div className="field">
                    <label htmlFor="analytics-start-date">{t('shopAnalytics.startDate')}</label>
                    <input
                      id="analytics-start-date"
                      type="date"
                      value={startDate}
                      max={endDate ? shiftDate(endDate, -1) : undefined}
                      onChange={changeCustomDate(setStartDate, startDate)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="analytics-end-date">{t('shopAnalytics.endDate')}</label>
                    <input
                      id="analytics-end-date"
                      type="date"
                      value={endDate}
                      min={startDate ? shiftDate(startDate, 1) : undefined}
                      max={dateOnly(new Date())}
                      aria-invalid={invalidRange}
                      onChange={changeCustomDate(setEndDate, endDate)}
                    />
                  </div>
                </>
              ) : null}
            </div>
            {invalidRange ? (
              <p className="shop-analytics__validation" role="alert">{t('shopAnalytics.invalidRange')}</p>
            ) : null}
          </section>

          {selectedShop && (missingAnalyticsScope || tokenExpired) ? (
            <section className="shop-analytics__permission-banner" role="status">
              <div>
                <strong>{t(tokenExpired ? 'shopAnalytics.tokenExpired' : 'shopAnalytics.missingScope')}</strong>
                <span>{t(tokenExpired ? 'shopAnalytics.tokenExpiredAction' : 'shopAnalytics.missingScopeAction')}</span>
              </div>
            </section>
          ) : null}

          {!loading && !shops.length ? (
            <section className="section-card shop-analytics__empty">
              <div className="shop-analytics__empty-icon" aria-hidden="true">
                <AnalyticsIcon name="shop" />
              </div>
              <h2>{t('shopAnalytics.noShops')}</h2>
              <p>{t('shopAnalytics.noShopsMeta')}</p>
            </section>
          ) : null}

          {loading ? (
            <section className="section-card empty-state">
              <span className="loading-dot" />
              {t('shopAnalytics.loadingShops')}
            </section>
          ) : null}

          {selectedShop ? (
            <>
              <section className="page__stats shop-analytics__stats" aria-label={t('shopAnalytics.kpiTitle')}>
                {kpis.map((kpi) => (
                  <article className={`stat-card shop-analytics__stat shop-analytics__stat--${kpi.key}`} key={kpi.key}>
                    <div className="shop-analytics__stat-heading">
                      <p className="stat-card__label">{t(`shopAnalytics.${kpi.key}`)}</p>
                      <span className="shop-analytics__stat-icon" aria-hidden="true">
                        <AnalyticsIcon name={kpi.key} />
                      </span>
                    </div>
                    <p className="stat-card__value">
                      {analyticsLoading ? <span className="shop-analytics__value-skeleton" /> : hasData ? kpi.value : '—'}
                    </p>
                    {renderDelta(kpi)}
                  </article>
                ))}
              </section>

              <section className="shop-analytics__chart-grid">
                <article className="section-card shop-analytics__chart-card">
                  <div className="section-card__header shop-analytics__chart-header">
                    <div>
                      <h2 className="section-card__title">{t('shopAnalytics.trend')}</h2>
                    </div>
                    <div className="shop-analytics__metric-switcher" role="group" aria-label={t('shopAnalytics.metric')}>
                      {['gmv', 'orders', 'unitsSold', 'buyers'].map((metric) => (
                        <button
                          className={chartMetric === metric ? 'is-active' : ''}
                          type="button"
                          key={metric}
                          aria-pressed={chartMetric === metric}
                          onClick={() => setChartMetric(metric)}
                        >
                          {t(`shopAnalytics.${metric}`)}
                        </button>
                      ))}
                    </div>
                  </div>
                  {analyticsLoading ? (
                    <div className="empty-state">
                      <span className="loading-dot" />
                      {t('shopAnalytics.loadingAnalytics')}
                    </div>
                  ) : chartData.length ? (
                    <div className="shop-analytics__chart" role="img" aria-label={`${t('shopAnalytics.trend')}: ${chartLabel}`}>
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData} margin={{ top: 12, right: 12, bottom: 4, left: 4 }}>
                          <defs>
                            <linearGradient id="shopAnalyticsArea" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="var(--color-social-cyan-strong)" stopOpacity={0.28} />
                              <stop offset="100%" stopColor="var(--color-social-cyan-strong)" stopOpacity={0.02} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#e2e8f0" />
                          <XAxis
                            dataKey="date"
                            axisLine={false}
                            tickLine={false}
                            minTickGap={26}
                            tick={CHART_TICK}
                            tickFormatter={(value) => {
                              const parts = dateParts(value);
                              return parts ? `${parts.day}/${parts.month}` : value;
                            }}
                          />
                          <YAxis
                            width={64}
                            axisLine={false}
                            tickLine={false}
                            tick={CHART_TICK}
                            tickFormatter={(value) => Intl.NumberFormat(locale, { notation: 'compact' }).format(value)}
                          />
                          <Tooltip
                            labelFormatter={formatDate}
                            formatter={(value) => [
                              chartMetric === 'gmv' ? formatMoney(value) : formatNumber(value),
                              chartLabel,
                            ]}
                            contentStyle={CHART_TOOLTIP_STYLE}
                          />
                          <Area
                            type="monotone"
                            dataKey={chartMetric}
                            stroke="var(--color-social-cyan-strong)"
                            strokeWidth={3}
                            fill="url(#shopAnalyticsArea)"
                            dot={false}
                            activeDot={{ r: 5, strokeWidth: 2 }}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="empty-state shop-analytics__chart-empty">
                      <p>{t('shopAnalytics.noData')}</p>
                    </div>
                  )}
                </article>

                <div className="shop-analytics__insight-stack">
                  <article className="section-card shop-analytics__breakdown-card">
                    <div className="section-card__header">
                      <div>
                        <h2 className="section-card__title">{t('shopAnalytics.gmvBreakdown')}</h2>
                        <p className="section-card__meta">{t('shopAnalytics.gmvBreakdownMeta')}</p>
                      </div>
                    </div>
                    {analyticsLoading ? (
                      <div className="empty-state empty-state--compact">
                        <span className="loading-dot" />
                        {t('shopAnalytics.loadingAnalytics')}
                      </div>
                    ) : breakdowns.length ? (
                      <div className="shop-analytics__breakdowns">
                        {breakdowns.map((item, index) => {
                          const share = percentage(item.amount, breakdownTotal);
                          return (
                            <div className="shop-analytics__breakdown" key={item.type}>
                              <div className="shop-analytics__breakdown-heading">
                                <span>
                                  <i style={{ background: SOURCE_COLORS[index % SOURCE_COLORS.length] }} aria-hidden="true" />
                                  {sourceLabel(item.type)}
                                </span>
                                <strong>{formatPercent(share)}</strong>
                              </div>
                              <div className="shop-analytics__breakdown-track" aria-hidden="true">
                                <span
                                  style={{
                                    width: `${boundedPercentage(share)}%`,
                                    background: SOURCE_COLORS[index % SOURCE_COLORS.length],
                                  }}
                                />
                              </div>
                              <small>{formatMoney(item.amount)}</small>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="empty-state empty-state--compact">{t('shopAnalytics.noBreakdown')}</div>
                    )}
                  </article>

                  <article className="section-card shop-analytics__funnel-card">
                    <div className="section-card__header">
                      <div>
                        <h2 className="section-card__title">{t('shopAnalytics.commerceFunnel')}</h2>
                        <p className="section-card__meta">{t('shopAnalytics.commerceFunnelMeta')}</p>
                      </div>
                    </div>
                    {analyticsLoading ? (
                      <div className="empty-state empty-state--compact">
                        <span className="loading-dot" />
                        {t('shopAnalytics.loadingAnalytics')}
                      </div>
                    ) : hasData ? (
                      <div className="shop-analytics__funnel">
                        {funnel.map((step, index) => (
                          <div className="shop-analytics__funnel-step" key={step.key}>
                            <div>
                              <span>{index + 1}</span>
                              <strong>{t(`shopAnalytics.${step.key}`)}</strong>
                            </div>
                            <strong>{formatNumber(step.value)}</strong>
                            <div className="shop-analytics__funnel-track" aria-hidden="true">
                              <span style={{ width: `${boundedPercentage(step.barRate)}%` }} />
                            </div>
                            <small>{formatPercent(step.rate)} {step.rateLabel}</small>
                          </div>
                        ))}
                        <div className="shop-analytics__funnel-footer">
                          <span>{t('shopAnalytics.cancellationsReturns')}</span>
                          <strong>{formatOptionalNumber(totals.cancellations)}</strong>
                        </div>
                      </div>
                    ) : (
                      <div className="empty-state empty-state--compact">{t('shopAnalytics.noData')}</div>
                    )}
                  </article>
                </div>
              </section>

              <section className="section-card shop-analytics__daily-card">
                <div className="section-card__header">
                  <div>
                    <h2 className="section-card__title">{t('shopAnalytics.dailyValues')}</h2>
                    <p className="section-card__meta">
                      {snapshot
                        ? `${t('shopAnalytics.lastSync')}: ${formatDateTime(snapshot.synced_at)} · ${t('shopAnalytics.latestDate')}: ${formatDate(snapshot.latest_available_date)}`
                        : t('shopAnalytics.noData')}
                    </p>
                  </div>
                  {snapshot?.request_id ? (
                    <span className="chip shop-analytics__request-chip">
                      {t('shopAnalytics.requestId')}: {snapshot.request_id}
                    </span>
                  ) : null}
                </div>
                <div className="table-wrap shop-analytics__table-wrap">
                  <table className="data-table shop-analytics__table">
                    <thead>
                      <tr>
                        <th>{t('shopAnalytics.date')}</th>
                        <th className="cell-number">{t('shopAnalytics.gmv')}</th>
                        <th className="cell-number">{t('shopAnalytics.orders')}</th>
                        <th className="cell-number">{t('shopAnalytics.unitsSold')}</th>
                        <th className="cell-number">{t('shopAnalytics.buyers')}</th>
                        <th className="cell-number">{t('shopAnalytics.impressions')}</th>
                        <th className="cell-number">{t('shopAnalytics.pageViews')}</th>
                        <th className="cell-number">{t('shopAnalytics.refunds')}</th>
                        <th className="cell-number">{t('shopAnalytics.cancellationsReturns')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analyticsLoading ? (
                        <tr>
                          <td colSpan={9}>
                            <div className="empty-state empty-state--compact table-empty-state">
                              <span className="loading-dot" />
                              {t('shopAnalytics.loadingAnalytics')}
                            </div>
                          </td>
                        </tr>
                      ) : null}
                      {intervals.map((row, index) => (
                        <tr key={`${row.start_date}-${index}`}>
                          <td>{formatDate(row.start_date)}</td>
                          <td className="cell-number">{formatMoney(moneyValue(row.gmv))}</td>
                          <td className="cell-number">{formatNumber(row.orders)}</td>
                          <td className="cell-number">{formatNumber(row.units_sold)}</td>
                          <td className="cell-number">{formatNumber(row.buyers)}</td>
                          <td className="cell-number">{formatNumber(row.product_impressions)}</td>
                          <td className="cell-number">{formatNumber(row.product_page_views)}</td>
                          <td className="cell-number">{formatMoney(moneyValue(row.refunds))}</td>
                          <td className="cell-number">{formatOptionalNumber(row.cancellations_and_returns)}</td>
                        </tr>
                      ))}
                      {!analyticsLoading && !intervals.length ? (
                        <tr>
                          <td colSpan={9}>
                            <div className="empty-state empty-state--compact table-empty-state">
                              {t('shopAnalytics.noData')}
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
                <div className="shop-analytics__daily-cards">
                  {analyticsLoading ? (
                    <div className="empty-state empty-state--compact">
                      <span className="loading-dot" />
                      {t('shopAnalytics.loadingAnalytics')}
                    </div>
                  ) : null}
                  {intervals.map((row, index) => (
                    <article key={`mobile-${row.start_date}-${index}`}>
                      <div>
                        <strong>{formatDate(row.start_date)}</strong>
                        <span>{formatMoney(moneyValue(row.gmv))}</span>
                      </div>
                      <dl>
                        <div><dt>{t('shopAnalytics.orders')}</dt><dd>{formatNumber(row.orders)}</dd></div>
                        <div><dt>{t('shopAnalytics.unitsSold')}</dt><dd>{formatNumber(row.units_sold)}</dd></div>
                        <div><dt>{t('shopAnalytics.buyers')}</dt><dd>{formatNumber(row.buyers)}</dd></div>
                        <div><dt>{t('shopAnalytics.pageViews')}</dt><dd>{formatNumber(row.product_page_views)}</dd></div>
                        <div><dt>{t('shopAnalytics.impressions')}</dt><dd>{formatNumber(row.product_impressions)}</dd></div>
                        <div><dt>{t('shopAnalytics.refunds')}</dt><dd>{formatMoney(moneyValue(row.refunds))}</dd></div>
                        <div><dt>{t('shopAnalytics.cancellationsReturns')}</dt><dd>{formatOptionalNumber(row.cancellations_and_returns)}</dd></div>
                      </dl>
                    </article>
                  ))}
                  {!analyticsLoading && !intervals.length ? (
                    <div className="empty-state empty-state--compact">{t('shopAnalytics.noData')}</div>
                  ) : null}
                </div>
              </section>
            </>
          ) : null}
        </div>
      ) : (
        <div
          id="shop-connections-panel"
          className="shop-analytics__tab-panel"
          role="tabpanel"
          aria-labelledby="shop-connections-tab"
        >
          <section className="section-card shop-analytics__connections-card" aria-labelledby="shop-connections-title">
            <div className="section-card__header">
              <div>
                <h2 className="section-card__title" id="shop-connections-title">{t('shopAnalytics.connections')}</h2>
                <p className="section-card__meta">{t('shopAnalytics.connectionsMeta')}</p>
              </div>
            </div>
            {loading ? (
              <div className="empty-state">
                <span className="loading-dot" />
                {t('shopAnalytics.loadingConnections')}
              </div>
            ) : (
              <div className="shop-analytics__connections">
                {connections.map((authorization) => {
                  const scopes = scopesOf(authorization);
                  const expired = Boolean(
                    authorization.refresh_token_expires_at
                      && new Date(authorization.refresh_token_expires_at).getTime() <= Date.now(),
                  );
                  const missingScope = !scopes.includes(REQUIRED_SCOPE);
                  const authorizationShops = Array.isArray(authorization.shops) ? authorization.shops : [];
                  return (
                    <article className="shop-analytics__connection" key={authorization.id}>
                      <div className="shop-analytics__connection-head">
                        <div className="shop-analytics__connection-identity">
                          <span className="shop-analytics__shop-mark" aria-hidden="true">
                            <AnalyticsIcon name="shop" />
                          </span>
                          <div>
                            <strong>{authorizationShops.map((shop) => shop.name).join(', ') || t('shopAnalytics.shopConnection')}</strong>
                            <span>{t('shopAnalytics.connectedAt')}: {formatDateTime(authorization.connected_at)}</span>
                          </div>
                        </div>
                        <span className={`chip ${expired || missingScope ? 'chip--amber' : 'chip--positive'}`}>
                          {expired
                            ? t('shopAnalytics.tokenExpired')
                            : missingScope
                              ? t('shopAnalytics.missingScope')
                              : t('shopAnalytics.connected')}
                        </span>
                      </div>
                      <div className="shop-analytics__connection-summary">
                        <div>
                          <span>{t('shopAnalytics.connectedShops')}</span>
                          <strong>{formatNumber(authorizationShops.length)}</strong>
                        </div>
                        <div>
                          <span>{t('shopAnalytics.permissions')}</span>
                          <strong>{formatNumber(scopes.length)}</strong>
                        </div>
                      </div>
                      <div className="shop-analytics__scope-list">
                        {scopes.map((scope) => (
                          <span className={`chip ${scope === REQUIRED_SCOPE ? 'chip--positive' : ''}`} key={scope}>
                            {scope}
                          </span>
                        ))}
                        {missingScope ? (
                          <span className="chip chip--amber">{t('shopAnalytics.missing')}: {REQUIRED_SCOPE}</span>
                        ) : null}
                      </div>
                      {authorization.last_sync_error ? (
                        <p className="shop-analytics__connection-error">{authorization.last_sync_error}</p>
                      ) : null}
                      <div className="shop-analytics__connection-actions">
                        {expired || missingScope ? (
                          <button
                            className="button button--small button--ghost"
                            type="button"
                            disabled={connecting || disconnectingId !== null}
                            onClick={startConnect}
                          >
                            {t('shopAnalytics.reconnect')}
                          </button>
                        ) : null}
                        <button
                          className="button button--small button--danger"
                          type="button"
                          disabled={connecting || disconnectingId !== null}
                          onClick={() => disconnect(authorization)}
                        >
                          {String(disconnectingId) === String(authorization.id)
                            ? t('common.loading')
                            : t('shopAnalytics.disconnect')}
                        </button>
                      </div>
                    </article>
                  );
                })}
                {!connections.length ? (
                  <div className="shop-analytics__connections-empty">
                    <div className="shop-analytics__empty-icon" aria-hidden="true">
                      <AnalyticsIcon name="connections" />
                    </div>
                    <strong>{t('shopAnalytics.noConnections')}</strong>
                    <span>{t('shopAnalytics.noConnectionsMeta')}</span>
                  </div>
                ) : null}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
};

export default ShopAnalytics;
