import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import {
  fetchTikTokSellerAffiliateOrders,
  fetchTikTokSellerAffiliateCreators,
  fetchTikTokSellerSampleApplicationFulfillments,
  fetchTikTokSellerMarketplaceCreators,
  fetchTikTokSellerCreatorContentDetails,
  fetchTikTokSellerOpenCollaborations,
  fetchTikTokSellerOpenCollaborationSettings,
  fetchTikTokSellerTargetCollaborations,
  fetchTikTokCreatorPerformance,
  fetchTikTokShops,
} from '../lib/api';
import { useI18n } from '../lib/language';
import {
  getAffiliateOrderProductIds,
  getAffiliateOrderProgramIds,
  getCreatorMetric,
  getCreatorVideoEngagementRate,
  normalizeEngagementPercentage,
} from '../lib/sellerAffiliate';
import ShopDropdown from './ShopDropdown';
import Pagination from './Pagination';

const REQUIRED_SCOPE = 'seller.affiliate_collaboration.read';
const MARKETPLACE_SCOPE = 'seller.creator_marketplace.read';
const PRODUCT_SCOPE = 'seller.product.basic';
const PAGE_SIZE = 20;
const normalizeCreatorSearchKeyword = (value) => String(value || '').trim().replace(/^@+/, '');
const BREAKDOWN_COLORS = ['#00a89d', '#2563eb', '#f59e0b', '#e11d48', '#7c3aed', '#0f766e', '#64748b', '#db2777'];
const LOCALIZED_STATUSES = new Set([
  'ACTIVE', 'INACTIVE', 'ONGOING', 'VALID', 'COMPLETED', 'PENDING', 'AWAITING_SHIPMENT',
  'CONTENT_PENDING', 'SUCCEED', 'NORMAL', 'PROCESSING', 'FAILED', 'SUCCEEDED',
]);
const formatStatus = (value, t) => {
  const normalized = String(value || '').toUpperCase();
  return LOCALIZED_STATUSES.has(normalized) ? t(`sellerAffiliate.status_${normalized}`) : value || '—';
};
const CreatorAvatar = ({ src, name }) => {
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => { setFailed(false); setRetry(0); }, [src]);
  if (!src || failed) {
    return <span className="creator-identity__avatar creator-identity__avatar--fallback">{String(name || 'C').charAt(0)}</span>;
  }
  return <img className="creator-identity__avatar" src={retry ? `${src}#avatar-retry` : src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => { if (!retry) setRetry(1); else setFailed(true); }} />;
};
const MetricTooltip = ({ text }) => {
  const id = useId();
  const triggerRef = useRef(null);
  const [position, setPosition] = useState(null);
  const show = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const showAbove = rect.bottom + 100 > window.innerHeight;
    setPosition({
      left: Math.min(window.innerWidth - 252, Math.max(12, rect.left + rect.width / 2 - 120)),
      top: showAbove ? rect.top - 8 : rect.bottom + 8,
      showAbove,
    });
  };
  const hide = () => setPosition(null);
  return (
    <span className="seller-affiliate__metric-help">
      <button
        ref={triggerRef}
        type="button"
        aria-describedby={position ? id : undefined}
        aria-label={text}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={() => position ? hide() : show()}
      >
        ?
      </button>
      {position ? createPortal(
        <span
          className={`seller-affiliate__metric-tooltip${position.showAbove ? ' seller-affiliate__metric-tooltip--above' : ''}`}
          id={id}
          role="tooltip"
          style={{ left: position.left, top: position.top }}
        >
          {text}
        </span>,
        document.body,
      ) : null}
    </span>
  );
};
const arrayValue = (value) => Array.isArray(value) ? value : value ? [value] : [];
const percentageValue = (value) => {
  const raw = typeof value === 'object'
    ? value?.percentage ?? value?.percentage_value ?? value?.ratio ?? value?.value
    : value;
  const numeric = Number(String(raw ?? '').replace('%', ''));
  if (!Number.isFinite(numeric)) return null;
  if (String(raw).includes('%')) return numeric;
  if (numeric <= 1) return numeric * 100;
  return numeric > 100 ? numeric / 100 : numeric;
};
const distributionItems = (values, labelKeys) => {
  if (Array.isArray(values)) return values;
  if (!values || typeof values !== 'object') return arrayValue(values);
  if (labelKeys.some((key) => values[key])) return [values];
  return Object.entries(values).map(([label, value]) => ({ label, value }));
};
const distributionWinner = (values, labelKeys) => distributionItems(values, labelKeys)
  .map((item) => ({
    label: typeof item === 'string' ? item : item?.label || labelKeys.map((key) => item?.[key]).find(Boolean),
    percentage: percentageValue(item),
  }))
  .filter((item) => item.label)
  .sort((left, right) => (right.percentage ?? -1) - (left.percentage ?? -1))[0] || null;
const creatorLevelLabel = (creator) => {
  const value = creator.creator_level?.level ?? creator.creator_level ?? creator.level?.level ?? creator.level;
  if (value === undefined || value === null || value === '') return '';
  const match = String(value).match(/(\d+)/);
  return match ? `Lv. ${match[1]}` : String(value);
};
const creatorCategoryLabels = (creator) => {
  const candidates = [creator.categories, creator.category_names, creator.top_categories, creator.category_info, creator.category_ids]
    .flatMap(arrayValue)
    .map((category) => typeof category === 'string'
      ? category
      : category?.local_name || category?.name || category?.category_name)
    .filter(Boolean);
  return [...new Set(candidates)];
};
const normalizeAudienceLabel = (value) => String(value || '')
  .replace(/^(?:AGE_RANGE_|FOLLOWER_AGE_)/, '')
  .replace(/_/g, '-')
  .replace(/^([A-Z])([A-Z]+)$/i, (_, first, rest) => `${first.toUpperCase()}${rest.toLowerCase()}`);
