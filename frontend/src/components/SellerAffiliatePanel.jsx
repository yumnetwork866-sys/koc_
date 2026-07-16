import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchTikTokSellerAffiliateOrders,
  fetchTikTokSellerOpenCollaborations,
  fetchTikTokSellerOpenCollaborationSettings,
  fetchTikTokSellerTargetCollaborations,
  fetchTikTokShops,
  startTikTokShopOauth,
} from '../lib/api';
import { useI18n } from '../lib/language';

const REQUIRED_SCOPE = 'seller.affiliate_collaboration.read';
const PAGE_SIZE = 20;

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

  const selectedShop = useMemo(() => shops.find((shop) => String(shop.id) === String(shopId)), [shopId, shops]);
  const scopes = Array.isArray(selectedShop?.authorization?.granted_scopes) ? selectedShop.authorization.granted_scopes : [];
  const hasScope = scopes.includes(REQUIRED_SCOPE);
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
      } else {
        result = await fetchTikTokSellerAffiliateOrders(shopId, { ...filters, programId: submittedKeyword });
      }
      setData(result || {});
    } catch (err) {
      if (err.name !== 'AbortError') setError(err.message || t('sellerAffiliate.loadError'));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [currentPageToken, hasScope, section, shopId, status, submittedKeyword, t]);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const rows = section === 'open'
    ? (data.open_collaborations || [])
    : section === 'target'
      ? (data.target_collaborations || [])
      : (data.orders || data.affiliate_orders || []);
  const nextPageToken = data.next_page_token || '';
  const formatNumber = (value) => Number(value || 0).toLocaleString(locale);
  const formatRate = (value) => value === undefined || value === null ? '—' : `${(Number(value) / 100).toLocaleString(locale, { maximumFractionDigits: 2 })}%`;
  const formatTime = (value) => value ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(Number(value) * 1000)) : '—';
  const connectShop = async () => { const result = await startTikTokShopOauth('/manage/koc-performance'); window.location.assign(result.authorizeUrl); };
  const changeSection = (value) => { setSection(value); setPageTokens([]); setData({}); setError(''); };
  const submitSearch = (event) => { event.preventDefault(); setPageTokens([]); setSubmittedKeyword(keyword.trim()); };

  return (
    <div id="seller-affiliate-panel" role="tabpanel" aria-labelledby="seller-affiliate-tab" className="koc-tab-panel seller-affiliate">
      <section className="section-card seller-affiliate__controls">
        <div className="section-card__header">
          <div><h2 className="section-card__title">{t('sellerAffiliate.title')}</h2><p className="section-card__meta">{t('sellerAffiliate.meta')}</p></div>
        </div>
        <div className="seller-affiliate__filter-grid">
          <div className="field"><label htmlFor="affiliate-shop">{t('sellerAffiliate.shop')}</label><select id="affiliate-shop" value={shopId} onChange={(event) => { setShopId(event.target.value); setPageTokens([]); }}><option value="">{t('sellerAffiliate.selectShop')}</option>{shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.name}{shop.region ? ` · ${shop.region}` : ''}</option>)}</select></div>
          <form className="seller-affiliate__search" onSubmit={submitSearch}><div className="field"><label htmlFor="affiliate-search">{t(section === 'orders' ? 'sellerAffiliate.programId' : 'common.search')}</label><input id="affiliate-search" value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder={t(`sellerAffiliate.${section}Search`)} /></div><button className="button button--ghost" type="submit">{t('common.search')}</button></form>
          {section === 'target' ? <div className="field"><label htmlFor="affiliate-status">{t('sellerAffiliate.status')}</label><select id="affiliate-status" value={status} onChange={(event) => { setStatus(event.target.value); setPageTokens([]); }}><option value="">{t('sellerAffiliate.allStatuses')}</option>{['ONGOING', 'EXPIRING', 'VALID', 'CANCELING', 'COMPLETED'].map((value) => <option value={value} key={value}>{value}</option>)}</select></div> : null}
        </div>
      </section>

      {!shops.length && !loading ? <section className="section-card empty-state"><h2>{t('sellerAffiliate.noShop')}</h2><p>{t('sellerAffiliate.noShopMeta')}</p></section> : null}
      {selectedShop && !hasScope ? <section className="section-card seller-affiliate__permission" role="alert"><div><strong>{t('sellerAffiliate.missingScope')}</strong><p>{t('sellerAffiliate.missingScopeMeta')}</p><code>{REQUIRED_SCOPE}</code></div><button className="button" type="button" onClick={connectShop}>{t('sellerAffiliate.reauthorize')}</button></section> : null}
      {error ? <section className="section-card empty-state empty-state--compact" role="alert">{error}</section> : null}

      {selectedShop && hasScope ? <>
        <div className="seller-affiliate__subtabs" role="tablist" aria-label={t('sellerAffiliate.sections')}>
          {['open', 'target', 'orders'].map((value) => <button className={section === value ? 'is-active' : ''} type="button" role="tab" aria-selected={section === value} onClick={() => changeSection(value)} key={value}>{t(`sellerAffiliate.${value}Tab`)}</button>)}
        </div>
        {section === 'open' && settings ? <section className="seller-affiliate__summary"><article className="stat-card"><p className="stat-card__label">{t('sellerAffiliate.autoAdd')}</p><p className="stat-card__value seller-affiliate__setting-value">{settings.auto_add_product?.enable ? t('common.yes') : t('common.no')}</p></article><article className="stat-card"><p className="stat-card__label">{t('sellerAffiliate.defaultCommission')}</p><p className="stat-card__value seller-affiliate__setting-value">{formatRate(settings.auto_add_product?.commission_rate)}</p></article><article className="stat-card"><p className="stat-card__label">{t('sellerAffiliate.total')}</p><p className="stat-card__value seller-affiliate__setting-value">{formatNumber(data.total_count)}</p></article></section> : null}
        <section className="section-card">
          <div className="section-card__header"><div><h2 className="section-card__title">{t(`sellerAffiliate.${section}Title`)}</h2><p className="section-card__meta">{t(`sellerAffiliate.${section}Meta`)}</p></div><span className="chip">{formatNumber(data.total_count ?? rows.length)}</span></div>
          <div className="table-wrap"><table className="data-table seller-affiliate__table"><thead><tr>{section === 'open' ? <><th>{t('sellerAffiliate.product')}</th><th>{t('sellerAffiliate.commission')}</th><th>{t('sellerAffiliate.creators')}</th><th>{t('sellerAffiliate.status')}</th></> : section === 'target' ? <><th>{t('sellerAffiliate.invitation')}</th><th>{t('sellerAffiliate.products')}</th><th>{t('sellerAffiliate.creators')}</th><th>{t('sellerAffiliate.validity')}</th><th>{t('sellerAffiliate.status')}</th></> : <><th>{t('sellerAffiliate.order')}</th><th>{t('sellerAffiliate.product')}</th><th>{t('sellerAffiliate.program')}</th><th>{t('sellerAffiliate.createdAt')}</th></>}</tr></thead><tbody>
            {loading ? <tr><td colSpan={5}><div className="empty-state"><span className="loading-dot" />{t('common.loading')}</div></td></tr> : rows.map((row, index) => section === 'open' ? <tr key={row.id || index}><td><div className="seller-affiliate__product">{row.product?.main_image_url ? <img src={row.product.main_image_url} alt="" loading="lazy" /> : null}<div><strong>{row.product?.title || row.product?.id || row.id}</strong><span>{row.product?.id}</span></div></div></td><td>{formatRate(row.current_commission?.rate ?? row.commission_rate)}</td><td>{formatNumber(row.showcase_creator_count)} / {formatNumber(row.content_creator_count)}</td><td><span className="chip">{row.status || '—'}</span></td></tr> : section === 'target' ? <tr key={row.id || index}><td><strong>{row.name || row.id}</strong><span className="row-subtitle">{row.id}</span></td><td>{formatNumber(row.products?.length ?? row.product_count)}</td><td>{formatNumber(row.showcase_creator_count ?? row.creator_inivited_count ?? row.creator_invited_count)} / {formatNumber(row.content_creator_count)}</td><td>{formatTime(row.end_time)}</td><td><span className="chip">{row.status || row.collaboration_status || row.type || '—'}</span></td></tr> : <tr key={row.order_id || row.id || index}><td><strong>{row.order_id || row.id}</strong></td><td>{row.product_id || row.product?.id || '—'}</td><td>{row.program_id || row.collaboration_id || '—'}</td><td>{formatTime(row.create_time || row.created_time)}</td></tr>)}
            {!loading && !rows.length ? <tr><td colSpan={5}><div className="empty-state">{t('sellerAffiliate.noData')}</div></td></tr> : null}
          </tbody></table></div>
          <div className="pagination"><button className="button button--ghost" type="button" disabled={!pageTokens.length || loading} onClick={() => setPageTokens((tokens) => tokens.slice(0, -1))}>{t('common.previous')}</button><span>{t('sellerAffiliate.page', { page: pageTokens.length + 1 })}</span><button className="button button--ghost" type="button" disabled={!nextPageToken || loading} onClick={() => setPageTokens((tokens) => [...tokens, nextPageToken])}>{t('common.next')}</button></div>
        </section>
      </> : null}
    </div>
  );
};

export default SellerAffiliatePanel;
