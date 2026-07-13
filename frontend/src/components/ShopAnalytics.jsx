import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
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

const REQUIRED_SCOPE = 'data.shop_analytics.public.read';
const dateOnly = (date) => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, '0'),
  String(date.getDate()).padStart(2, '0'),
].join('-');

const defaultRange = () => {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 30);
  return { startDate: dateOnly(start), endDate: dateOnly(end) };
};

const numericValue = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};
const moneyValue = (value) => numericValue(value?.amount ?? value);
const scopesOf = (authorization) => {
  if (Array.isArray(authorization?.granted_scopes)) return authorization.granted_scopes;
  return String(authorization?.granted_scopes || '').split(',').map((scope) => scope.trim()).filter(Boolean);
};
const sumBy = (rows, key, value = numericValue) => rows.reduce((total, row) => total + value(row?.[key]), 0);
const totalsFor = (rows) => {
  const gmv = sumBy(rows, 'gmv', moneyValue);
  const orders = sumBy(rows, 'orders');
  return {
    gmv,
    orders,
    skuOrders: sumBy(rows, 'sku_orders'),
    unitsSold: sumBy(rows, 'units_sold'),
    buyers: sumBy(rows, 'buyers'),
    impressions: sumBy(rows, 'product_impressions'),
    pageViews: sumBy(rows, 'product_page_views'),
    refunds: sumBy(rows, 'refunds', moneyValue),
    cancellations: sumBy(rows, 'cancellations_and_returns'),
    avgOrderValue: orders ? gmv / orders : 0,
  };
};

