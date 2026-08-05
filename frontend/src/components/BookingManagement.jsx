import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  createBooking,
  deleteBooking,
  fetchBookingTargetKocDetail,
  fetchBookingTargetKocs,
  fetchBookings,
  fetchTikTokSellerOpenCollaborations,
  fetchTikTokShopVideoThumbnail,
  matchBookingVideo,
  updateBooking,
} from '../lib/api';
import { useI18n } from '../lib/language';
import { useMoneyFormatter } from '../lib/currency';

const initialForm = { creator_key: '', total_cost: '' };
const ACTIVE_COLLABORATION_STATUSES = new Set(['ONGOING', 'VALID', 'EXPIRING']);
const DEFAULT_PERFORMANCE_WINDOW = 'PAST_30_DAYS';

const targetKocKey = (creator) => {
  const identity = creator.creator_open_id || `username:${String(creator.username || '').toLocaleLowerCase()}`;
  return `${creator.shop_id}:${identity}`;
};
const targetKocLabel = (creator) => {
  if (!creator) return '';
  const name = creator.nickname || creator.username || 'KOC';
  return `${name}${creator.username ? ` (@${creator.username})` : ''}`;
};
const snapshotOf = (booking) => booking?.evaluation_snapshot || {};
const collaborationOf = (booking) => snapshotOf(booking).collaboration || {};
const performanceOf = (booking) => Object.prototype.hasOwnProperty.call(booking || {}, 'reference_performance')
  ? booking.reference_performance
  : snapshotOf(booking).performance || null;
const videoMatchOf = (booking) => snapshotOf(booking).video_match || null;
const bookingVideosOf = (booking) => Array.isArray(booking?.booking_videos) ? booking.booking_videos : [];
const latestBookingVideoSnapshot = (video) => [...(video?.performance_snapshots || [])]
  .sort((left, right) => (
    String(right.snapshot_date || '').localeCompare(String(left.snapshot_date || ''))
    || new Date(right.synced_at || 0) - new Date(left.synced_at || 0)
  ))[0] || null;
const BOOKING_VIDEO_ICON_PATHS = {
  views: ['M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z'],
  likes: ['M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6a5.5 5.5 0 0 0 1-8.8Z'],
  comments: ['M21 12a8 8 0 0 1-8 8 9 9 0 0 1-4-.9L3 21l1.4-3.5A8 8 0 1 1 21 12Z'],
  shares: ['M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z', 'M6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z', 'M18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z', 'M8.6 10.5l6.8-4', 'M8.6 13.5l6.8 4'],
};
const BookingVideoIcon = ({ name }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    {BOOKING_VIDEO_ICON_PATHS[name].map((path) => <path key={path} d={path} />)}
  </svg>
);
const bookingVideoSocialMetrics = (snapshot) => {
  const rawVideo = snapshot?.raw_metrics?.video || snapshot?.raw_metrics || {};
  const listVideo = rawVideo?.list || rawVideo;
  const traffic = rawVideo?.detail?.performance?.intervals?.[0]?.traffic || {};
  return {
    views: snapshot?.views ?? listVideo?.views ?? traffic.views,
    likes: traffic.likes ?? listVideo?.likes ?? rawVideo?.likes,
    comments: traffic.comments ?? listVideo?.comments ?? rawVideo?.comments,
    shares: traffic.shares ?? listVideo?.shares ?? rawVideo?.shares,
  };
};
const finiteNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};
const optionalNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};
const editableCurrencyAmount = (value, currency) => {
  if (value === null || value === undefined || value === '') return '';
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '';
  return String(currency === 'VND' ? Math.round(amount) : Math.round(amount * 100) / 100);
};

const TargetKocAvatar = ({ src, name }) => {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (!src || failed) {
    return <span className="creator-identity__avatar creator-identity__avatar--fallback">{String(name || 'K').trim().charAt(0).toUpperCase()}</span>;
  }
  return <img className="creator-identity__avatar" src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
};

const BookingVideoThumbnail = ({ shopId, video, snapshot, index }) => {
  const rawVideo = snapshot?.raw_metrics?.video || snapshot?.raw_metrics || {};
  const listVideo = rawVideo?.list || rawVideo;
  const directThumbnail = video?.thumbnail_url
    || listVideo?.thumbnail_url
    || listVideo?.cover_image_url
    || listVideo?.cover_url
    || rawVideo?.thumbnail_url
    || rawVideo?.cover_image_url
    || rawVideo?.cover_url
    || null;
  const [thumbnail, setThumbnail] = useState(directThumbnail);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setThumbnail(directThumbnail);
    setFailed(false);
    if (directThumbnail || !shopId || !video?.platform_video_id || !video?.creator_username) return undefined;
    const controller = new AbortController();
    fetchTikTokShopVideoThumbnail(shopId, video.platform_video_id, video.creator_username, controller.signal)
      .then((payload) => setThumbnail(payload?.thumbnail_url || null))
      .catch((error) => { if (error.name !== 'AbortError') setFailed(true); });
    return () => controller.abort();
  }, [directThumbnail, shopId, video?.creator_username, video?.platform_video_id]);

  const content = thumbnail && !failed
    ? <img src={thumbnail} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
    : <span className="booking-video-expansion__thumbnail-placeholder" aria-hidden="true">▶</span>;
  return (
    <span className="booking-video-expansion__thumbnail">
      {video?.video_url ? <a href={video.video_url} target="_blank" rel="noreferrer" tabIndex={-1}>{content}</a> : content}
      <span className="booking-video-expansion__index" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
    </span>
  );
};