const creatorFollowerDemographics = (creator) => {
  const demographics = creator.follower_demographics || creator.follower_audience || {};
  const topDemographics = creator.top_follower_demographics || {};
  const gender = distributionWinner(
    creator.follower_gender_distribution || creator.gender_distribution || demographics.gender_distribution
      || creator.follower_gender || demographics.gender || topDemographics.major_gender,
    ['gender', 'type', 'name', 'key'],
  );
  const age = distributionWinner(
    creator.follower_age_distribution || creator.age_distribution || demographics.age_distribution
      || creator.follower_age_ranges || creator.follower_age || demographics.age_ranges || topDemographics.age_ranges,
    ['age_range', 'range', 'type', 'name', 'key'],
  );
  const genderLabel = gender
    ? `${normalizeAudienceLabel(gender.label)}${gender.percentage === null ? '' : ` ${gender.percentage.toLocaleString('en-US', { maximumFractionDigits: 0 })}%`}`
    : '';
  const ageLabel = age
    ? `${normalizeAudienceLabel(age.label)}${age.percentage === null ? '' : ` ${age.percentage.toLocaleString('en-US', { maximumFractionDigits: 0 })}%`}`
    : '';
  return { gender: genderLabel, age: ageLabel };
};
const MarketplaceCreatorCell = ({ creator, followerCount, t }) => {
  const level = creatorLevelLabel(creator);
  const categories = creatorCategoryLabels(creator);
  const demographics = creatorFollowerDemographics(creator);
  const audience = [followerCount, demographics.gender, demographics.age].filter((value) => value && value !== '—');
  return <td className="marketplace-creator-cell"><div className="creator-identity marketplace-creator"><CreatorAvatar src={creator.avatar?.url || creator.avatar_url} name={creator.nickname || creator.username} /><span className="marketplace-creator__details"><span className="marketplace-creator__username">{creator.username || '—'}{level ? <span className="marketplace-creator__level">{level}</span> : null}</span><strong>{creator.nickname || creator.username || '—'}</strong>{creator.previously_invited ? <span className="marketplace-creator__previously-invited" title={t('sellerAffiliate.previouslyInvitedDescription')}>{t('sellerAffiliate.previouslyInvited')}</span> : null}{categories.length ? <span className="marketplace-creator__category">{categories[0]}{categories.length > 1 ? `, +${categories.length - 1}` : ''}</span> : null}{audience.length ? <span className="marketplace-creator__audience">{audience.join(' · ')}</span> : null}</span></div></td>;
};
const formatReportDate = (value) => {
  const match = String(value || '').slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value || '—';
};
const AffiliateOrderProducts = ({ row }) => {
  const products = Array.isArray(row.products) && row.products.length
    ? row.products
    : getAffiliateOrderProductIds(row).map((id) => ({ id }));
  if (!products.length) return '—';
  return <div className="seller-affiliate__order-products">{products.map((product) => <div className="seller-affiliate__product" key={product.id}>{product.main_image_url ? <img src={product.main_image_url} alt="" loading="lazy" /> : null}<div><strong>{product.title || product.id}</strong>{product.title ? <span>{product.id}</span> : null}</div></div>)}</div>;
};
const AffiliateOrderPrograms = ({ row, t }) => {
  const programs = Array.isArray(row.programs) && row.programs.length
    ? row.programs
    : getAffiliateOrderProgramIds(row).map((id) => ({ id }));
  if (!programs.length) return '—';
  return <div className="seller-affiliate__order-programs">{programs.map((program) => <div key={program.id}><strong>{program.name || (program.type === 'OPEN' ? t('sellerAffiliate.openTab') : program.id)}</strong>{program.name || program.type === 'OPEN' ? <span className="row-subtitle">{program.id}</span> : null}</div>)}</div>;
};

const waitForMarketplacePoll = (milliseconds, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) {
    reject(new DOMException('The operation was aborted.', 'AbortError'));
    return;
  }
  const onAbort = () => {
    window.clearTimeout(timeout);
    reject(new DOMException('The operation was aborted.', 'AbortError'));
  };
  const timeout = window.setTimeout(() => {
    signal?.removeEventListener('abort', onAbort);
    resolve();
  }, milliseconds);
  signal?.addEventListener('abort', onAbort, { once: true });
});

