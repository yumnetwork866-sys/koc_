import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import {
  fetchTikTokSellerAffiliateOrders,
  fetchTikTokSellerAffiliateCreators,
  fetchTikTokSellerCreatorContentDetails,
  fetchTikTokSellerOpenCollaborations,
  fetchTikTokSellerOpenCollaborationSettings,
  fetchTikTokSellerTargetCollaborations,
  fetchTikTokCreatorPerformance,
  fetchTikTokShops,
  startTikTokShopOauth,
  syncTikTokCreatorPerformance,
} from '../lib/api';
import { useI18n } from '../lib/language';
import ShopDropdown from './ShopDropdown';

const REQUIRED_SCOPE = 'seller.affiliate_collaboration.read';
const MARKETPLACE_SCOPE = 'seller.creator_marketplace.read';
const PAGE_SIZE = 20;
const BREAKDOWN_COLORS = ['#00a89d', '#2563eb', '#f59e0b', '#e11d48', '#7c3aed', '#0f766e', '#64748b', '#db2777'];
const CreatorAvatar = ({ src, name }) => {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (!src || failed) {
    return <span className="creator-identity__avatar creator-identity__avatar--fallback">{String(name || 'C').charAt(0)}</span>;
  }
  return <img className="creator-identity__avatar" src={src} alt="" loading="lazy" onError={() => setFailed(true)} />;
};
const yesterday = () => {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
};