const productsOfBookingVideo = (video, snapshot) => {
  const raw = snapshot?.raw_metrics || {};
  const rawVideo = raw?.video || raw;
  const listVideo = rawVideo?.list || rawVideo;
  const breakdowns = rawVideo?.detail?.performance?.intervals?.[0]?.sales?.breakdowns || [];
  const sourceProducts = [
    ...(Array.isArray(video?.affiliate_products) ? video.affiliate_products : []),
    ...(Array.isArray(raw.products) ? raw.products : []),
    ...(Array.isArray(listVideo.products) ? listVideo.products : []),
    ...(Array.isArray(breakdowns) ? breakdowns : []),
  ];
  const byId = new Map();
  for (const product of sourceProducts) {
    const id = String(product?.id || product?.product_id || '').trim();
    if (!id) continue;
    const existing = byId.get(id) || {};
    byId.set(id, {
      id,
      name: product?.name || product?.title || product?.product_name || existing.name || null,
      thumbnailUrl: product?.main_image_url || product?.thumbnail_url || product?.thumbnailUrl || product?.image_url || existing.thumbnailUrl || null,
    });
  }
  const ids = [raw.product_id, rawVideo.product_id, listVideo.product_id]
    .flatMap((value) => String(value || '').split(','))
    .map((id) => id.trim())
    .filter(Boolean);
  for (const id of ids) {
    if (!byId.has(id)) byId.set(id, { id, name: null, thumbnailUrl: null });
  }
  return [...byId.values()];
};

const BookingVideoProduct = ({ product }) => {
  const tooltipId = useId();
  const itemRef = useRef(null);
  const [failed, setFailed] = useState(false);
  const [tooltip, setTooltip] = useState(null);
  useEffect(() => setFailed(false), [product.thumbnailUrl]);
  const showTooltip = () => {
    const rect = itemRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(320, window.innerWidth - 24);
    const showAbove = rect.bottom + 110 > window.innerHeight;
    setTooltip({
      left: Math.min(window.innerWidth - width - 12, Math.max(12, rect.left)),
      top: showAbove ? rect.top - 8 : rect.bottom + 8,
      width,
      showAbove,
    });
  };
  return (
    <span
      className="booking-video-expansion__product"
      ref={itemRef}
      tabIndex={0}
      aria-label={product.name || product.id}
      aria-describedby={tooltip ? tooltipId : undefined}
      onMouseEnter={showTooltip}
      onMouseLeave={() => setTooltip(null)}
      onFocus={showTooltip}
      onBlur={() => setTooltip(null)}
    >
      {product.thumbnailUrl && !failed
        ? <img src={product.thumbnailUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
        : <span className="booking-video-expansion__product-placeholder" aria-hidden="true">P</span>}
      {tooltip ? createPortal(
        <span
          className={`booking-video-expansion__product-tooltip${tooltip.showAbove ? ' booking-video-expansion__product-tooltip--above' : ''}`}
          id={tooltipId}
          role="tooltip"
          style={{ left: tooltip.left, top: tooltip.top, width: tooltip.width }}
        >
          {product.name || product.id}
        </span>,
        document.body,
      ) : null}
    </span>
  );
};

const BookingVideoProducts = ({ shopId, video, snapshot, label }) => {
  const sourceProducts = useMemo(() => productsOfBookingVideo(video, snapshot), [snapshot, video]);
  const [products, setProducts] = useState(sourceProducts);

  useEffect(() => {
    setProducts(sourceProducts);
    if (!shopId || !sourceProducts.length) return undefined;
    const missing = sourceProducts.filter((product) => !product.name || !product.thumbnailUrl);
    if (!missing.length) return undefined;
    const controller = new AbortController();
    Promise.all(missing.map(async (product) => {
      try {
        const payload = await fetchTikTokSellerOpenCollaborations(shopId, {
          signal: controller.signal,
          pageSize: 20,
          keyword: product.id,
        });
        const row = (payload?.open_collaborations || []).find((item) => String(item?.product?.id) === product.id);
        return row?.product ? {
          id: product.id,
          name: row.product.title || product.name,
          thumbnailUrl: row.product.main_image_url || product.thumbnailUrl,
        } : product;
      } catch {
        return product;
      }
    })).then((loaded) => {
      if (!controller.signal.aborted) setProducts(loaded);
    });
    return () => controller.abort();
  }, [shopId, sourceProducts]);

  return (
    <div className="booking-video-expansion__products-card">
      <span className="booking-video-expansion__products-label">{label}</span>
      <span className="booking-video-expansion__products">
        {products.length ? products.map((product) => <BookingVideoProduct product={product} key={product.id} />) : '—'}
      </span>
    </div>
  );
};

const TargetKocCombobox = ({
  creators, value, onChange, onSearch, onLoadMore, hasMore, loading,
  placeholder, noResults, performanceSourceLabel, collaborationLabel, loadMoreLabel, loadingLabel,
}) => {
  const rootRef = useRef(null);
  const selectedCreator = useMemo(
    () => creators.find((creator) => targetKocKey(creator) === value) || null,
    [creators, value],
  );
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => setQuery(targetKocLabel(selectedCreator)), [selectedCreator]);
  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (event.key === 'Escape' || (event.type === 'pointerdown' && !rootRef.current?.contains(event.target))) {
        setOpen(false);
        setQuery(targetKocLabel(selectedCreator));
      }
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', close);
    };
  }, [open, selectedCreator]);

  return (
    <div className="booking-koc-combobox" ref={rootRef}>
      <div className="booking-koc-combobox__control">
        <input
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls="booking-koc-options"
          value={query}
          placeholder={placeholder}
          required
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            onSearch(event.target.value);
            onChange('');
            setOpen(true);
          }}
        />
        <button type="button" aria-label={placeholder} aria-expanded={open} onClick={() => setOpen((current) => !current)}>
          <span className={`sidebar__chevron${open ? ' sidebar__chevron--open' : ''}`} aria-hidden="true" />
        </button>
      </div>
      {open ? (
        <div className="booking-koc-combobox__menu" id="booking-koc-options" role="listbox">
          {creators.length ? creators.map((creator) => (
            <button
              className={`booking-koc-combobox__option${targetKocKey(creator) === value ? ' booking-koc-combobox__option--active' : ''}`}
              type="button"
              role="option"
              aria-selected={targetKocKey(creator) === value}
              key={targetKocKey(creator)}
              onClick={() => { onChange(targetKocKey(creator)); setQuery(targetKocLabel(creator)); setOpen(false); }}
            >
              <TargetKocAvatar src={creator.avatar_url} name={creator.nickname || creator.username} />
              <span>
                <strong>{creator.nickname || creator.username}</strong>
                <small>@{creator.username} · {creator.collaboration_count ? `${creator.collaboration_count} ${collaborationLabel}` : performanceSourceLabel}</small>
              </span>
            </button>
          )) : loading ? null : <div className="booking-koc-combobox__empty">{noResults}</div>}
          {loading ? <div className="booking-koc-combobox__empty"><span className="loading-dot" />{loadingLabel}</div> : null}
          {!loading && hasMore ? <button className="booking-koc-combobox__load-more" type="button" onClick={onLoadMore}>{loadMoreLabel}</button> : null}
        </div>
      ) : null}
    </div>
  );
};