const SellerAffiliatePanel = () => {
  const { t, language } = useI18n();
  const locale = language === 'vi' ? 'vi-VN' : 'en-US';
  const [shops, setShops] = useState([]);
  const [shopId, setShopId] = useState('');
  const [section, setSection] = useState('open');
  const [keyword, setKeyword] = useState('');
  const [submittedKeyword, setSubmittedKeyword] = useState('');
  const [searchVersion, setSearchVersion] = useState(0);
  const [status, setStatus] = useState('ONGOING');
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
  const [profileRefreshing, setProfileRefreshing] = useState(false);
  const marketplaceSearchKey = useRef('');

  const selectedShop = useMemo(() => shops.find((shop) => String(shop.id) === String(shopId)), [shopId, shops]);
  const scopes = Array.isArray(selectedShop?.authorization?.granted_scopes) ? selectedShop.authorization.granted_scopes : [];
  const hasScope = scopes.includes(REQUIRED_SCOPE);
  const hasMarketplaceScope = scopes.includes(MARKETPLACE_SCOPE);
  const hasProductScope = scopes.includes(PRODUCT_SCOPE);
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
    // searchVersion intentionally participates in this request so submitting the
    // same keyword again refreshes Marketplace data and creator details.
    void searchVersion;
    if (!shopId || !hasScope || (section === 'discover' && !hasMarketplaceScope)) {
      setData({});
      setSettings(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const filters = {
        signal,
        pageSize: PAGE_SIZE,
        pageToken: currentPageToken,
        keyword: submittedKeyword,
        ...(section === 'discover' && marketplaceSearchKey.current
          ? { searchKey: marketplaceSearchKey.current }
          : {}),
      };
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
          planType: 'ALL',
          page: pageTokens.length + 1,
        });
      } else if (section === 'creators') {
        result = await fetchTikTokSellerAffiliateCreators(shopId, { ...filters, status });
      } else if (section === 'discover') {
        for (let pollCount = 0; pollCount < 60; pollCount += 1) {
          result = await fetchTikTokSellerMarketplaceCreators(shopId, filters);
          if (result?.search_key) marketplaceSearchKey.current = result.search_key;
          if (submittedKeyword && Array.isArray(result?.creators)) {
            const normalizedKeyword = normalizeCreatorSearchKeyword(submittedKeyword).toLocaleLowerCase();
            const matchingCreators = result.creators.filter((creator) => (
              [creator.username, creator.nickname].some((value) => (
                String(value || '').toLocaleLowerCase().replace(/^@/, '').includes(normalizedKeyword)
              ))
            ));
            const exactMatches = matchingCreators.filter((creator) => (
              [creator.username, creator.nickname].some((value) => (
                String(value || '').toLocaleLowerCase().replace(/^@/, '') === normalizedKeyword
              ))
            ));
            const displayedCreators = exactMatches.length ? exactMatches : matchingCreators;
            result = {
              ...result,
              creators: displayedCreators,
              total_count: displayedCreators.length,
              next_page_token: '',
            };
          }
          if (!signal?.aborted) {
            setData(result || {});
            setLoading(false);
          }
          if (result?.search_pending) {
            await waitForMarketplacePoll(Math.max(60_000, Number(result.search_poll_after_ms) || 60_000), signal);
            continue;
          }
          if (!result?.detail_refresh?.pending) break;
          await waitForMarketplacePoll(Math.max(1000, Number(result.detail_refresh.poll_after_ms) || 2000), signal);
        }
        return;
      } else {
        result = await fetchTikTokSellerAffiliateOrders(shopId, { ...filters, programId: submittedKeyword });
      }
      if (!signal?.aborted) setData(result || {});
      if (section === 'performance') setProfileRefreshing(result?.profile_refresh?.status === 'PROCESSING');
    } catch (err) {
      if (err.name !== 'AbortError') setError(err.message || t('sellerAffiliate.loadError'));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [currentPageToken, hasMarketplaceScope, hasScope, pageTokens.length, performanceWindow, searchVersion, section, shopId, status, submittedKeyword, t]);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  useEffect(() => {
    if (section !== 'performance' || (data.export?.status !== 'PROCESSING' && data.base_export?.status !== 'PROCESSING') || !shopId) return undefined;
    const controller = new AbortController();
    const interval = window.setInterval(() => {
      fetchTikTokCreatorPerformance(shopId, {
        signal: controller.signal,
        windowType: performanceWindow,
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
  }, [data.base_export?.status, data.export?.status, pageTokens.length, performanceWindow, section, shopId, submittedKeyword]);

  useEffect(() => {
    if (!profileRefreshing || section !== 'performance' || !shopId) return undefined;
    const controller = new AbortController();
    const refresh = () => fetchTikTokCreatorPerformance(shopId, {
      signal: controller.signal,
      windowType: performanceWindow,
      planType: 'ALL',
      page: pageTokens.length + 1,
      pageSize: PAGE_SIZE,
      keyword: submittedKeyword,
    }).then((result) => {
      setData(result);
      if (result.profile_refresh && result.profile_refresh.status !== 'PROCESSING') {
        setProfileRefreshing(false);
      }
    }).catch((err) => {
      if (err.name !== 'AbortError') setError(err.message);
    });
    const interval = window.setInterval(refresh, 60 * 1000);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [pageTokens.length, performanceWindow, profileRefreshing, section, shopId, submittedKeyword]);

  const rows = section === 'open'
    ? (data.open_collaborations || [])
    : section === 'target'
      ? (data.target_collaborations || [])
      : section === 'creators'
        ? (data.sample_applications || [])
        : section === 'discover'
          ? (data.creators || [])
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
      current.postedContent ||= Number(application.sample_content_count || 0) > 0;
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
  const currentPage = pageTokens.length + 1;
  const totalPages = Math.max(
    currentPage + (nextPageToken ? 1 : 0),
    Math.ceil(Number(data.total_count || 0) / Number(data.page_size || PAGE_SIZE)),
    1,
  );
  const changePage = async (targetPage) => {
    const target = Math.min(totalPages, Math.max(1, Number(targetPage) || 1));
    if (target === currentPage) return;

    if (target < currentPage) {
      setPageTokens((tokens) => tokens.slice(0, target - 1));
      return;
    }

    if (section === 'performance') {
      setPageTokens(Array.from({ length: target - 1 }, () => 'next'));
      return;
    }

    if (section === 'discover') {
      setPageTokens(Array.from(
        { length: target - 1 },
        (_, index) => String((index + 1) * PAGE_SIZE),
      ));
      return;
    }

    setLoading(true);
    setError('');
    try {
      const tokens = [...pageTokens];
      let cursor = nextPageToken;
      while (tokens.length < target - 1 && cursor) {
        tokens.push(cursor);
        if (tokens.length >= target - 1) break;

        const filters = {
          pageSize: PAGE_SIZE,
          pageToken: cursor,
          keyword: submittedKeyword,
        };
        let intermediate;
        if (section === 'open') {
          intermediate = await fetchTikTokSellerOpenCollaborations(shopId, filters);
        } else if (section === 'target') {
          intermediate = await fetchTikTokSellerTargetCollaborations(shopId, { ...filters, status });
        } else if (section === 'creators') {
          intermediate = await fetchTikTokSellerAffiliateCreators(shopId, { ...filters, status });
        } else {
          intermediate = await fetchTikTokSellerAffiliateOrders(shopId, { ...filters, programId: submittedKeyword });
        }
        cursor = intermediate?.next_page_token || '';
      }
      if (tokens.length === pageTokens.length) {
        setLoading(false);
      } else {
        setPageTokens(tokens);
      }
    } catch (err) {
      setError(err.message || t('sellerAffiliate.loadError'));
      setLoading(false);
    }
  };
  const openCollaborationSettings = settings?.open_collaboration_settings || settings;
  const selectedPerformanceExport = data.snapshot_export;
  const formatNumber = (value) => Number(value || 0).toLocaleString(locale);
  const formatCompactNumber = (value) => new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(Number(value || 0));
  const formatRate = (value) => value === undefined || value === null ? '—' : `${(Number(value) / 100).toLocaleString(locale, { maximumFractionDigits: 2 })}%`;
  const formatTime = (value) => value ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(Number(value) * 1000)) : '—';
  const formatMoney = (money) => {
    if (money?.amount === undefined || money?.amount === null || money.amount === '') return '—';
    try {
      const currency = money.currency || 'USD';
      const formatter = new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 2 });
      if (currency === 'MYR') {
        return formatter.formatToParts(Number(money.amount))
          .map((part) => part.type === 'currency' ? 'RM' : part.value)
          .join('');
      }
      return formatter.format(Number(money.amount));
    } catch {
      return `${Number(money.amount).toLocaleString(locale)} ${money.currency || ''}`.trim();
    }
  };
  const formatCreatorGmv = (creator) => {
    const money = creator.local_gmv || creator.gmv;
    if (money?.amount !== undefined && money?.amount !== null && money.amount !== '') {
      const prefix = money.currency === 'MYR' ? 'RM' : money.currency === 'USD' ? 'US$' : `${money.currency || ''} `;
      return `${prefix}${formatCompactNumber(money.amount)}`;
    }
    const range = creator.local_gmv_range || creator.gmv_range;
    return range?.formatted_range
      ? range.formatted_range
      : '—';
  };
  const formatCreatorCount = (creator, names) => {
    const value = getCreatorMetric(creator, names);
    return value === null ? '—' : formatCompactNumber(value);
  };
  const formatUnitsSold = (creator) => {
    const exactValue = getCreatorMetric(creator, ['units_sold', 'items_sold']);
    if (exactValue !== null) return formatCompactNumber(exactValue);
    const range = getCreatorMetric(creator, ['units_sold_range', 'items_sold_range']);
    if (!range) return '—';
    if (typeof range === 'string') return range;
    if (range.formatted_range) return range.formatted_range;
    const minimum = range.minimum_amount ?? range.minimum ?? range.min;
    const maximum = range.maximum_amount ?? range.maximum ?? range.max;
    if (minimum === undefined && maximum === undefined) return '—';
    if (minimum === undefined) return formatCompactNumber(maximum);
    if (maximum === undefined) return `${formatCompactNumber(minimum)}+`;
    if (Number(minimum) === Number(maximum)) return formatCompactNumber(minimum);
    return `${formatCompactNumber(minimum)}–${formatCompactNumber(maximum)}`;
  };
  const formatEngagementRate = (creator) => {
    const rate = getCreatorVideoEngagementRate(creator, { scope: 'shoppable' });
    if (Number.isFinite(rate)) return `${rate.toLocaleString(locale, { maximumFractionDigits: 2 })}%`;
    const range = getCreatorMetric(creator, [
      'video_engagement_rate_range',
      'engagement_rate_range',
    ]);
    if (!range) return '—';
    if (typeof range === 'string') return range.includes('%') ? range : `${range}%`;
    if (range.formatted_range) return range.formatted_range;
    const minimum = normalizeEngagementPercentage(range.minimum_rate ?? range.minimum_amount ?? range.minimum);
    const maximum = normalizeEngagementPercentage(range.maximum_rate ?? range.maximum_amount ?? range.maximum);
    if (minimum === null && maximum === null) return '—';
    if (maximum === null || minimum === maximum) return `${minimum.toLocaleString(locale, { maximumFractionDigits: 2 })}%`;
    if (minimum === null) return `${maximum.toLocaleString(locale, { maximumFractionDigits: 2 })}%`;
    return `${minimum.toLocaleString(locale, { maximumFractionDigits: 2 })}%–${maximum.toLocaleString(locale, { maximumFractionDigits: 2 })}%`;
  };
  const performanceCreatorCell = (row) => <td><div className="creator-identity"><CreatorAvatar src={row.avatar_url} name={row.nickname || row.username} /><span><strong>{row.nickname || row.username}</strong><span className="row-subtitle">@{row.username}</span></span></div></td>;
  const renderPerformanceMetric = (row, sourceHeaders, formatter) => {
    const rawMetrics = row.raw_metrics || {};
    return sourceHeaders.some((header) => Object.prototype.hasOwnProperty.call(rawMetrics, header))
      ? formatter()
      : '—';
  };
  const performanceColumns = [
    {
      key: 'creatorName',
      render: (row) => <div className="creator-identity"><CreatorAvatar src={row.avatar_url} name={row.nickname || row.username} /><span><strong>{row.nickname || row.username}</strong><span className="row-subtitle">@{row.username}</span></span></div>,
    },
    { key: 'creatorAttributedGmv', numeric: true, render: (row) => renderPerformanceMetric(row, ['Affiliate GMV', 'Creator-attributed GMV'], () => formatMoney({ amount: row.affiliate_gmv, currency: row.currency })) },
    { key: 'refunds', numeric: true, render: (row) => renderPerformanceMetric(row, ['Affiliate refunded GMV', 'Refunds'], () => formatMoney({ amount: row.refunded_gmv, currency: row.currency })) },
    { key: 'attributedOrders', numeric: true, render: (row) => renderPerformanceMetric(row, ['Affiliate orders', 'Attributed orders'], () => formatNumber(row.affiliate_orders)) },
    { key: 'creatorAttributedItemsSold', numeric: true, render: (row) => renderPerformanceMetric(row, ['Items sold', 'Creator-attributed items sold'], () => formatNumber(row.items_sold)) },
    { key: 'itemsRefunded', numeric: true, render: (row) => renderPerformanceMetric(row, ['Affiliate items refunded', 'Items refunded'], () => formatNumber(row.items_refunded)) },
    { key: 'aov', numeric: true, tooltipKey: 'aovTooltip', render: (row) => renderPerformanceMetric(row, ['Avg. order value', 'AOV'], () => formatMoney({ amount: row.average_order_value, currency: row.currency })) },
    { key: 'liveStreams', numeric: true, render: (row) => renderPerformanceMetric(row, ['Affiliate LIVE streams', 'LIVE streams'], () => formatNumber(row.live_streams)) },
    { key: 'videos', numeric: true, render: (row) => renderPerformanceMetric(row, ['Affiliate shoppable videos', 'Videos'], () => formatNumber(row.shoppable_videos)) },
    { key: 'samplesShipped', numeric: true, render: (row) => renderPerformanceMetric(row, ['Samples shipped'], () => formatNumber(row.samples_shipped)) },
    { key: 'estimatedCommission', numeric: true, render: (row) => renderPerformanceMetric(row, ['Est. commission'], () => formatMoney({ amount: row.estimated_commission, currency: row.currency })) },
  ];
  const tableColumnCount = {
    open: 4,
    target: 5,
    discover: 5,
    performance: performanceColumns.length,
    creators: 7,
    orders: 4,
  }[section] || 1;
  const baseSnapshot = data.base_snapshot;
  const creatorTotals = data.totals;
  const summaryCurrency = baseSnapshot?.currency || rows.find((row) => row.currency)?.currency || 'MYR';
  const summaryValues = baseSnapshot ? {
    creatorGmv: baseSnapshot.creator_attributed_gmv,
    itemsSold: baseSnapshot.creator_attributed_items_sold,
    refundedGmv: baseSnapshot.refunds,
    estimatedCommission: baseSnapshot.estimated_commission,
    videos: baseSnapshot.videos,
    lives: baseSnapshot.live_streams,
    samplesShipped: baseSnapshot.samples_shipped,
    itemsRefunded: baseSnapshot.items_refunded,
    averageOrderValue: baseSnapshot.average_order_value,
  } : creatorTotals ? {
    creatorGmv: creatorTotals.affiliate_gmv,
    itemsSold: creatorTotals.items_sold,
    refundedGmv: creatorTotals.refunded_gmv,
    estimatedCommission: creatorTotals.estimated_commission,
    videos: creatorTotals.videos,
    lives: creatorTotals.live_streams,
    samplesShipped: creatorTotals.samples_shipped,
    itemsRefunded: creatorTotals.items_refunded,
    averageOrderValue: creatorTotals.average_order_value,
  } : null;
  const moneySummaryMetrics = new Set(['creatorGmv', 'refundedGmv', 'estimatedCommission', 'averageOrderValue']);
  const baseMetrics = summaryValues
    ? Object.entries(summaryValues)
      .filter(([, value]) => value !== null && value !== undefined)
      .map(([key, value]) => [
        key,
        moneySummaryMetrics.has(key)
          ? formatMoney({ amount: value, currency: summaryCurrency })
          : formatNumber(value),
      ])
    : [];
  const resetMarketplaceSearch = () => { marketplaceSearchKey.current = ''; };
  const changeSection = (value) => { resetMarketplaceSearch(); setSection(value); setStatus(value === 'target' ? 'ONGOING' : ''); setKeyword(''); setSubmittedKeyword(''); setPageTokens([]); setData({}); setError(''); };
  const submitSearch = (event) => {
    event.preventDefault();
    resetMarketplaceSearch();
    setPageTokens([]);
    setSubmittedKeyword(section === 'discover' ? normalizeCreatorSearchKeyword(keyword) : keyword.trim());
    setSearchVersion((version) => version + 1);
  };
  const openCreatorDetail = async (application) => {
    setSelectedCreatorApplication({
      ...application,
      status: formatStatus(application.status, t),
      fulfillment_status: formatStatus(application.fulfillment_status, t),
    });
    setCreatorContent(null);
    const productId = application.product?.id;
    try {
      setCreatorDetailLoading(true);
      const [contentResult, fulfillmentResult] = await Promise.allSettled([
        productId
          ? fetchTikTokSellerCreatorContentDetails(shopId, { productId })
          : Promise.resolve(null),
        application.sample_content_status === 'PENDING_SYNC'
          ? fetchTikTokSellerSampleApplicationFulfillments(shopId, application.id)
          : Promise.resolve(null),
      ]);
      if (contentResult.status === 'fulfilled' && contentResult.value) {
        const details = contentResult.value.creator_content_details || [];
        const username = String(application.creator?.username || '').replace(/^@/, '');
        const content = details.find((item) => String(item.creator_profile?.username || '').replace(/^@/, '') === username) || details[0] || null;
        setCreatorContent(content ? { ...content, promotion_status: formatStatus(content.promotion_status, t) } : null);
      }
      if (fulfillmentResult.status === 'fulfilled' && fulfillmentResult.value) {
        const enriched = { ...application, ...fulfillmentResult.value };
        setSelectedCreatorApplication({
          ...enriched,
          status: formatStatus(enriched.status, t),
          fulfillment_status: formatStatus(enriched.fulfillment_status, t),
        });
        setData((current) => ({
          ...current,
          sample_applications: (current.sample_applications || []).map((item) => (
            String(item.id) === String(application.id) ? { ...item, ...fulfillmentResult.value } : item
          )),
        }));
      } else if (fulfillmentResult.status === 'rejected') {
        setSelectedCreatorApplication((current) => current ? {
          ...current,
          sample_content_status: 'UNAVAILABLE',
        } : current);
      }
    } finally {
      setCreatorDetailLoading(false);
    }
  };
  const closeCreatorDetail = () => { setSelectedCreatorApplication(null); setCreatorContent(null); };
  return (
    <div className="page seller-affiliate">
      <section className="page__hero">
        <div><h1 className="page__title">{t('sellerAffiliate.tab')}</h1></div>
      </section>
      {selectedShop && hasScope ? (
        <div className="seller-affiliate__subtabs" role="tablist" aria-label={t('sellerAffiliate.sections')}>
          {['open', 'target', 'discover', 'performance', 'creators', 'orders'].map((value) => <button className={section === value ? 'is-active' : ''} type="button" role="tab" aria-selected={section === value} onClick={() => changeSection(value)} key={value}>{t(`sellerAffiliate.${value}Tab`)}</button>)}
        </div>
      ) : null}
      <section className="section-card seller-affiliate__controls">
        <div className="seller-affiliate__filter-grid">
          <div className="field"><label htmlFor="affiliate-shop">{t('sellerAffiliate.shop')}</label><ShopDropdown id="affiliate-shop" shops={shops} value={shopId} onChange={(nextShopId) => { resetMarketplaceSearch(); setShopId(nextShopId); setPageTokens([]); setData({}); }} disabled={loading || !shops.length} placeholder={t('sellerAffiliate.selectShop')} unknownLabel={t('common.unknown')} /></div>
          <form className="seller-affiliate__search" onSubmit={submitSearch}>
            <div className="field seller-affiliate__search-field">
              <label htmlFor="affiliate-search">{t(section === 'orders' ? 'sellerAffiliate.programId' : 'common.search')}</label>
              <input id="affiliate-search" value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder={t(`sellerAffiliate.${section}Search`)} />
              <button className="seller-affiliate__search-button" type="submit" aria-label={t('common.search')} title={t('common.search')}>
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <circle cx="11" cy="11" r="6.5" />
                  <path d="m16 16 4 4" />
                </svg>
              </button>
            </div>
          </form>
          {section === 'target' || section === 'creators' ? <div className="field"><label htmlFor="affiliate-status">{t('sellerAffiliate.status')}</label><select id="affiliate-status" value={status} onChange={(event) => { setStatus(event.target.value); setPageTokens([]); }}>{section === 'creators' ? <option value="">{t('sellerAffiliate.allStatuses')}</option> : null}{(section === 'target' ? ['ONGOING', 'EXPIRING', 'VALID', 'CANCELING', 'COMPLETED'] : ['PENDING', 'AWAITING_SHIPMENT', 'SHIPPED', 'CONTENT_PENDING', 'COMPLETED', 'REJECT_CANCELLED']).map((value) => <option value={value} key={value}>{value}</option>)}</select></div> : null}
          {section === 'performance' ? <div className="field"><label htmlFor="creator-performance-window">{t('sellerAffiliate.performanceWindow')}</label><select id="creator-performance-window" value={performanceWindow} onChange={(event) => { setPerformanceWindow(event.target.value); setPageTokens([]); }}><option value="PAST_24H">{t('sellerAffiliate.past24h')}</option><option value="PAST_7_DAYS">{t('sellerAffiliate.past7Days')}</option><option value="PAST_30_DAYS">{t('sellerAffiliate.past30Days')}</option><option value="PAST_180_DAYS">{t('sellerAffiliate.past180Days')}</option></select></div> : null}
        </div>
      </section>

      {!shops.length && !loading ? <section className="section-card empty-state"><h2>{t('sellerAffiliate.noShop')}</h2><p>{t('sellerAffiliate.noShopMeta')}</p></section> : null}
      {selectedShop && !hasScope ? <section className="section-card seller-affiliate__permission" role="alert"><div><strong>{t('sellerAffiliate.missingScope')}</strong><p>{t('sellerAffiliate.missingScopeMeta')}</p><code>{REQUIRED_SCOPE}</code></div></section> : null}
      {error ? <section className="section-card empty-state empty-state--compact" role="alert">{error}</section> : null}

      {selectedShop && hasScope ? <>
        {section === 'performance' ? <section className="section-card"><div className="section-card__header"><div><h2 className="section-card__title">{t('sellerAffiliate.performanceTitle')}</h2><p className="section-card__meta">{selectedPerformanceExport ? `${formatReportDate(selectedPerformanceExport.start_date)} – ${formatReportDate(selectedPerformanceExport.end_date)}` : t(`sellerAffiliate.performanceStatus_${data.export?.status || 'EMPTY'}`)}</p></div></div>{baseMetrics.length ? <section className="seller-affiliate__summary seller-affiliate__base-summary">{baseMetrics.map(([key, value]) => <article className="stat-card" key={key}><p className="stat-card__label">{t(`sellerAffiliate.${key}`)}</p><p className="stat-card__value seller-affiliate__setting-value">{value}</p></article>)}</section> : null}</section> : null}
        {section === 'performance' && !hasMarketplaceScope ? <section className="section-card empty-state empty-state--compact" role="alert"><strong>{t('sellerAffiliate.missingMarketplaceScope')}</strong><span>{t('sellerAffiliate.missingMarketplaceScopeMeta')}</span></section> : null}
        {section === 'discover' && !hasMarketplaceScope ? <section className="section-card seller-affiliate__permission" role="alert"><div><strong>{t('sellerAffiliate.missingMarketplaceScope')}</strong><p>{t('sellerAffiliate.missingMarketplaceScopeMeta')}</p><code>{MARKETPLACE_SCOPE}</code></div></section> : null}
        {section === 'discover' && hasMarketplaceScope && !hasProductScope ? <section className="section-card seller-affiliate__permission" role="alert"><div><strong>{t('sellerAffiliate.missingProductScope')}</strong><p>{t('sellerAffiliate.missingProductScopeMeta')}</p><code>{PRODUCT_SCOPE}</code></div></section> : null}
        {section === 'performance' && performanceBreakdown.length ? <section className="section-card seller-creator-breakdown"><div className="section-card__header"><div><h2 className="section-card__title">{t('sellerAffiliate.performanceChartTitle')}</h2><p className="section-card__meta">{t('sellerAffiliate.performanceChartMeta')}</p></div></div><div className="seller-creator-breakdown__body"><div className="seller-creator-breakdown__chart"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={performanceBreakdown} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="82%" paddingAngle={2}>{performanceBreakdown.map((item, index) => <Cell key={item.name} fill={BREAKDOWN_COLORS[index % BREAKDOWN_COLORS.length]} />)}</Pie><Tooltip formatter={(value) => formatMoney({ amount: value, currency: rows[0]?.currency || 'MYR' })} /></PieChart></ResponsiveContainer><div className="seller-creator-breakdown__center"><strong>{formatMoney({ amount: performanceBreakdownTotal, currency: rows[0]?.currency || 'MYR' })}</strong><span>{t('sellerAffiliate.top10Gmv')}</span></div></div><div className="seller-creator-breakdown__legend">{performanceBreakdown.map((item, index) => <div key={item.name}><i style={{ background: BREAKDOWN_COLORS[index % BREAKDOWN_COLORS.length] }} /><span>{item.name}</span><strong>{formatMoney({ amount: item.value, currency: rows[0]?.currency || 'MYR' })}</strong></div>)}</div></div></section> : null}
        {section === 'creators' ? <section className="section-card seller-creator-breakdown"><div className="section-card__header"><div><h2 className="section-card__title">{t('sellerAffiliate.breakdownTitle')}</h2><p className="section-card__meta">{t('sellerAffiliate.breakdownMeta')}</p></div><div className="field seller-creator-breakdown__select"><label htmlFor="creator-breakdown-metric">{t('sellerAffiliate.metric')}</label><select id="creator-breakdown-metric" value={creatorBreakdownMetric} onChange={(event) => setCreatorBreakdownMetric(event.target.value)}><option value="gmv">{t('sellerAffiliate.creatorGmv')}</option><option value="samplesShipped">{t('sellerAffiliate.samplesShipped')}</option><option value="postedContent">{t('sellerAffiliate.creatorsPosted')}</option><option value="withSales">{t('sellerAffiliate.creatorsWithSales')}</option></select></div></div>{creatorBreakdown.length ? <div className="seller-creator-breakdown__body"><div className="seller-creator-breakdown__chart"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={creatorBreakdown} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="82%" paddingAngle={2}>{creatorBreakdown.map((item, index) => <Cell key={item.name} fill={BREAKDOWN_COLORS[index % BREAKDOWN_COLORS.length]} />)}</Pie><Tooltip formatter={(value) => creatorBreakdownMetric === 'gmv' ? formatMoney({ amount: value, currency: creatorBreakdownCurrency }) : formatNumber(value)} /></PieChart></ResponsiveContainer><div className="seller-creator-breakdown__center"><strong>{creatorBreakdownMetric === 'gmv' ? formatMoney({ amount: creatorBreakdownTotal, currency: creatorBreakdownCurrency }) : formatNumber(creatorBreakdownTotal)}</strong><span>{t(`sellerAffiliate.breakdown_${creatorBreakdownMetric}`)}</span></div></div><div className="seller-creator-breakdown__legend">{creatorBreakdown.slice(0, 8).map((item, index) => <div key={item.name}><i style={{ background: BREAKDOWN_COLORS[index % BREAKDOWN_COLORS.length] }} /><span>{item.name}</span><strong>{creatorBreakdownMetric === 'gmv' ? formatMoney({ amount: item.value, currency: creatorBreakdownCurrency }) : formatNumber(item.value)}</strong></div>)}</div></div> : <div className="empty-state">{t('sellerAffiliate.noData')}</div>}</section> : null}
        {section === 'open' && openCollaborationSettings ? <section className="seller-affiliate__summary"><article className="stat-card"><p className="stat-card__label">{t('sellerAffiliate.autoAdd')}</p><p className="stat-card__value seller-affiliate__setting-value">{openCollaborationSettings.auto_add_product?.enable ? t('common.yes') : t('common.no')}</p></article><article className="stat-card"><p className="stat-card__label">{t('sellerAffiliate.defaultCommission')}</p><p className="stat-card__value seller-affiliate__setting-value">{formatRate(openCollaborationSettings.auto_add_product?.commission_rate)}</p></article><article className="stat-card"><p className="stat-card__label">{t('sellerAffiliate.total')}</p><p className="stat-card__value seller-affiliate__setting-value">{formatNumber(data.total_count)}</p></article></section> : null}
        {section === 'performance' ? <section className="section-card">
          <div className="section-card__header"><div><h2 className="section-card__title">{t('sellerAffiliate.performanceTitle')}</h2><p className="section-card__meta">{t('sellerAffiliate.performanceMeta')}</p></div><span className="chip">{formatNumber(data.total_count ?? rows.length)}</span></div>
          <div className="table-wrap seller-affiliate__performance-table-wrap"><table className="data-table seller-affiliate__table seller-affiliate__table--performance">
            <thead><tr>{performanceColumns.map((column) => <th className={column.numeric ? 'cell-number' : undefined} key={column.key}><span className="seller-affiliate__column-heading">{t(`sellerAffiliate.${column.key}`)}{column.tooltipKey ? <MetricTooltip text={t(`sellerAffiliate.${column.tooltipKey}`)} /> : null}</span></th>)}</tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={tableColumnCount}><div className="empty-state"><span className="loading-dot" />{t('common.loading')}</div></td></tr> : rows.length ? rows.map((row, index) => <tr key={row.id || index}>{performanceColumns.map((column) => <td className={column.numeric ? 'cell-number' : undefined} key={column.key}>{column.render(row)}</td>)}</tr>) : <tr><td colSpan={tableColumnCount}><div className="empty-state">{t('sellerAffiliate.noData')}</div></td></tr>}
            </tbody>
          </table></div>
          <Pagination
            className="seller-affiliate__pagination"
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={changePage}
            disabled={loading}
            previousLabel={t('common.previous')}
            nextLabel={t('common.next')}
            ariaLabel={t('sellerAffiliate.page', { page: currentPage })}
          />
        </section> : null}
        {section !== 'performance' && (section !== 'discover' || hasMarketplaceScope) ? <section className="section-card">
          <div className="section-card__header"><div><h2 className="section-card__title">{t(`sellerAffiliate.${section}Title`)}</h2>{section !== 'target' ? <p className="section-card__meta">{t(`sellerAffiliate.${section}Meta`)}</p> : null}</div><span className="chip">{formatNumber(data.total_count ?? rows.length)}</span></div>
          <div className="table-wrap"><table className="data-table seller-affiliate__table"><thead><tr>{section === 'open' ? <><th>{t('sellerAffiliate.product')}</th><th>{t('sellerAffiliate.commission')}</th><th>{t('sellerAffiliate.creators')}</th><th>{t('sellerAffiliate.status')}</th></> : section === 'target' ? <><th>{t('sellerAffiliate.invitation')}</th><th>{t('sellerAffiliate.products')}</th><th>{t('sellerAffiliate.creators')}</th><th>{t('sellerAffiliate.validity')}</th><th>{t('sellerAffiliate.status')}</th></> : section === 'discover' ? <><th>{t('sellerAffiliate.creator')}</th><th>{t('sellerAffiliate.creatorGmv30')}</th><th>{t('sellerAffiliate.itemsSold')}</th><th>{t('sellerAffiliate.avgVideoViews')}</th><th>{t('sellerAffiliate.engagementRate')}</th></> : section === 'performance' ? <><th>{t('sellerAffiliate.creator')}</th><th>{t('sellerAffiliate.creatorGmv')}</th><th>{t('sellerAffiliate.affiliateOrders')}</th><th>{t('sellerAffiliate.itemsSold')}</th><th>{t('sellerAffiliate.productImpressions')}</th><th>{t('sellerAffiliate.refundedGmv')}</th><th>{t('sellerAffiliate.followers')}</th></> : section === 'creators' ? <><th>{t('sellerAffiliate.creator')}</th><th>{t('sellerAffiliate.followers')}</th><th>{t('sellerAffiliate.creatorGmv30')}</th><th>{t('sellerAffiliate.content')}</th><th>{t('sellerAffiliate.fulfillment')}</th><th>{t('sellerAffiliate.status')}</th><th>{t('sellerAffiliate.actions')}</th></> : <><th>{t('sellerAffiliate.order')}</th><th>{t('sellerAffiliate.product')}</th><th>{t('sellerAffiliate.program')}</th><th>{t('sellerAffiliate.createdAt')}</th></>}</tr></thead><tbody>
            {loading ? <tr><td colSpan={section === 'discover' ? 5 : 7}><div className="empty-state"><span className="loading-dot" />{t('common.loading')}</div></td></tr> : section !== 'discover' && rows.length ? rows.map((row, index) => section === 'open' ? <tr key={row.id || index}><td><div className="seller-affiliate__product">{row.product?.main_image_url ? <img src={row.product.main_image_url} alt="" loading="lazy" /> : null}<div><strong>{row.product?.title || row.product?.id || row.id}</strong><span>{row.product?.id}</span></div></div></td><td>{formatRate(row.current_commission?.rate ?? row.commission_rate)}</td><td>{formatNumber(row.showcase_creator_count)} / {formatNumber(row.content_creator_count)}</td><td><span className="chip">{formatStatus(row.status, t)}</span></td></tr> : section === 'target' ? <tr key={row.id || index}><td><strong>{row.name || row.id}</strong><span className="row-subtitle">{row.id}</span><div className="target-collaboration__creators">{(row.creators || []).slice(0, 3).map((creator, creatorIndex) => <div className="creator-identity" key={creator.creator_open_id || creator.user_id || creator.username || creatorIndex}><CreatorAvatar src={creator.avatar?.url || creator.avatar_url} name={creator.nickname || creator.username} /><span><strong>{creator.nickname || creator.username || '—'}</strong><span className="row-subtitle">{creator.username ? `@${creator.username.replace(/^@/, '')}` : '—'}</span></span></div>)}{row.creators?.length > 3 ? <span className="target-collaboration__more">+{formatNumber(row.creators.length - 3)}</span> : null}</div></td><td>{formatNumber(row.products?.length ?? row.product_count)}</td><td>{formatNumber(row.showcase_creator_count)} / {formatNumber(row.content_creator_count)}</td><td>{formatTime(row.end_time)}</td><td><span className="chip">{formatStatus(row.status || row.collaboration_status, t)}</span></td></tr> : section === 'performance' ? <tr key={row.id || index}>{performanceCreatorCell(row)}<td>{formatMoney({ amount: row.affiliate_gmv, currency: row.currency })}</td><td>{formatNumber(row.affiliate_orders)}</td><td>{formatNumber(row.items_sold)}</td><td>{formatNumber(row.product_impressions)}</td><td>{formatMoney({ amount: row.refunded_gmv, currency: row.currency })}</td><td>{formatNumber(row.followers)}</td></tr> : section === 'creators' ? <tr key={row.id || index}><td><div className="creator-identity"><CreatorAvatar src={row.creator?.avatar_url} name={row.creator?.nickname || row.creator?.username} /><span><strong>{row.creator?.nickname || row.creator?.username || '—'}</strong><span className="row-subtitle">{row.creator?.username ? `@${row.creator.username.replace(/^@/, '')}` : row.creator?.user_id}</span></span></div></td><td>{formatNumber(row.creator?.follower_count)}</td><td>{formatMoney(row.creator?.gmv)}</td><td>{row.sample_content_status === 'UNAVAILABLE' ? t('common.noData') : row.sample_content_status === 'PENDING_SYNC' ? t('sellerAffiliate.loadContent') : row.sample_content_count ? <>{formatNumber(row.sample_content_count)}<span className="row-subtitle">{formatNumber(row.sample_content_views)} {t('common.views')}</span></> : t('sellerAffiliate.notPosted')}</td><td>{row.creator?.fulfillment_percentage ? `${row.creator.fulfillment_percentage}%` : formatStatus(row.fulfillment_status, t)}</td><td><span className="chip">{formatStatus(row.status, t)}</span></td><td><button className="button button--small button--ghost" type="button" onClick={() => openCreatorDetail(row)}>{t('sellerAffiliate.view')}</button></td></tr> : <tr key={row.order_id || row.id || index}><td><strong>{row.order_id || row.id}</strong></td><td><AffiliateOrderProducts row={row} /></td><td><AffiliateOrderPrograms row={row} t={t} /></td><td>{formatTime(row.create_time || row.created_time)}</td></tr>) : !rows.length ? <tr><td colSpan={section === 'discover' ? 5 : 7}><div className="empty-state">{t(section === 'discover' && data.search_pending ? 'sellerAffiliate.discoverSearchPending' : section === 'discover' && !submittedKeyword ? 'sellerAffiliate.discoverSyncPending' : 'sellerAffiliate.noData')}</div></td></tr> : null}
            {section === 'discover' && !loading ? rows.map((row, index) => <tr className="marketplace-creator-row" key={`marketplace-${row.creator_open_id || row.username || index}`}><MarketplaceCreatorCell creator={row} followerCount={formatCreatorCount(row, ['follower_count', 'followers'])} t={t} /><td>{formatCreatorGmv(row)}</td><td>{formatUnitsSold(row)}</td><td>{formatCreatorCount(row, ['avg_video_views', 'avg_ec_video_play_count', 'avg_ec_video_view_count', 'avg_ec_video_views', 'avg_video_play_count', 'avg_video_view_count'])}</td><td>{formatEngagementRate(row)}</td></tr>) : null}
          </tbody></table></div>
          <Pagination
            className="seller-affiliate__pagination"
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={changePage}
            disabled={loading}
            previousLabel={t('common.previous')}
            nextLabel={t('common.next')}
            ariaLabel={t('sellerAffiliate.page', { page: currentPage })}
          />
        </section> : null}
      </> : null}
      {selectedCreatorApplication ? <div className="koc-drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeCreatorDetail(); }}><aside className="koc-drawer" role="dialog" aria-modal="true" aria-labelledby="seller-creator-detail-title"><div className="koc-drawer__header"><div><h2 id="seller-creator-detail-title">{selectedCreatorApplication.creator?.nickname || selectedCreatorApplication.creator?.username}</h2><p>{selectedCreatorApplication.creator?.username ? `@${selectedCreatorApplication.creator.username.replace(/^@/, '')}` : selectedCreatorApplication.creator?.user_id}</p></div><button className="button button--ghost" type="button" onClick={closeCreatorDetail} aria-label={t('common.close')}>×</button></div><div className="koc-drawer__body"><section className="drawer-section"><div className="drawer-profile">{selectedCreatorApplication.creator?.avatar_url ? <img src={selectedCreatorApplication.creator.avatar_url} alt="" /> : null}<div><strong>{selectedCreatorApplication.creator?.nickname || selectedCreatorApplication.creator?.username}</strong><span>{formatNumber(selectedCreatorApplication.creator?.follower_count)} {t('sellerAffiliate.followers')}</span></div></div></section><section className="page__stats page__stats--four"><article className="stat-card"><p className="stat-card__label">{t('sellerAffiliate.creatorGmv')}</p><p className="stat-card__value">{formatMoney(selectedCreatorApplication.creator?.gmv)}</p></article><article className="stat-card"><p className="stat-card__label">{t('sellerAffiliate.content')}</p><p className="stat-card__value">{selectedCreatorApplication.sample_content_count === null || selectedCreatorApplication.sample_content_count === undefined ? '—' : formatNumber(selectedCreatorApplication.sample_content_count)}</p></article><article className="stat-card"><p className="stat-card__label">{t('common.views')}</p><p className="stat-card__value">{selectedCreatorApplication.sample_content_views === null || selectedCreatorApplication.sample_content_views === undefined ? '—' : formatNumber(selectedCreatorApplication.sample_content_views)}</p></article><article className="stat-card"><p className="stat-card__label">{t('sellerAffiliate.fulfillment')}</p><p className="stat-card__value">{selectedCreatorApplication.creator?.fulfillment_percentage ? `${selectedCreatorApplication.creator.fulfillment_percentage}%` : '—'}</p></article></section><section className="drawer-section"><h3>{t('sellerAffiliate.sampleDetail')}</h3><div className="drawer-meta"><span>{t('sellerAffiliate.status')}: <strong>{selectedCreatorApplication.status || '—'}</strong></span><span>{t('sellerAffiliate.fulfillmentStatus')}: <strong>{selectedCreatorApplication.fulfillment_status || '—'}</strong></span><span>{t('sellerAffiliate.sampleOrder')}: <strong>{selectedCreatorApplication.order_id || '—'}</strong></span><span>{t('sellerAffiliate.tracking')}: <strong>{selectedCreatorApplication.tracking_number || '—'}</strong></span><span>{t('sellerAffiliate.product')}: <strong>{selectedCreatorApplication.product?.title || selectedCreatorApplication.product?.id || '—'}</strong></span></div></section><section className="drawer-section"><h3>{t('sellerAffiliate.creatorContent')}</h3>{creatorDetailLoading ? <div className="empty-state"><span className="loading-dot" />{t('common.loading')}</div> : <div className="drawer-meta"><span>{t('sellerAffiliate.videos')}: <strong>{creatorContent?.video_count ?? '—'}</strong></span><span>{t('sellerAffiliate.lives')}: <strong>{creatorContent?.live_count ?? '—'}</strong></span><span>{t('sellerAffiliate.promotionStatus')}: <strong>{creatorContent?.promotion_status || '—'}</strong></span><span>{t('sellerAffiliate.promotionEnd')}: <strong>{formatTime(creatorContent?.promotion_end_time)}</strong></span></div>}</section></div></aside></div> : null}
    </div>
  );
};

export default SellerAffiliatePanel;