const SellerAffiliatePanel = () => {
  const { t, language } = useI18n();
  const locale = language === 'vi' ? 'vi-VN' : 'en-US';
  const [shops, setShops] = useState([]);
  const [shopId, setShopId] = useState('');
  const [section, setSection] = useState('open');
  const [keyword, setKeyword] = useState('');
  const [submittedKeyword, setSubmittedKeyword] = useState('');
  const [status, setStatus] = useState('');
  const [data, setData] = useState({});
  const [settings, setSettings] = useState(null);
  const [pageTokens, setPageTokens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedCreatorApplication, setSelectedCreatorApplication] = useState(null);
  const [creatorContent, setCreatorContent] = useState(null);
  const [creatorDetailLoading, setCreatorDetailLoading] = useState(false);
  const [creatorBreakdownMetric, setCreatorBreakdownMetric] = useState('gmv');
  const [performanceWindow, setPerformanceWindow] = useState('PAST_7_DAYS');
  const [performanceEndDay, setPerformanceEndDay] = useState(yesterday);
  const [performanceSyncing, setPerformanceSyncing] = useState(false);

  const selectedShop = useMemo(() => shops.find((shop) => String(shop.id) === String(shopId)), [shopId, shops]);
  const scopes = Array.isArray(selectedShop?.authorization?.granted_scopes) ? selectedShop.authorization.granted_scopes : [];
  const hasScope = scopes.includes(REQUIRED_SCOPE);
  const hasMarketplaceScope = scopes.includes(MARKETPLACE_SCOPE);
  const currentPageToken = pageTokens.at(-1) || '';

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetchTikTokShops(controller.signal)
      .then((items) => {
        setShops(items);
        setShopId((current) => current || (items[0]?.id ? String(items[0].id) : ''));
      })
      .catch((err) => { if (err.name !== 'AbortError') setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  const load = useCallback(async (signal) => {
    if (!shopId || !hasScope) { setData({}); setSettings(null); return; }
    setLoading(true);
    setError('');
    try {
      const filters = { signal, pageSize: PAGE_SIZE, pageToken: currentPageToken, keyword: submittedKeyword };
      let result;
      if (section === 'open') {
        [result] = await Promise.all([
          fetchTikTokSellerOpenCollaborations(shopId, filters),
          fetchTikTokSellerOpenCollaborationSettings(shopId, signal).then(setSettings).catch(() => setSettings(null)),
        ]);
      } else if (section === 'target') {
        result = await fetchTikTokSellerTargetCollaborations(shopId, { ...filters, status });
      } else if (section === 'performance') {
        result = await fetchTikTokCreatorPerformance(shopId, {
          ...filters,
          windowType: performanceWindow,
          endDay: performanceEndDay,
          planType: 'ALL',
          page: pageTokens.length + 1,
        });
      } else if (section === 'creators') {
        result = await fetchTikTokSellerAffiliateCreators(shopId, { ...filters, status });
      } else {
        result = await fetchTikTokSellerAffiliateOrders(shopId, { ...filters, programId: submittedKeyword });
      }
      setData(result || {});
    } catch (err) {
      if (err.name !== 'AbortError') setError(err.message || t('sellerAffiliate.loadError'));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [currentPageToken, hasScope, pageTokens.length, performanceEndDay, performanceWindow, section, shopId, status, submittedKeyword, t]);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  useEffect(() => {
    if (section !== 'performance' || data.export?.status !== 'PROCESSING' || !shopId) return undefined;
    const controller = new AbortController();
    const interval = window.setInterval(() => {
      fetchTikTokCreatorPerformance(shopId, {
        signal: controller.signal,
        windowType: performanceWindow,
        endDay: performanceEndDay,
        planType: 'ALL',
        page: pageTokens.length + 1,
        pageSize: PAGE_SIZE,
        keyword: submittedKeyword,
      }).then(setData).catch((err) => {
        if (err.name !== 'AbortError') setError(err.message);
      });
    }, 5000);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [data.export?.status, pageTokens.length, performanceEndDay, performanceWindow, section, shopId, submittedKeyword]);

  const rows = section === 'open'
    ? (data.open_collaborations || [])
    : section === 'target'
      ? (data.target_collaborations || [])
      : section === 'creators'
        ? (data.sample_applications || [])
        : section === 'performance'
          ? (data.creators || [])
        : (data.orders || data.affiliate_orders || []);
  const creatorSummaries = useMemo(() => {
    const grouped = new Map();
    for (const application of data.sample_applications || []) {
      const creator = application.creator || {};
      const key = creator.user_id || creator.username || application.id;
      const current = grouped.get(key) || {
        key,
        name: creator.nickname || creator.username || key,
        gmv: 0,
        currency: creator.gmv?.currency || 'USD',
        samplesShipped: 0,
        postedContent: false,
        hasSales: false,
      };
      current.gmv = Math.max(current.gmv, Number(creator.gmv?.amount || 0));
      current.currency = creator.gmv?.currency || current.currency;
      current.samplesShipped += ['SHIPPED', 'CONTENT_PENDING', 'COMPLETED', 'OPS_COMPLETED'].includes(application.status) ? 1 : 0;
      current.postedContent ||= Number(creator.content_count || 0) > 0;
      current.hasSales ||= Number(creator.gmv?.amount || 0) > 0;
      grouped.set(key, current);
    }
    return [...grouped.values()];
  }, [data.sample_applications]);
  const creatorBreakdown = useMemo(() => {
    if (creatorBreakdownMetric === 'gmv') {
      return creatorSummaries.filter((creator) => creator.gmv > 0).map((creator) => ({ name: creator.name, value: creator.gmv }));
    }
    if (creatorBreakdownMetric === 'samplesShipped') {
      return creatorSummaries.filter((creator) => creator.samplesShipped > 0).map((creator) => ({ name: creator.name, value: creator.samplesShipped }));
    }
    const positive = creatorSummaries.filter((creator) => (
      creatorBreakdownMetric === 'postedContent' ? creator.postedContent : creator.hasSales
    )).length;
    return [
      { name: t(creatorBreakdownMetric === 'postedContent' ? 'sellerAffiliate.posted' : 'sellerAffiliate.withSales'), value: positive },
      { name: t(creatorBreakdownMetric === 'postedContent' ? 'sellerAffiliate.notPosted' : 'sellerAffiliate.withoutSales'), value: creatorSummaries.length - positive },
    ].filter((item) => item.value > 0);
  }, [creatorBreakdownMetric, creatorSummaries, t]);
  const creatorBreakdownTotal = creatorBreakdown.reduce((total, item) => total + item.value, 0);
  const creatorBreakdownCurrency = creatorSummaries.find((creator) => creator.currency)?.currency || 'USD';
  const performanceBreakdown = section === 'performance'
    ? rows.slice(0, 10).filter((creator) => Number(creator.affiliate_gmv) > 0)
      .map((creator) => ({ name: creator.nickname || creator.username, value: Number(creator.affiliate_gmv) }))
    : [];
  const performanceBreakdownTotal = performanceBreakdown.reduce((total, item) => total + item.value, 0);
  const nextPageToken = section === 'performance'
    ? ((data.page || 1) * (data.page_size || PAGE_SIZE) < (data.total_count || 0) ? 'next' : '')
    : data.next_page_token || '';
  const formatNumber = (value) => Number(value || 0).toLocaleString(locale);
  const formatRate = (value) => value === undefined || value === null ? '—' : `${(Number(value) / 100).toLocaleString(locale, { maximumFractionDigits: 2 })}%`;
  const formatTime = (value) => value ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(Number(value) * 1000)) : '—';
  const formatMoney = (money) => {
    if (!money?.amount) return '—';
    try {
      return new Intl.NumberFormat(locale, { style: 'currency', currency: money.currency || 'USD', maximumFractionDigits: 2 }).format(Number(money.amount));
    } catch {
      return `${Number(money.amount).toLocaleString(locale)} ${money.currency || ''}`.trim();
    }
  };
  const connectShop = async () => { const result = await startTikTokShopOauth('/manage/koc-performance'); window.location.assign(result.authorizeUrl); };
  const changeSection = (value) => { setSection(value); setStatus(''); setPageTokens([]); setData({}); setError(''); };
  const submitSearch = (event) => { event.preventDefault(); setPageTokens([]); setSubmittedKeyword(keyword.trim()); };
  const openCreatorDetail = async (application) => {
    setSelectedCreatorApplication(application);
    setCreatorContent(null);
    const productId = application.product?.id;
    if (!productId) return;
    try {
      setCreatorDetailLoading(true);
      const payload = await fetchTikTokSellerCreatorContentDetails(shopId, { productId });
      const details = payload.creator_content_details || [];
      const username = String(application.creator?.username || '').replace(/^@/, '');
      setCreatorContent(details.find((item) => String(item.creator_profile?.username || '').replace(/^@/, '') === username) || details[0] || null);
    } catch {
      setCreatorContent(null);
    } finally {
      setCreatorDetailLoading(false);
    }
  };
  const closeCreatorDetail = () => { setSelectedCreatorApplication(null); setCreatorContent(null); };
  const syncPerformance = async () => {
    try {
      setPerformanceSyncing(true);
      setError('');
      const result = await syncTikTokCreatorPerformance(shopId, {
        windowType: performanceWindow, endDay: performanceEndDay, planType: 'ALL',
      });
      setData((current) => ({ ...current, export: result.export }));
      if (result.export?.status === 'SUCCEEDED') await load();
    } catch (err) {
      setError(err.message || t('sellerAffiliate.performanceSyncError'));
    } finally {
      setPerformanceSyncing(false);
    }
  };

  return (
    <div id="seller-affiliate-panel" role="tabpanel" aria-labelledby="seller-affiliate-tab" className="koc-tab-panel seller-affiliate">
      <section className="section-card seller-affiliate__controls">
        <div className="section-card__header">
          <div><h2 className="section-card__title">{t('sellerAffiliate.title')}</h2><p className="section-card__meta">{t('sellerAffiliate.meta')}</p></div>
        </div>
        <div className="seller-affiliate__filter-grid">
          <div className="field"><label htmlFor="affiliate-shop">{t('sellerAffiliate.shop')}</label><ShopDropdown id="affiliate-shop" shops={shops} value={shopId} onChange={(nextShopId) => { setShopId(nextShopId); setPageTokens([]); }} disabled={loading || !shops.length} placeholder={t('sellerAffiliate.selectShop')} unknownLabel={t('common.unknown')} /></div>
          <form className="seller-affiliate__search" onSubmit={submitSearch}><div className="field"><label htmlFor="affiliate-search">{t(section === 'orders' ? 'sellerAffiliate.programId' : 'common.search')}</label><input id="affiliate-search" value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder={t(`sellerAffiliate.${section}Search`)} /></div><button className="button button--ghost" type="submit">{t('common.search')}</button></form>
          {section === 'target' || section === 'creators' ? <div className="field"><label htmlFor="affiliate-status">{t('sellerAffiliate.status')}</label><select id="affiliate-status" value={status} onChange={(event) => { setStatus(event.target.value); setPageTokens([]); }}><option value="">{t('sellerAffiliate.allStatuses')}</option>{(section === 'target' ? ['ONGOING', 'EXPIRING', 'VALID', 'CANCELING', 'COMPLETED'] : ['PENDING', 'AWAITING_SHIPMENT', 'SHIPPED', 'CONTENT_PENDING', 'COMPLETED', 'REJECT_CANCELLED']).map((value) => <option value={value} key={value}>{value}</option>)}</select></div> : null}
          {section === 'performance' ? <><div className="field"><label htmlFor="creator-performance-window">{t('sellerAffiliate.performanceWindow')}</label><select id="creator-performance-window" value={performanceWindow} onChange={(event) => { setPerformanceWindow(event.target.value); setPageTokens([]); }}><option value="PAST_24H">{t('sellerAffiliate.past24h')}</option><option value="PAST_7_DAYS">{t('sellerAffiliate.past7Days')}</option><option value="PAST_30_DAYS">{t('sellerAffiliate.past30Days')}</option></select></div><div className="field"><label htmlFor="creator-performance-end-day">{t('sellerAffiliate.endDay')}</label><input id="creator-performance-end-day" type="date" value={performanceEndDay} max={yesterday()} onChange={(event) => { setPerformanceEndDay(event.target.value); setPageTokens([]); }} /></div></> : null}
        </div>
      </section>

      {!shops.length && !loading ? <section className="section-card empty-state"><h2>{t('sellerAffiliate.noShop')}</h2><p>{t('sellerAffiliate.noShopMeta')}</p></section> : null}
      {selectedShop && !hasScope ? <section className="section-card seller-affiliate__permission" role="alert"><div><strong>{t('sellerAffiliate.missingScope')}</strong><p>{t('sellerAffiliate.missingScopeMeta')}</p><code>{REQUIRED_SCOPE}</code></div><button className="button" type="button" onClick={connectShop}>{t('sellerAffiliate.reauthorize')}</button></section> : null}
      {error ? <section className="section-card empty-state empty-state--compact" role="alert">{error}</section> : null}

      {selectedShop && hasScope ? <>
        <div className="seller-affiliate__subtabs" role="tablist" aria-label={t('sellerAffiliate.sections')}>
          {['open', 'target', 'performance', 'creators', 'orders'].map((value) => <button className={section === value ? 'is-active' : ''} type="button" role="tab" aria-selected={section === value} onClick={() => changeSection(value)} key={value}>{t(`sellerAffiliate.${value}Tab`)}</button>)}
        </div>
        {section === 'performance' ? <section className="section-card"><div className="section-card__header"><div><h2 className="section-card__title">{t('sellerAffiliate.performanceTitle')}</h2><p className="section-card__meta">{data.export?.status === 'SUCCEEDED' ? `${data.export.start_date} – ${data.export.end_date}` : t(`sellerAffiliate.performanceStatus_${data.export?.status || 'EMPTY'}`)}</p></div><button className="button" type="button" disabled={performanceSyncing || data.export?.status === 'PROCESSING'} onClick={syncPerformance}>{performanceSyncing ? t('common.loading') : t('sellerAffiliate.generateReport')}</button></div>{data.totals ? <section className="seller-affiliate__summary"><article className="stat-card"><p className="stat-card__label">{t('sellerAffiliate.creatorGmv')}</p><p className="stat-card__value seller-affiliate__setting-value">{formatMoney({ amount: data.totals.affiliate_gmv, currency: rows[0]?.currency || 'MYR' })}</p></article><article className="stat-card"><p className="stat-card__label">{t('sellerAffiliate.affiliateOrders')}</p><p className="stat-card__value seller-affiliate__setting-value">{formatNumber(data.totals.affiliate_orders)}</p></article><article className="stat-card"><p className="stat-card__label">{t('sellerAffiliate.itemsSold')}</p><p className="stat-card__value seller-affiliate__setting-value">{formatNumber(data.totals.items_sold)}</p></article><article className="stat-card"><p className="stat-card__label">{t('sellerAffiliate.productImpressions')}</p><p className="stat-card__value seller-affiliate__setting-value">{formatNumber(data.totals.product_impressions)}</p></article></section> : null}</section> : null}
        {section === 'performance' && !hasMarketplaceScope ? <section className="section-card empty-state empty-state--compact" role="alert"><strong>{t('sellerAffiliate.missingMarketplaceScope')}</strong><span>{t('sellerAffiliate.missingMarketplaceScopeMeta')}</span></section> : null}
        {section === 'performance' && performanceBreakdown.length ? <section className="section-card seller-creator-breakdown"><div className="section-card__header"><div><h2 className="section-card__title">{t('sellerAffiliate.performanceChartTitle')}</h2><p className="section-card__meta">{t('sellerAffiliate.performanceChartMeta')}</p></div></div><div className="seller-creator-breakdown__body"><div className="seller-creator-breakdown__chart"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={performanceBreakdown} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="82%" paddingAngle={2}>{performanceBreakdown.map((item, index) => <Cell key={item.name} fill={BREAKDOWN_COLORS[index % BREAKDOWN_COLORS.length]} />)}</Pie><Tooltip formatter={(value) => formatMoney({ amount: value, currency: rows[0]?.currency || 'MYR' })} /></PieChart></ResponsiveContainer><div className="seller-creator-breakdown__center"><strong>{formatMoney({ amount: performanceBreakdownTotal, currency: rows[0]?.currency || 'MYR' })}</strong><span>{t('sellerAffiliate.top10Gmv')}</span></div></div><div className="seller-creator-breakdown__legend">{performanceBreakdown.map((item, index) => <div key={item.name}><i style={{ background: BREAKDOWN_COLORS[index % BREAKDOWN_COLORS.length] }} /><span>{item.name}</span><strong>{formatMoney({ amount: item.value, currency: rows[0]?.currency || 'MYR' })}</strong></div>)}</div></div></section> : null}
        {section === 'creators' ? <section className="section-card seller-creator-breakdown"><div className="section-card__header"><div><h2 className="section-card__title">{t('sellerAffiliate.breakdownTitle')}</h2><p className="section-card__meta">{t('sellerAffiliate.breakdownMeta')}</p></div><div className="field seller-creator-breakdown__select"><label htmlFor="creator-breakdown-metric">{t('sellerAffiliate.metric')}</label><select id="creator-breakdown-metric" value={creatorBreakdownMetric} onChange={(event) => setCreatorBreakdownMetric(event.target.value)}><option value="gmv">{t('sellerAffiliate.creatorGmv')}</option><option value="samplesShipped">{t('sellerAffiliate.samplesShipped')}</option><option value="postedContent">{t('sellerAffiliate.creatorsPosted')}</option><option value="withSales">{t('sellerAffiliate.creatorsWithSales')}</option></select></div></div>{creatorBreakdown.length ? <div className="seller-creator-breakdown__body"><div className="seller-creator-breakdown__chart"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={creatorBreakdown} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="82%" paddingAngle={2}>{creatorBreakdown.map((item, index) => <Cell key={item.name} fill={BREAKDOWN_COLORS[index % BREAKDOWN_COLORS.length]} />)}</Pie><Tooltip formatter={(value) => creatorBreakdownMetric === 'gmv' ? formatMoney({ amount: value, currency: creatorBreakdownCurrency }) : formatNumber(value)} /></PieChart></ResponsiveContainer><div className="seller-creator-breakdown__center"><strong>{creatorBreakdownMetric === 'gmv' ? formatMoney({ amount: creatorBreakdownTotal, currency: creatorBreakdownCurrency }) : formatNumber(creatorBreakdownTotal)}</strong><span>{t(`sellerAffiliate.breakdown_${creatorBreakdownMetric}`)}</span></div></div><div className="seller-creator-breakdown__legend">{creatorBreakdown.slice(0, 8).map((item, index) => <div key={item.name}><i style={{ background: BREAKDOWN_COLORS[index % BREAKDOWN_COLORS.length] }} /><span>{item.name}</span><strong>{creatorBreakdownMetric === 'gmv' ? formatMoney({ amount: item.value, currency: creatorBreakdownCurrency }) : formatNumber(item.value)}</strong></div>)}</div></div> : <div className="empty-state">{t('sellerAffiliate.noData')}</div>}</section> : null}
        {section === 'open' && settings ? <section className="seller-affiliate__summary"><article className="stat-card"><p className="stat-card__label">{t('sellerAffiliate.autoAdd')}</p><p className="stat-card__value seller-affiliate__setting-value">{settings.auto_add_product?.enable ? t('common.yes') : t('common.no')}</p></article><article className="stat-card"><p className="stat-card__label">{t('sellerAffiliate.defaultCommission')}</p><p className="stat-card__value seller-affiliate__setting-value">{formatRate(settings.auto_add_product?.commission_rate)}</p></article><article className="stat-card"><p className="stat-card__label">{t('sellerAffiliate.total')}</p><p className="stat-card__value seller-affiliate__setting-value">{formatNumber(data.total_count)}</p></article></section> : null}
        <section className="section-card">
          <div className="section-card__header"><div><h2 className="section-card__title">{t(`sellerAffiliate.${section}Title`)}</h2><p className="section-card__meta">{t(`sellerAffiliate.${section}Meta`)}</p></div><span className="chip">{formatNumber(data.total_count ?? rows.length)}</span></div>
          <div className="table-wrap"><table className="data-table seller-affiliate__table"><thead><tr>{section === 'open' ? <><th>{t('sellerAffiliate.product')}</th><th>{t('sellerAffiliate.commission')}</th><th>{t('sellerAffiliate.creators')}</th><th>{t('sellerAffiliate.status')}</th></> : section === 'target' ? <><th>{t('sellerAffiliate.invitation')}</th><th>{t('sellerAffiliate.products')}</th><th>{t('sellerAffiliate.creators')}</th><th>{t('sellerAffiliate.validity')}</th><th>{t('sellerAffiliate.status')}</th></> : section === 'performance' ? <><th>{t('sellerAffiliate.creator')}</th><th>{t('sellerAffiliate.creatorGmv')}</th><th>{t('sellerAffiliate.affiliateOrders')}</th><th>{t('sellerAffiliate.itemsSold')}</th><th>{t('sellerAffiliate.productImpressions')}</th><th>{t('sellerAffiliate.refundedGmv')}</th><th>{t('sellerAffiliate.followers')}</th></> : section === 'creators' ? <><th>{t('sellerAffiliate.creator')}</th><th>{t('sellerAffiliate.followers')}</th><th>{t('sellerAffiliate.creatorGmv30')}</th><th>{t('sellerAffiliate.content')}</th><th>{t('sellerAffiliate.fulfillment')}</th><th>{t('sellerAffiliate.status')}</th><th>{t('sellerAffiliate.actions')}</th></> : <><th>{t('sellerAffiliate.order')}</th><th>{t('sellerAffiliate.product')}</th><th>{t('sellerAffiliate.program')}</th><th>{t('sellerAffiliate.createdAt')}</th></>}</tr></thead><tbody>
            {loading ? <tr><td colSpan={7}><div className="empty-state"><span className="loading-dot" />{t('common.loading')}</div></td></tr> : rows.map((row, index) => section === 'open' ? <tr key={row.id || index}><td><div className="seller-affiliate__product">{row.product?.main_image_url ? <img src={row.product.main_image_url} alt="" loading="lazy" /> : null}<div><strong>{row.product?.title || row.product?.id || row.id}</strong><span>{row.product?.id}</span></div></div></td><td>{formatRate(row.current_commission?.rate ?? row.commission_rate)}</td><td>{formatNumber(row.showcase_creator_count)} / {formatNumber(row.content_creator_count)}</td><td><span className="chip">{row.status || '—'}</span></td></tr> : section === 'target' ? <tr key={row.id || index}><td><strong>{row.name || row.id}</strong><span className="row-subtitle">{row.id}</span></td><td>{formatNumber(row.products?.length ?? row.product_count)}</td><td>{formatNumber(row.showcase_creator_count ?? row.creator_inivited_count ?? row.creator_invited_count)} / {formatNumber(row.content_creator_count)}</td><td>{formatTime(row.end_time)}</td><td><span className="chip">{row.status || row.collaboration_status || row.type || '—'}</span></td></tr> : section === 'performance' ? <tr key={row.id || index}><td><div className="creator-identity"><CreatorAvatar src={row.avatar_url} name={row.nickname || row.username} /><span><strong>{row.nickname || row.username}</strong><span className="row-subtitle">@{row.username}</span></span></div></td><td>{formatMoney({ amount: row.affiliate_gmv, currency: row.currency })}</td><td>{formatNumber(row.affiliate_orders)}</td><td>{formatNumber(row.items_sold)}</td><td>{formatNumber(row.product_impressions)}</td><td>{formatMoney({ amount: row.refunded_gmv, currency: row.currency })}</td><td>{formatNumber(row.followers)}</td></tr> : section === 'creators' ? <tr key={row.id || index}><td><div className="creator-identity"><CreatorAvatar src={row.creator?.avatar_url} name={row.creator?.nickname || row.creator?.username} /><span><strong>{row.creator?.nickname || row.creator?.username || '—'}</strong><span className="row-subtitle">{row.creator?.username ? `@${row.creator.username.replace(/^@/, '')}` : row.creator?.user_id}</span></span></div></td><td>{formatNumber(row.creator?.follower_count)}</td><td>{formatMoney(row.creator?.gmv)}</td><td>{formatNumber(row.creator?.content_count)}<span className="row-subtitle">{formatNumber(row.creator?.ec_video_view)} {t('common.views')}</span></td><td>{row.creator?.fulfillment_percentage ? `${row.creator.fulfillment_percentage}%` : row.fulfillment_status || '—'}</td><td><span className="chip">{row.status || '—'}</span></td><td><button className="button button--small button--ghost" type="button" onClick={() => openCreatorDetail(row)}>{t('sellerAffiliate.view')}</button></td></tr> : <tr key={row.order_id || row.id || index}><td><strong>{row.order_id || row.id}</strong></td><td>{row.product_id || row.product?.id || '—'}</td><td>{row.program_id || row.collaboration_id || '—'}</td><td>{formatTime(row.create_time || row.created_time)}</td></tr>)}
            {!loading && !rows.length ? <tr><td colSpan={7}><div className="empty-state">{t('sellerAffiliate.noData')}</div></td></tr> : null}
          </tbody></table></div>
          <div className="pagination"><button className="button button--ghost" type="button" disabled={!pageTokens.length || loading} onClick={() => setPageTokens((tokens) => tokens.slice(0, -1))}>{t('common.previous')}</button><span>{t('sellerAffiliate.page', { page: pageTokens.length + 1 })}</span><button className="button button--ghost" type="button" disabled={!nextPageToken || loading} onClick={() => setPageTokens((tokens) => [...tokens, nextPageToken])}>{t('common.next')}</button></div>
        </section>
      </> : null}
      {selectedCreatorApplication ? <div className="koc-drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeCreatorDetail(); }}><aside className="koc-drawer" role="dialog" aria-modal="true" aria-labelledby="seller-creator-detail-title"><div className="koc-drawer__header"><div><h2 id="seller-creator-detail-title">{selectedCreatorApplication.creator?.nickname || selectedCreatorApplication.creator?.username}</h2><p>{selectedCreatorApplication.creator?.username ? `@${selectedCreatorApplication.creator.username.replace(/^@/, '')}` : selectedCreatorApplication.creator?.user_id}</p></div><button className="button button--ghost" type="button" onClick={closeCreatorDetail} aria-label={t('common.close')}>×</button></div><div className="koc-drawer__body"><section className="drawer-section"><div className="drawer-profile">{selectedCreatorApplication.creator?.avatar_url ? <img src={selectedCreatorApplication.creator.avatar_url} alt="" /> : null}<div><strong>{selectedCreatorApplication.creator?.nickname || selectedCreatorApplication.creator?.username}</strong><span>{formatNumber(selectedCreatorApplication.creator?.follower_count)} {t('sellerAffiliate.followers')}</span></div></div></section><section className="page__stats page__stats--four"><article className="stat-card"><p className="stat-card__label">{t('sellerAffiliate.creatorGmv')}</p><p className="stat-card__value">{formatMoney(selectedCreatorApplication.creator?.gmv)}</p></article><article className="stat-card"><p className="stat-card__label">{t('sellerAffiliate.content')}</p><p className="stat-card__value">{formatNumber(selectedCreatorApplication.creator?.content_count)}</p></article><article className="stat-card"><p className="stat-card__label">{t('common.views')}</p><p className="stat-card__value">{formatNumber(selectedCreatorApplication.creator?.ec_video_view)}</p></article><article className="stat-card"><p className="stat-card__label">{t('sellerAffiliate.fulfillment')}</p><p className="stat-card__value">{selectedCreatorApplication.creator?.fulfillment_percentage ? `${selectedCreatorApplication.creator.fulfillment_percentage}%` : '—'}</p></article></section><section className="drawer-section"><h3>{t('sellerAffiliate.sampleDetail')}</h3><div className="drawer-meta"><span>{t('sellerAffiliate.status')}: <strong>{selectedCreatorApplication.status || '—'}</strong></span><span>{t('sellerAffiliate.fulfillmentStatus')}: <strong>{selectedCreatorApplication.fulfillment_status || '—'}</strong></span><span>{t('sellerAffiliate.sampleOrder')}: <strong>{selectedCreatorApplication.order_id || '—'}</strong></span><span>{t('sellerAffiliate.tracking')}: <strong>{selectedCreatorApplication.tracking_number || '—'}</strong></span><span>{t('sellerAffiliate.product')}: <strong>{selectedCreatorApplication.product?.title || selectedCreatorApplication.product?.id || '—'}</strong></span></div></section><section className="drawer-section"><h3>{t('sellerAffiliate.creatorContent')}</h3>{creatorDetailLoading ? <div className="empty-state"><span className="loading-dot" />{t('common.loading')}</div> : <div className="drawer-meta"><span>{t('sellerAffiliate.videos')}: <strong>{creatorContent?.video_count ?? '—'}</strong></span><span>{t('sellerAffiliate.lives')}: <strong>{creatorContent?.live_count ?? '—'}</strong></span><span>{t('sellerAffiliate.promotionStatus')}: <strong>{creatorContent?.promotion_status || '—'}</strong></span><span>{t('sellerAffiliate.promotionEnd')}: <strong>{formatTime(creatorContent?.promotion_end_time)}</strong></span></div>}</section></div></aside></div> : null}
    </div>
  );
};

export default SellerAffiliatePanel;