const BookingManagement = ({ heroTitle }) => {
  const { t, language } = useI18n();
  const [bookings, setBookings] = useState([]);
  const [targetKocs, setTargetKocs] = useState([]);
  const [targetKocQuery, setTargetKocQuery] = useState('');
  const [performanceWindow, setPerformanceWindow] = useState(DEFAULT_PERFORMANCE_WINDOW);
  const [targetKocPage, setTargetKocPage] = useState(1);
  const [targetKocPagination, setTargetKocPagination] = useState({ page: 1, total_pages: 1 });
  const [targetKocsLoading, setTargetKocsLoading] = useState(false);
  const [selectedKocDetail, setSelectedKocDetail] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [updatingId, setUpdatingId] = useState(null);
  const [matchingVideoId, setMatchingVideoId] = useState(null);
  const [videoMatchDialog, setVideoMatchDialog] = useState(null);
  const [expandedBookingId, setExpandedBookingId] = useState(null);
  const [manualVideoUrl, setManualVideoUrl] = useState('');
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [detailCost, setDetailCost] = useState('');
  const [error, setError] = useState('');
  const [openActions, setOpenActions] = useState({
    id: null,
    direction: 'down',
    top: 0,
    bottom: 0,
    right: 0,
  });
  const toggleBookingRow = (event, bookingId) => {
    if (event.target.closest('button, a, input, select, textarea, label')) return;
    setExpandedBookingId((current) => String(current) === String(bookingId) ? null : bookingId);
  };

  const locale = language === 'vi' ? 'vi-VN' : 'en-US';
  const formatNumber = (value, options) => finiteNumber(value).toLocaleString(locale, options);
  const { formatMoney, currency: selectedCurrency, convertAmount } = useMoneyFormatter(locale);
  const costInputCurrencyRef = useRef(selectedCurrency);
  const currencyLabel = selectedCurrency === 'VND' ? 'VNĐ' : 'RM';
  const formatDate = (value) => value
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(value))
    : '—';
  const formatRate = (value) => {
    const rate = optionalNumber(value);
    if (rate === null) return '—';
    return `${formatNumber(rate <= 1 ? rate * 100 : rate, { maximumFractionDigits: 2 })}%`;
  };
  const formatCollaborationStatus = (value) => value
    ? t(`booking.collaborationStatuses.${String(value).toUpperCase()}`)
    : '—';

  useEffect(() => {
    const previousCurrency = costInputCurrencyRef.current;
    if (previousCurrency === selectedCurrency) return;
    setForm((current) => {
      if (current.total_cost === '') return current;
      const converted = convertAmount(current.total_cost, previousCurrency);
      return { ...current, total_cost: editableCurrencyAmount(converted, selectedCurrency) };
    });
    setDetailCost((current) => {
      if (current === '') return current;
      return editableCurrencyAmount(convertAmount(current, previousCurrency), selectedCurrency);
    });
    costInputCurrencyRef.current = selectedCurrency;
  }, [convertAmount, selectedCurrency]);

  useEffect(() => {
    const closeActions = (event) => {
      if (event.type === 'keydown' && event.key !== 'Escape') return;
      if (event.type === 'click' && event.target.closest('.booking-action-menu')) return;
      setOpenActions({ id: null, direction: 'down', top: 0, bottom: 0, right: 0 });
    };
    document.addEventListener('click', closeActions);
    document.addEventListener('keydown', closeActions);
    window.addEventListener('resize', closeActions);
    window.addEventListener('scroll', closeActions, true);
    return () => {
      document.removeEventListener('click', closeActions);
      document.removeEventListener('keydown', closeActions);
      window.removeEventListener('resize', closeActions);
      window.removeEventListener('scroll', closeActions, true);
    };
  }, []);

  const toggleActionsMenu = (bookingId, triggerElement) => {
    setOpenActions((current) => {
      if (current.id === bookingId) {
        return { id: null, direction: 'down', top: 0, bottom: 0, right: 0 };
      }
      const rect = triggerElement.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const direction = spaceBelow < 150 && spaceAbove > spaceBelow ? 'up' : 'down';
      return {
        id: bookingId,
        direction,
        top: Math.min(window.innerHeight - 12, rect.bottom + 8),
        bottom: Math.max(12, window.innerHeight - (rect.top - 8)),
        right: Math.max(12, window.innerWidth - rect.right),
      };
    });
  };

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    fetchBookings(controller.signal, { windowType: performanceWindow })
      .then((loadedBookings) => setBookings(loadedBookings))
      .catch((err) => { if (err.name !== 'AbortError') setError(err.message || t('booking.errorLoad')); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [performanceWindow, t]);

  useEffect(() => {
    const controller = new AbortController();
    setTargetKocsLoading(true);
    const timeout = window.setTimeout(() => {
      fetchBookingTargetKocs({
        keyword: targetKocQuery.trim(),
        page: targetKocPage,
        pageSize: 20,
        signal: controller.signal,
      })
        .then((payload) => {
          const items = payload.items || [];
          setTargetKocs((current) => targetKocPage === 1
            ? items
            : [...current, ...items.filter((item) => (
              !current.some((existing) => targetKocKey(existing) === targetKocKey(item))
            ))]);
          setTargetKocPagination(payload.pagination || { page: targetKocPage, total_pages: targetKocPage });
        })
        .catch((err) => { if (err.name !== 'AbortError') setError(err.message || t('booking.errorLoad')); })
        .finally(() => { if (!controller.signal.aborted) setTargetKocsLoading(false); });
    }, 250);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [targetKocPage, targetKocQuery, t]);

  const selectedKocSummary = useMemo(
    () => targetKocs.find((creator) => targetKocKey(creator) === form.creator_key) || null,
    [form.creator_key, targetKocs],
  );
  const selectedKoc = selectedKocDetail?.key === form.creator_key ? selectedKocDetail.creator : null;

  useEffect(() => {
    if (!selectedKocSummary || !form.creator_key) {
      setSelectedKocDetail(null);
      return undefined;
    }
    const controller = new AbortController();
    setSelectedKocDetail(null);
    fetchBookingTargetKocDetail({
      shopId: selectedKocSummary.shop_id,
      creatorOpenId: selectedKocSummary.creator_open_id,
      username: selectedKocSummary.username,
      signal: controller.signal,
    })
      .then((creator) => setSelectedKocDetail({ key: form.creator_key, creator }))
      .catch((err) => { if (err.name !== 'AbortError') setError(err.message || t('booking.errorLoad')); });
    return () => controller.abort();
  }, [form.creator_key, selectedKocSummary, t]);
  const stats = useMemo(() => bookings.reduce((result, booking) => {
    const collaboration = collaborationOf(booking);
    const rawCost = finiteNumber(booking.total_cost ?? booking.booking_cost);
    const convertedCost = convertAmount(rawCost, booking.currency);
    result.total += 1;
    result.totalCost += convertedCost ?? rawCost;
    if (ACTIVE_COLLABORATION_STATUSES.has(collaboration.status)) result.active += 1;
    if (performanceOf(booking)) result.withPerformance += 1;
    return result;
  }, { total: 0, active: 0, withPerformance: 0, totalCost: 0 }), [bookings, convertAmount]);

  const costBenchmarks = (cost, performance) => {
    const videoViews = finiteNumber(performance?.video_views);
    const affiliateOrders = finiteNumber(performance?.affiliate_orders);
    const rawAffiliateGmv = finiteNumber(performance?.affiliate_gmv);
    const affiliateGmv = convertAmount(rawAffiliateGmv, performance?.currency) ?? rawAffiliateGmv;
    return {
      perThousandViews: videoViews > 0 ? finiteNumber(cost) / videoViews * 1000 : null,
      perOrder: affiliateOrders > 0 ? finiteNumber(cost) / affiliateOrders : null,
      gmvRatio: affiliateGmv > 0 ? finiteNumber(cost) / affiliateGmv * 100 : null,
    };
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!selectedKoc) return;
    try {
      setSaving(true);
      setError('');
      const created = await createBooking({
        target_shop_id: selectedKoc.shop_id,
        target_collaboration_id: selectedKoc.collaboration_id || null,
        creator_open_id: selectedKoc.creator_open_id,
        creator_username: selectedKoc.username,
        total_cost: Number(form.total_cost),
        currency: selectedCurrency,
      });
      setBookings((items) => [created, ...items]);
      fetchBookings(undefined, { windowType: performanceWindow }).then(setBookings).catch(() => {});
      setForm(initialForm);
    } catch (err) {
      setError(err.message || t('booking.errorCreate'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (booking) => {
    if (!window.confirm(t('booking.deleteConfirm', { id: booking.id }))) return;
    try {
      setDeletingId(booking.id);
      setError('');
      await deleteBooking(booking.id);
      setBookings((items) => items.filter((item) => item.id !== booking.id));
      if (selectedBooking?.id === booking.id) setSelectedBooking(null);
    } catch (err) {
      setError(err.message || t('booking.errorDelete'));
    } finally {
      setDeletingId(null);
    }
  };

  const replaceBooking = (updated) => {
    setBookings((items) => items.map((item) => item.id === updated.id
      ? {
        ...updated,
        ...(Object.prototype.hasOwnProperty.call(item, 'reference_performance')
          ? { reference_performance: item.reference_performance }
          : {}),
      }
      : item));
    setSelectedBooking((current) => current?.id === updated.id
      ? {
        ...updated,
        ...(Object.prototype.hasOwnProperty.call(current, 'reference_performance')
          ? { reference_performance: current.reference_performance }
          : {}),
      }
      : current);
  };

  const findBookingVideo = async (booking, videoId, videoUrl) => {
    try {
      setMatchingVideoId(booking.id);
      setError('');
      const result = await matchBookingVideo(booking.id, { videoId, videoUrl });
      if (result.status === 'matched') {
        replaceBooking(result.booking);
        setVideoMatchDialog(null);
        return;
      }
      if (result.status === 'needs_confirmation') {
        setVideoMatchDialog({ booking, candidates: result.candidates || [], range: result.range });
        setManualVideoUrl('');
        return;
      }
      if (booking.video_platform_id) {
        setError(t('booking.videoRefreshNone'));
      } else {
        setVideoMatchDialog({ booking, candidates: [], range: result.range });
        setManualVideoUrl('');
      }
    } catch (err) {
      setError(err.message || t('booking.videoMatchError'));
    } finally {
      setMatchingVideoId(null);
    }
  };

  const saveCost = async (event) => {
    event.preventDefault();
    try {
      setUpdatingId(selectedBooking.id);
      const updated = await updateBooking(selectedBooking.id, {
        total_cost: Number(detailCost),
        currency: selectedCurrency,
      });
      replaceBooking(updated);
    } catch (err) {
      setError(err.message || t('booking.errorUpdate'));
    } finally {
      setUpdatingId(null);
    }
  };

  const renderPerformance = (performance) => {
    if (!performance) return <span className="chip">{t('booking.noPerformance')}</span>;
    const gmv = optionalNumber(performance.affiliate_gmv);
    const views = optionalNumber(performance.video_views);
    return (
      <div className="booking-performance-cell">
        <strong>{gmv === null ? '—' : formatMoney(gmv, performance.currency)}</strong>
        <small>{views === null ? '—' : formatNumber(views)} {t('booking.views')}</small>
      </div>
    );
  };

  const renderActualPerformance = (booking) => {
    const actual = booking.actual_performance || {};
    if (!actual.video_count) return <span className="chip">{t('booking.awaitingVideo')}</span>;
    if (!actual.snapshot_count) {
      return <span className="chip">{t('booking.awaitingFirstSync')}</span>;
    }
    return (
      <div className="booking-performance-cell">
        <strong>{formatMoney(actual.gross_gmv, actual.currency)}</strong>
        <small>{formatNumber(actual.views)} {t('booking.views')}</small>
      </div>
    );
  };

  const creatorMetric = (performance, field, { money = false } = {}) => {
    const value = optionalNumber(performance?.[field]);
    if (value === null) return '—';
    return money ? formatMoney(value, performance.currency) : formatNumber(value);
  };

  return (
    <div className="page">
      <section className="page__hero">
        <div><h1 className="page__title">{t('booking.heroTitle') || heroTitle}</h1></div>
        <div className="page__stats booking-stats booking-stats--evaluation">
          <article className="stat-card"><p className="stat-card__label">{t('booking.evaluations')}</p><p className="stat-card__value">{stats.total}</p></article>
          <article className="stat-card"><p className="stat-card__label">{t('booking.activeCollaborations')}</p><p className="stat-card__value">{stats.active}</p></article>
          <article className="stat-card"><p className="stat-card__label">{t('booking.performanceCoverage')}</p><p className="stat-card__value">{stats.total ? Math.round(stats.withPerformance / stats.total * 100) : 0}%</p></article>
          <article className="stat-card"><p className="stat-card__label">{t('booking.totalCost')}</p><p className="stat-card__value">{formatMoney(stats.totalCost, selectedCurrency)}</p></article>
        </div>
      </section>

      {error ? <section className="section-card empty-state empty-state--compact" role="alert">{error}</section> : null}

      <section className="section-card">
        <div className="section-card__header"><div><h2 className="section-card__title">{t('booking.createEvaluation')}</h2></div></div>
        <form className="filter-panel booking-evaluation-form" onSubmit={handleSubmit}>
          <div className="field"><label>{t('booking.targetCreator')}</label><TargetKocCombobox creators={targetKocs} value={form.creator_key} onChange={(value) => setForm((current) => ({ ...current, creator_key: value }))} onSearch={(keyword) => { setTargetKocQuery(keyword); setTargetKocPage(1); }} onLoadMore={() => setTargetKocPage((current) => current + 1)} hasMore={targetKocPagination.page < targetKocPagination.total_pages} loading={targetKocsLoading} placeholder={t('booking.searchKoc')} noResults={t('booking.noSyncedCollaboration')} performanceSourceLabel={t('booking.creatorPerformance')} collaborationLabel={t('booking.collaboration')} loadMoreLabel={t('booking.loadMoreKocs')} loadingLabel={t('booking.loadingKocs')} /></div>
          <div className="field"><label htmlFor="total_cost">{t('booking.totalCost')} ({currencyLabel})</label><input id="total_cost" type="number" min="0" step={selectedCurrency === 'VND' ? '1' : '0.01'} inputMode="decimal" value={form.total_cost} onChange={(event) => setForm((current) => ({ ...current, total_cost: event.target.value }))} required /></div>
          <div className="actions"><button className="button" type="submit" disabled={saving || !selectedKoc}>{saving ? t('booking.submitting') : t('booking.evaluate')}</button></div>
        </form>
        {selectedKoc ? (
          <div className="booking-source-preview">
            {selectedKoc.collaboration_id ? <div><span>{t('booking.collaboration')}</span><strong>{selectedKoc.collaboration_name || selectedKoc.collaboration_id}</strong><small>{formatCollaborationStatus(selectedKoc.collaboration_status)} · {t('booking.validUntil')} {formatDate(selectedKoc.collaboration_end_at)}</small></div> : null}
            <div><span>{t('booking.creatorPerformance')}</span>{renderPerformance(selectedKoc.performance)}</div>
          </div>
        ) : null}
      </section>

      <section className="section-card">
        <div className="section-card__header booking-evaluation-list-header"><div><h2 className="section-card__title">{t('booking.evaluationList')}</h2></div><div className="field booking-performance-period"><label htmlFor="booking-performance-window">{t('booking.performancePeriod')}</label><select id="booking-performance-window" value={performanceWindow} onChange={(event) => setPerformanceWindow(event.target.value)}><option value="PAST_7_DAYS">{t('booking.period7Days')}</option><option value="PAST_30_DAYS">{t('booking.period30Days')}</option><option value="PAST_60_DAYS">{t('booking.period60Days')}</option><option value="PAST_90_DAYS">{t('booking.period90Days')}</option><option value="PAST_120_DAYS">{t('booking.period120Days')}</option><option value="PAST_150_DAYS">{t('booking.period150Days')}</option><option value="PAST_180_DAYS">{t('booking.period180Days')}</option></select></div></div>
        <div className="table-wrap"><table className="data-table booking-evaluation-table">
          <thead>
            <tr><th>{t('booking.kocColumn')}</th><th>{t('booking.creatorPerformance')}</th><th className="cell-number">{t('booking.totalCost')}</th><th>{t('booking.matchedVideo')}</th><th className="cell-number">{t('booking.refunds')}</th><th className="cell-number">{t('booking.products')}</th><th className="cell-number booking-samples-column">{t('booking.samplesShipped')}</th><th className="cell-number">{t('booking.estimatedCommission')}</th><th className="cell-actions">{t('booking.actionsColumn')}</th></tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={9}><div className="empty-state"><span className="loading-dot" />{t('booking.loading')}</div></td></tr> : bookings.length ? bookings.map((booking) => {
              const performance = performanceOf(booking);
              const bookingVideos = bookingVideosOf(booking);
              const videoCount = bookingVideos.length || Number(booking.actual_performance?.video_count || 0);
              const expanded = String(expandedBookingId) === String(booking.id);
              return <React.Fragment key={booking.id}>
              <tr className={expanded ? 'booking-row booking-row--expanded' : 'booking-row'} onClick={(event) => toggleBookingRow(event, booking.id)}>
                <td><div className="booking-koc-identity"><TargetKocAvatar src={booking.creator_avatar_url} name={booking.creator_name || booking.creator_username} /><span><strong>{booking.creator_name || booking.creator_username || 'KOC'}</strong><small>@{booking.creator_username}</small></span></div></td>
                <td>{renderPerformance(performance)}</td>
                <td className="cell-number"><strong>{formatMoney(booking.total_cost ?? booking.booking_cost, booking.currency)}</strong></td>
                <td><span className="booking-video-count"><span className={`sidebar__chevron${expanded ? ' sidebar__chevron--open' : ''}`} aria-hidden="true" /><strong>{t('booking.videosCount', { count: videoCount })}</strong></span></td>
                <td className="cell-number">{creatorMetric(performance, 'refunded_gmv', { money: true })}</td>
                <td className="cell-number"><div className="booking-product-summary"><strong>{creatorMetric(performance, 'items_sold')} <span>{t('booking.itemsSold')}</span></strong><small>{creatorMetric(performance, 'items_refunded')} {t('booking.refundedShort')}</small></div></td>
                <td className="cell-number booking-samples-column">{creatorMetric(performance, 'samples_shipped')}</td>
                <td className="cell-number">{creatorMetric(performance, 'estimated_commission', { money: true })}</td>
                <td className="cell-actions">
                  <div className="action-menu booking-action-menu">
                    <button
                      className="action-menu__trigger"
                      type="button"
                      aria-haspopup="menu"
                      aria-expanded={openActions.id === booking.id}
                      aria-label={t('booking.actionsColumn')}
                      onClick={(event) => toggleActionsMenu(booking.id, event.currentTarget)}
                    >
                      •••
                    </button>
                    {openActions.id === booking.id ? createPortal(
                      <div
                        className={`action-menu__panel booking-action-menu booking-action-menu__popover action-menu__panel--${openActions.direction}`}
                        role="menu"
                        style={{
                          position: 'fixed',
                          right: `${openActions.right}px`,
                          top: openActions.direction === 'down' ? `${openActions.top}px` : 'auto',
                          bottom: openActions.direction === 'up' ? `${openActions.bottom}px` : 'auto',
                        }}
                      >
                      <button
                        type="button"
                        className="action-menu__item"
                        role="menuitem"
                        onClick={() => {
                          setOpenActions({ id: null, direction: 'down', top: 0, bottom: 0, right: 0 });
                          setSelectedBooking(booking);
                          const rawCost = booking.total_cost ?? booking.booking_cost;
                          setDetailCost(editableCurrencyAmount(convertAmount(rawCost, booking.currency) ?? rawCost, selectedCurrency));
                        }}
                      >
                        {t('booking.details')}
                      </button>
                      <button
                        type="button"
                        className="action-menu__item action-menu__item--danger"
                        disabled={deletingId === booking.id}
                        role="menuitem"
                        onClick={() => {
                          setOpenActions({ id: null, direction: 'down', top: 0, bottom: 0, right: 0 });
                          handleDelete(booking);
                        }}
                      >
                        {deletingId === booking.id ? t('booking.deleting') : t('booking.delete')}
                      </button>
                      </div>
                      ,
                      document.body,
                    ) : null}
                  </div>
                </td>
              </tr>
              {expanded ? <tr className="booking-video-detail-row"><td colSpan={9}><div className="booking-video-expansion">
                {bookingVideos.length ? <div className="booking-video-expansion__list">{bookingVideos.map((video, videoIndex) => {
                  const latest = latestBookingVideoSnapshot(video);
                  const social = bookingVideoSocialMetrics(latest);
                  return <article className="booking-video-expansion__item" key={video.id || video.platform_video_id}>
                    <div className="booking-video-expansion__identity">
                      <div className="booking-video-expansion__title">
                        <BookingVideoThumbnail shopId={booking.target_shop_id} video={video} snapshot={latest} index={videoIndex} />
                        <div>
                          {video.video_url ? <a href={video.video_url} target="_blank" rel="noreferrer"><strong>{video.title || video.platform_video_id}</strong><span aria-hidden="true"> ↗</span></a> : <strong>{video.title || video.platform_video_id}</strong>}
                          <small>{t('booking.postedAt')} {formatDate(video.posted_at)}</small>
                          <span className="booking-video-expansion__social">
                            <span title={`${t('booking.videoViews')}: ${formatNumber(social.views)}`}><BookingVideoIcon name="views" />{formatNumber(social.views)}</span>
                            <span title={`${t('videoLibrary.likes')}: ${formatNumber(social.likes)}`}><BookingVideoIcon name="likes" />{formatNumber(social.likes)}</span>
                            <span title={`${t('videoLibrary.comments')}: ${formatNumber(social.comments)}`}><BookingVideoIcon name="comments" />{formatNumber(social.comments)}</span>
                            <span title={`${t('videoLibrary.shares')}: ${formatNumber(social.shares)}`}><BookingVideoIcon name="shares" />{formatNumber(social.shares)}</span>
                          </span>
                        </div>
                      </div>
                    </div>
                    {latest ? <div className="booking-video-expansion__metrics">
                      <div><span>{t('booking.videoGmv')}</span><strong>{formatMoney(latest.gross_gmv, latest.currency || booking.currency)}</strong></div>
                      <div><span>{t('booking.videoItemsSold')}</span><strong>{formatNumber(latest.items_sold)}</strong></div>
                      <div><span>{t('booking.videoCtr')}</span><strong>{formatRate(latest.ctr)}</strong></div>
                      <BookingVideoProducts shopId={booking.target_shop_id} video={video} snapshot={latest} label={t('booking.products')} />
                    </div> : <div className="booking-video-expansion__pending"><span className="loading-dot" /><span>{t('booking.awaitingFirstSync')}</span></div>}
                    {video.last_sync_error ? <p className="booking-video-expansion__error">{video.last_sync_error}</p> : null}
                  </article>;
                })}</div> : <div className="empty-state empty-state--compact">{t('booking.awaitingVideo')}</div>}
              </div></td></tr> : null}
              </React.Fragment>;
            }) : <tr><td colSpan={9}><div className="empty-state">{t('booking.noEvaluations')}</div></td></tr>}
          </tbody>
        </table></div>
      </section>

      {videoMatchDialog ? (
        <div className="koc-drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setVideoMatchDialog(null); }}>
          <aside className="koc-drawer booking-video-match-drawer" role="dialog" aria-modal="true" aria-labelledby="booking-video-match-title">
            <div className="koc-drawer__header"><div><h2 id="booking-video-match-title">{t('booking.videoCandidatesTitle')}</h2></div><button className="button button--ghost" type="button" aria-label={t('common.close')} onClick={() => setVideoMatchDialog(null)}>×</button></div>
            <div className="koc-drawer__body">
              {videoMatchDialog.candidates.length ? <div className="booking-video-candidates">{videoMatchDialog.candidates.map((candidate) => <button className="booking-video-candidate" type="button" key={candidate.id} disabled={matchingVideoId === videoMatchDialog.booking.id} onClick={() => findBookingVideo(videoMatchDialog.booking, candidate.id)}><span><strong>{candidate.title || candidate.id}</strong><small>@{candidate.username} · {formatDate(candidate.posted_at)}</small></span><span><strong>{formatMoney(candidate.gmv?.amount, candidate.gmv?.currency)}</strong><small>{formatNumber(candidate.views)} {t('booking.views')} · {formatNumber(candidate.orders)} {t('booking.orders')}</small></span></button>)}</div> : <p className="section-card__meta">{t('booking.videoMatchNone')}</p>}
              <form className="booking-video-manual" onSubmit={(event) => { event.preventDefault(); findBookingVideo(videoMatchDialog.booking, null, manualVideoUrl); }}>
                <label className="field"><span>{t('booking.manualVideoUrl')}</span><input type="url" required value={manualVideoUrl} placeholder="https://www.tiktok.com/@username/video/..." onChange={(event) => setManualVideoUrl(event.target.value)} /></label>
                <button className="button" type="submit" disabled={matchingVideoId === videoMatchDialog.booking.id}>{matchingVideoId === videoMatchDialog.booking.id ? t('booking.linkingVideo') : t('booking.linkVideo')}</button>
              </form>
            </div>
          </aside>
        </div>
      ) : null}

      {selectedBooking ? (() => {
        const collaboration = collaborationOf(selectedBooking);
        const performance = performanceOf(selectedBooking);
        const videoMatch = videoMatchOf(selectedBooking);
        const benchmark = costBenchmarks(detailCost, performance);
        return <div className="koc-drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedBooking(null); }}>
          <aside className="koc-drawer booking-detail-drawer" role="dialog" aria-modal="true" aria-labelledby="booking-detail-title">
            <div className="koc-drawer__header"><div><h2 id="booking-detail-title">{t('booking.detailTitle', { id: selectedBooking.id })}</h2><p>@{selectedBooking.creator_username}</p></div><button className="button button--ghost" type="button" aria-label={t('common.close')} onClick={() => setSelectedBooking(null)}>×</button></div>
            <div className="koc-drawer__body">
              <section className="drawer-section"><div className="drawer-profile"><TargetKocAvatar src={selectedBooking.creator_avatar_url} name={selectedBooking.creator_name} /><div><strong>{selectedBooking.creator_name || selectedBooking.creator_username}</strong><span>{collaboration.name || selectedBooking.target_collaboration_id || t('booking.creatorPerformance')}</span></div></div></section>
              {collaboration.id ? <section className="drawer-section"><h3>{t('booking.collaboration')}</h3><div className="booking-detail-grid"><div><span>{t('booking.partnerStatus')}</span><strong>{formatCollaborationStatus(collaboration.status)}</strong></div><div><span>{t('booking.validUntil')}</span><strong>{formatDate(collaboration.end_at)}</strong></div><div className="booking-detail-grid__wide"><span>{t('booking.products')}</span><strong>{(collaboration.products || []).map((product) => product.title || product.name || product.id).filter(Boolean).join(', ') || '—'}</strong></div></div></section> : null}
              <section className="drawer-section"><h3>{t('booking.creatorPerformance')}</h3>{renderPerformance(performance)}<p className="section-card__meta">{t('booking.performancePeriodDisclaimer')}</p></section>
              <section className="drawer-section"><h3>{t('booking.matchedVideo')}</h3>{selectedBooking.video_platform_id ? <div className="booking-performance-cell"><strong>{videoMatch?.title || selectedBooking.video_platform_id}</strong>{selectedBooking.video_url ? <a href={selectedBooking.video_url} target="_blank" rel="noreferrer">{t('booking.openMatchedVideo')} ↗</a> : null}{videoMatch ? <small>{formatMoney(videoMatch.gmv?.amount, videoMatch.gmv?.currency)} · {formatNumber(videoMatch.views)} {t('booking.views')} · {formatNumber(videoMatch.orders)} {t('booking.orders')}</small> : null}<small>{formatDate(selectedBooking.posted_at)}</small><button className="button button--ghost" type="button" disabled={matchingVideoId === selectedBooking.id} onClick={() => findBookingVideo(selectedBooking)}>{matchingVideoId === selectedBooking.id ? t('booking.refreshingVideo') : t('booking.refreshVideo')}</button></div> : <button className="button button--ghost" type="button" disabled={matchingVideoId === selectedBooking.id} onClick={() => findBookingVideo(selectedBooking)}>{matchingVideoId === selectedBooking.id ? t('booking.findingVideo') : t('booking.findVideo')}</button>}</section>
              <section className="drawer-section"><h3>{t('booking.actualResults')}</h3>{renderActualPerformance(selectedBooking)}</section>
              <form className="booking-detail-form" onSubmit={saveCost}>
                <label className="field booking-detail-form__wide"><span>{t('booking.totalCost')} ({currencyLabel})</span><input type="number" min="0" step={selectedCurrency === 'VND' ? '1' : '0.01'} value={detailCost} onChange={(event) => setDetailCost(event.target.value)} required /></label>
                <div className="booking-detail-grid booking-detail-form__wide"><div><span>{t('booking.costPerThousandViews')}</span><strong>{benchmark.perThousandViews == null ? '—' : formatMoney(benchmark.perThousandViews, selectedCurrency)}</strong></div><div><span>{t('booking.costPerOrder')}</span><strong>{benchmark.perOrder == null ? '—' : formatMoney(benchmark.perOrder, selectedCurrency)}</strong></div><div><span>{t('booking.costGmvRatio')}</span><strong>{benchmark.gmvRatio == null ? '—' : `${formatNumber(benchmark.gmvRatio, { maximumFractionDigits: 2 })}%`}</strong></div></div>
                <div className="actions booking-detail-form__wide"><button className="button" type="submit" disabled={updatingId === selectedBooking.id}>{updatingId === selectedBooking.id ? t('common.loading') : t('booking.saveCost')}</button></div>
              </form>
            </div>
          </aside>
        </div>;
      })() : null}
    </div>
  );
};

export default BookingManagement;