const ShopAnalytics = () => {
  const { t, language } = useI18n();
  const locale = language === 'vi' ? 'vi-VN' : 'en-US';
  const initialRange = useMemo(defaultRange, []);
  const [shops, setShops] = useState([]);
  const [connections, setConnections] = useState([]);
  const [selectedShopId, setSelectedShopId] = useState('');
  const [startDate, setStartDate] = useState(initialRange.startDate);
  const [endDate, setEndDate] = useState(initialRange.endDate);
  const [currency, setCurrency] = useState('LOCAL');
  const [chartMetric, setChartMetric] = useState('gmv');
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [disconnectingId, setDisconnectingId] = useState(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);

  const formatNumber = (value) => numericValue(value).toLocaleString(locale, { maximumFractionDigits: 2 });
  const formatDate = (value) => value
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(`${String(value).slice(0, 10)}T00:00:00`))
    : t('common.noData');
  const formatDateTime = (value) => value
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
    : t('common.noData');

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
      if (requestError.name !== 'AbortError') setError(requestError.message || t('shopAnalytics.loadError'));
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
      message: params.get('shop_oauth_message') || t(status === 'success' ? 'shopAnalytics.oauthSuccess' : status === 'warning' ? 'shopAnalytics.oauthWarning' : 'shopAnalytics.oauthError'),
    });
    window.history.replaceState({}, '', window.location.pathname);
  }, [t]);

  useEffect(() => {
    setSelectedShopId((current) => {
      if (shops.some((shop) => String(shop.id) === String(current))) return current;
      return shops[0]?.id ? String(shops[0].id) : '';
    });
  }, [shops]);

  useEffect(() => {
    if (!selectedShopId || !startDate || !endDate || startDate >= endDate) {
      setSnapshot(null);
      return undefined;
    }
    const controller = new AbortController();
    setAnalyticsLoading(true);
    setError('');
    fetchTikTokShopAnalytics(selectedShopId, {
      signal: controller.signal, startDate, endDate, currency,
    }).then((payload) => {
      setSnapshot(payload?.snapshots?.[0] || null);
    }).catch((requestError) => {
      if (requestError.name !== 'AbortError') setError(requestError.message || t('shopAnalytics.loadError'));
    }).finally(() => {
      if (!controller.signal.aborted) setAnalyticsLoading(false);
    });
    return () => controller.abort();
  }, [currency, endDate, selectedShopId, startDate, t]);

  const selectedShop = useMemo(
    () => shops.find((shop) => String(shop.id) === String(selectedShopId)) || null,
    [selectedShopId, shops],
  );
  const intervals = useMemo(() => snapshot?.metrics?.intervals || [], [snapshot]);
  const comparisonIntervals = useMemo(() => snapshot?.metrics?.comparison_intervals || [], [snapshot]);
  const totals = useMemo(() => totalsFor(intervals), [intervals]);
  const comparisonTotals = useMemo(() => totalsFor(comparisonIntervals), [comparisonIntervals]);
  const displayCurrency = intervals.find((row) => row?.gmv?.currency)?.gmv?.currency
    || (currency === 'USD' ? 'USD' : 'VND');
  const formatMoney = (value) => {
    try {
      return new Intl.NumberFormat(locale, {
        style: 'currency', currency: displayCurrency, maximumFractionDigits: displayCurrency === 'VND' ? 0 : 2,
      }).format(numericValue(value));
    } catch {
      return `${formatNumber(value)} ${displayCurrency}`;
    }
  };
  const changeFrom = (current, previous) => {
    if (!previous) return null;
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
    intervals.forEach((row) => (row.gmv_breakdowns || []).forEach((item) => {
      values.set(item.type || t('common.unknown'), (values.get(item.type || t('common.unknown')) || 0) + moneyValue(item));
    }));
    return [...values.entries()].map(([type, amount]) => ({ type, amount })).sort((a, b) => b.amount - a.amount);
  }, [intervals, t]);

  const startConnect = async () => {
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

  const syncAnalytics = async () => {
    if (!selectedShopId || !startDate || !endDate || startDate >= endDate) {
      setToast({ type: 'error', message: t('shopAnalytics.invalidRange') });
      return;
    }
    try {
      setSyncing(true);
      setError('');
      const payload = await syncTikTokShopAnalytics(selectedShopId, {
        start_date: startDate, end_date: endDate, currency,
      });
      setSnapshot(payload?.snapshot || null);
      if (payload?.shop) setShops((items) => items.map((shop) => String(shop.id) === String(payload.shop.id) ? { ...shop, ...payload.shop } : shop));
      setToast({ type: 'success', message: t('shopAnalytics.syncSuccess') });
    } catch (requestError) {
      setToast({ type: 'error', message: requestError.message || t('shopAnalytics.syncError') });
      await loadInventory().catch(() => {});
    } finally {
      setSyncing(false);
    }
  };

  const disconnect = async (authorization) => {
    if (!window.confirm(t('shopAnalytics.disconnectConfirm'))) return;
    try {
      setDisconnectingId(authorization.id);
      await disconnectTikTokShopAuthorization(authorization.id);
      setSnapshot(null);
      await loadInventory();
      setToast({ type: 'success', message: t('shopAnalytics.disconnectSuccess') });
    } catch (requestError) {
      setToast({ type: 'error', message: requestError.message || t('shopAnalytics.disconnectError') });
    } finally {
      setDisconnectingId(null);
    }
  };

  const kpis = [
    { key: 'gmv', value: formatMoney(totals.gmv), change: changeFrom(totals.gmv, comparisonTotals.gmv) },
    { key: 'orders', value: formatNumber(totals.orders), change: changeFrom(totals.orders, comparisonTotals.orders) },
    { key: 'unitsSold', value: formatNumber(totals.unitsSold), change: changeFrom(totals.unitsSold, comparisonTotals.unitsSold) },
    { key: 'buyers', value: formatNumber(totals.buyers), change: changeFrom(totals.buyers, comparisonTotals.buyers) },
    { key: 'avgOrderValue', value: formatMoney(totals.avgOrderValue), change: changeFrom(totals.avgOrderValue, comparisonTotals.avgOrderValue) },
    { key: 'refunds', value: formatMoney(totals.refunds), change: changeFrom(totals.refunds, comparisonTotals.refunds) },
  ];
  const chartLabel = t(`shopAnalytics.${chartMetric}`);

  return (
    <div className="page shop-analytics">
      <section className="page__hero">
        <div className="page__hero-row page__hero-row--spread">
          <div>
            <h1 className="page__title">{t('shopAnalytics.heroTitle')}</h1>
            <p className="page__subtitle">{t('shopAnalytics.heroSubtitle')}</p>
          </div>
          <div className="page__hero-actions">
            <button className="button button--ghost" type="button" disabled={connecting} onClick={startConnect}>
              {connecting ? t('header.connecting') : t(shops.length ? 'shopAnalytics.connectAnother' : 'shopAnalytics.connect')}
            </button>
            <button className="button" type="button" disabled={!selectedShop || syncing} onClick={syncAnalytics}>
              {syncing ? t('shopAnalytics.syncing') : t('shopAnalytics.sync')}
            </button>
          </div>
        </div>
      </section>

      {toast ? <div className={`koc-toast koc-toast--${toast.type}`} role={toast.type === 'error' ? 'alert' : 'status'} aria-live="polite"><span>{toast.message}</span><button className="koc-toast__close" type="button" aria-label={t('common.close')} onClick={() => setToast(null)}>×</button></div> : null}
      {error ? <section className="section-card empty-state empty-state--compact" role="alert">{error}</section> : null}

      <section className="section-card shop-analytics__filters" aria-labelledby="shop-analytics-filters-title">
        <div className="section-card__header section-card__header--compact">
          <div><h2 className="section-card__title" id="shop-analytics-filters-title">{t('shopAnalytics.reportSettings')}</h2><p className="section-card__meta">{t('shopAnalytics.exclusiveEndHint')}</p></div>
        </div>
        <div className="shop-analytics__filter-grid">
          <div className="field"><label htmlFor="analytics-shop">{t('shopAnalytics.shop')}</label><select id="analytics-shop" value={selectedShopId} disabled={loading || !shops.length} onChange={(event) => setSelectedShopId(event.target.value)}><option value="">{loading ? t('common.loading') : t('shopAnalytics.selectShop')}</option>{shops.map((shop) => <option value={shop.id} key={shop.id}>{shop.name} · {shop.region || t('common.unknown')}</option>)}</select></div>
          <div className="field"><label htmlFor="analytics-start-date">{t('shopAnalytics.startDate')}</label><input id="analytics-start-date" type="date" value={startDate} max={endDate || undefined} onChange={(event) => setStartDate(event.target.value)} /></div>
          <div className="field"><label htmlFor="analytics-end-date">{t('shopAnalytics.endDate')}</label><input id="analytics-end-date" type="date" value={endDate} min={startDate || undefined} onChange={(event) => setEndDate(event.target.value)} /></div>
          <div className="field"><label htmlFor="analytics-currency">{t('shopAnalytics.currency')}</label><select id="analytics-currency" value={currency} onChange={(event) => setCurrency(event.target.value)}><option value="LOCAL">{t('shopAnalytics.localCurrency')}</option><option value="USD">USD</option></select></div>
        </div>
        {selectedShop ? <div className="shop-analytics__shop-meta"><strong>{selectedShop.name}</strong><span>{t('shopAnalytics.region')}: {selectedShop.region || t('common.unknown')}</span><span>{t('shopAnalytics.shopCode')}: {selectedShop.code || selectedShop.platform_shop_id}</span><span className={`chip ${selectedShop.last_sync_status === 'failed' ? 'creator-status--expired' : 'chip--positive'}`}>{selectedShop.last_sync_status === 'failed' ? t('shopAnalytics.syncFailed') : t('shopAnalytics.connected')}</span></div> : null}
      </section>

      {!loading && !shops.length ? <section className="section-card shop-analytics__empty"><div className="shop-analytics__empty-icon" aria-hidden="true">▣</div><h2>{t('shopAnalytics.noShops')}</h2><p>{t('shopAnalytics.noShopsMeta')}</p><button className="button" type="button" disabled={connecting} onClick={startConnect}>{t('shopAnalytics.connect')}</button></section> : null}

      {selectedShop ? <>
        <section className="page__stats shop-analytics__stats" aria-label={t('shopAnalytics.kpiTitle')}>
          {kpis.map((kpi) => <article className="stat-card" key={kpi.key}><p className="stat-card__label">{t(`shopAnalytics.${kpi.key}`)}</p><p className="stat-card__value">{analyticsLoading ? '…' : kpi.value}</p>{kpi.change !== null ? <span className={`shop-analytics__change ${kpi.change >= 0 ? 'is-positive' : 'is-negative'}`}>{kpi.change >= 0 ? '↑' : '↓'} {Math.abs(kpi.change).toLocaleString(locale, { maximumFractionDigits: 1 })}% {t('shopAnalytics.vsPrevious')}</span> : null}</article>)}
        </section>

        <section className="shop-analytics__chart-grid">
          <article className="section-card">
            <div className="section-card__header"><div><h2 className="section-card__title">{t('shopAnalytics.trend')}</h2><p className="section-card__meta">{t('shopAnalytics.trendMeta')}</p></div><div className="field chart-metric-field"><label htmlFor="shop-chart-metric">{t('shopAnalytics.metric')}</label><select id="shop-chart-metric" value={chartMetric} onChange={(event) => setChartMetric(event.target.value)}><option value="gmv">{t('shopAnalytics.gmv')}</option><option value="orders">{t('shopAnalytics.orders')}</option><option value="unitsSold">{t('shopAnalytics.unitsSold')}</option><option value="buyers">{t('shopAnalytics.buyers')}</option></select></div></div>
            {analyticsLoading ? <div className="empty-state"><span className="loading-dot" />{t('shopAnalytics.loadingAnalytics')}</div> : chartData.length ? <div className="shop-analytics__chart" role="img" aria-label={`${t('shopAnalytics.trend')}: ${chartLabel}`}><ResponsiveContainer width="100%" height="100%"><LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 4 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="date" tickFormatter={(value) => new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(new Date(`${value}T00:00:00`))} /><YAxis width={70} tickFormatter={(value) => chartMetric === 'gmv' ? Intl.NumberFormat(locale, { notation: 'compact' }).format(value) : Intl.NumberFormat(locale, { notation: 'compact' }).format(value)} /><Tooltip labelFormatter={formatDate} formatter={(value) => [chartMetric === 'gmv' ? formatMoney(value) : formatNumber(value), chartLabel]} /><Line type="monotone" dataKey={chartMetric} stroke="var(--color-accent)" strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 5 }} /></LineChart></ResponsiveContainer></div> : <div className="empty-state"><p>{t('shopAnalytics.noData')}</p><button className="button" type="button" disabled={syncing} onClick={syncAnalytics}>{t('shopAnalytics.syncNow')}</button></div>}
          </article>

          <article className="section-card">
            <div className="section-card__header"><div><h2 className="section-card__title">{t('shopAnalytics.gmvBreakdown')}</h2><p className="section-card__meta">{t('shopAnalytics.gmvBreakdownMeta')}</p></div></div>
            {breakdowns.length ? <div className="shop-analytics__breakdowns">{breakdowns.map((item) => <div className="shop-analytics__breakdown" key={item.type}><span><i aria-hidden="true" />{item.type}</span><strong>{formatMoney(item.amount)}</strong></div>)}</div> : <div className="empty-state empty-state--compact">{t('shopAnalytics.noBreakdown')}</div>}
            <dl className="shop-analytics__summary-list"><div><dt>{t('shopAnalytics.impressions')}</dt><dd>{formatNumber(totals.impressions)}</dd></div><div><dt>{t('shopAnalytics.pageViews')}</dt><dd>{formatNumber(totals.pageViews)}</dd></div><div><dt>{t('shopAnalytics.cancellationsReturns')}</dt><dd>{formatNumber(totals.cancellations)}</dd></div></dl>
          </article>
        </section>

        <section className="section-card">
          <div className="section-card__header"><div><h2 className="section-card__title">{t('shopAnalytics.dailyValues')}</h2><p className="section-card__meta">{snapshot ? `${t('shopAnalytics.lastSync')}: ${formatDateTime(snapshot.synced_at)} · ${t('shopAnalytics.latestDate')}: ${formatDate(snapshot.latest_available_date)}` : t('shopAnalytics.noData')}</p></div></div>
          <div className="table-wrap"><table className="data-table shop-analytics__table"><thead><tr><th>{t('shopAnalytics.date')}</th><th className="cell-number">{t('shopAnalytics.gmv')}</th><th className="cell-number">{t('shopAnalytics.orders')}</th><th className="cell-number">{t('shopAnalytics.unitsSold')}</th><th className="cell-number">{t('shopAnalytics.buyers')}</th><th className="cell-number">{t('shopAnalytics.impressions')}</th><th className="cell-number">{t('shopAnalytics.pageViews')}</th><th className="cell-number">{t('shopAnalytics.refunds')}</th><th className="cell-number">{t('shopAnalytics.cancellationsReturns')}</th></tr></thead><tbody>{intervals.map((row, index) => <tr key={`${row.start_date}-${index}`}><td>{formatDate(row.start_date)}</td><td className="cell-number">{formatMoney(moneyValue(row.gmv))}</td><td className="cell-number">{formatNumber(row.orders)}</td><td className="cell-number">{formatNumber(row.units_sold)}</td><td className="cell-number">{formatNumber(row.buyers)}</td><td className="cell-number">{formatNumber(row.product_impressions)}</td><td className="cell-number">{formatNumber(row.product_page_views)}</td><td className="cell-number">{formatMoney(moneyValue(row.refunds))}</td><td className="cell-number">{formatNumber(row.cancellations_and_returns)}</td></tr>)}{!analyticsLoading && !intervals.length ? <tr><td colSpan={9}><div className="empty-state empty-state--compact table-empty-state">{t('shopAnalytics.noData')}</div></td></tr> : null}</tbody></table></div>
          {snapshot?.request_id ? <p className="shop-analytics__request-id">{t('shopAnalytics.requestId')}: {snapshot.request_id}</p> : null}
        </section>
      </> : null}

      <section className="section-card" aria-labelledby="shop-connections-title">
        <div className="section-card__header"><div><h2 className="section-card__title" id="shop-connections-title">{t('shopAnalytics.connections')}</h2><p className="section-card__meta">{t('shopAnalytics.connectionsMeta')}</p></div></div>
        <div className="shop-analytics__connections">
          {connections.map((authorization) => {
            const scopes = scopesOf(authorization);
            const expired = authorization.refresh_token_expires_at && new Date(authorization.refresh_token_expires_at).getTime() <= Date.now();
            const missingScope = !scopes.includes(REQUIRED_SCOPE);
            return <article className="shop-analytics__connection" key={authorization.id}><div className="shop-analytics__connection-head"><div><strong>{authorization.shops?.map((shop) => shop.name).join(', ') || t('shopAnalytics.shopConnection')}</strong><span>{t('shopAnalytics.connectedAt')}: {formatDateTime(authorization.connected_at)}</span></div><span className={`chip ${expired ? 'creator-status--expired' : missingScope ? 'chip--amber' : 'chip--positive'}`}>{expired ? t('shopAnalytics.tokenExpired') : missingScope ? t('shopAnalytics.missingScope') : t('shopAnalytics.connected')}</span></div><div className="chip-row">{scopes.map((scope) => <span className={`chip ${scope === REQUIRED_SCOPE ? 'chip--positive' : ''}`} key={scope}>{scope}</span>)}{missingScope ? <span className="chip chip--amber">{t('shopAnalytics.missing')}: {REQUIRED_SCOPE}</span> : null}</div>{authorization.last_sync_error ? <p className="shop-analytics__connection-error">{authorization.last_sync_error}</p> : null}<div className="actions actions--inline"><button className="button button--small button--danger" type="button" disabled={String(disconnectingId) === String(authorization.id)} onClick={() => disconnect(authorization)}>{String(disconnectingId) === String(authorization.id) ? t('common.loading') : t('shopAnalytics.disconnect')}</button></div></article>;
          })}
          {!loading && !connections.length ? <div className="empty-state empty-state--compact">{t('shopAnalytics.noConnections')}</div> : null}
        </div>
      </section>
    </div>
  );
};

export default ShopAnalytics;
