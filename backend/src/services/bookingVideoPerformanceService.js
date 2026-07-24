const { Op } = require('sequelize');
const {
  BookingVideo,
  BookingVideoPerformanceSnapshot,
  TikTokShop,
} = require('../models');
const { getShopVideoPerformance } = require('./tiktokShopService');
const { isDemoAuthorization, sellerAffiliateFixture } = require('../lib/tiktokDemoFixtures');

const dateOnly = (value = new Date()) => new Date(value).toISOString().slice(0, 10);
const shiftDate = (value, days) => {
  const date = new Date(`${dateOnly(value)}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return dateOnly(date);
};
const numberOrZero = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const usernameOf = (video) => String(
  video?.creator?.user_name || video?.creator?.username || video?.username || '',
).trim().replace(/^@+/, '').toLowerCase();
const postedAtOf = (video) => {
  const raw = String(video?.video_post_time || video?.post_time || '').trim();
  if (!raw) return null;
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const parsed = new Date(/[zZ]|[+-]\d\d:\d\d$/.test(normalized) ? normalized : `${normalized}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};
const metricOf = (video) => {
  const gmv = video?.gmv && typeof video.gmv === 'object'
    ? video.gmv
    : { amount: video?.gmv, currency: null };
  return {
    gross_gmv: numberOrZero(gmv?.amount),
    refunded_gmv: null,
    net_gmv: null,
    orders: numberOrZero(video?.sku_orders ?? video?.orders),
    items_sold: numberOrZero(video?.items_sold ?? video?.units_sold),
    views: numberOrZero(video?.views ?? video?.video_views),
    ctr: video?.click_through_rate ?? video?.ctr ?? null,
    currency: gmv?.currency || null,
    raw_metrics: video,
  };
};

const bookingVideoInclude = [{
  model: BookingVideoPerformanceSnapshot,
  as: 'performance_snapshots',
  required: false,
}];

const recordBookingVideoMatch = async (booking, candidate, source, now = new Date()) => {
  const attributionStart = dateOnly(candidate.posted_at || booking.created_at || now);
  const [video] = await BookingVideo.upsert({
    booking_id: booking.id,
    platform_video_id: String(candidate.id),
    video_url: candidate.video_url || null,
    creator_username: candidate.username || booking.creator_username || null,
    title: candidate.title || 'TikTok video',
    posted_at: candidate.posted_at || null,
    attribution_start: attributionStart,
    attribution_end: shiftDate(attributionStart, 30),
    mapping_source: source,
    status: 'COLLECTING',
    last_synced_at: candidate.manually_confirmed ? null : now,
    last_sync_error: null,
    updated_at: now,
  }, { returning: true });

  if (!candidate.manually_confirmed && !candidate.cached_catalog) {
    await BookingVideoPerformanceSnapshot.upsert({
      booking_video_id: video.id,
      snapshot_date: dateOnly(now),
      gross_gmv: numberOrZero(candidate.gmv?.amount),
      refunded_gmv: null,
      net_gmv: null,
      orders: numberOrZero(candidate.orders),
      items_sold: numberOrZero(candidate.items_sold),
      views: numberOrZero(candidate.views),
      ctr: candidate.ctr ?? null,
      currency: candidate.gmv?.currency || null,
      raw_metrics: candidate,
      synced_at: now,
    });
  }
  return video;
};

const loadVideoPerformance = async (shop, bookingVideo) => {
  const queryEnd = shiftDate(
    new Date() < new Date(`${bookingVideo.attribution_end}T23:59:59.999Z`)
      ? new Date()
      : bookingVideo.attribution_end,
    1,
  );
  let pageToken = null;
  const configuredMaxPages = Number(process.env.BOOKING_VIDEO_SYNC_MAX_PAGES);
  const maxPages = Number.isInteger(configuredMaxPages)
    ? Math.min(500, Math.max(1, configuredMaxPages))
    : 200;
  for (let page = 0; page < maxPages; page += 1) {
    const payload = isDemoAuthorization(shop.authorization)
      ? sellerAffiliateFixture('shop-video-performance', shop, {
        account_type: 'AFFILIATE_ACCOUNTS',
        currency: 'LOCAL',
      })
      : await getShopVideoPerformance({
        authorization: shop.authorization,
        shopCipher: shop.cipher,
        startDate: bookingVideo.attribution_start,
        endDate: queryEnd,
        currency: 'LOCAL',
        accountType: 'AFFILIATE_ACCOUNTS',
        sortField: 'gmv',
        sortOrder: 'DESC',
        pageSize: 100,
        pageToken,
      });
    const matched = (payload.data?.videos || []).find((video) => (
      String(video.id || video.video_id) === String(bookingVideo.platform_video_id)
    ));
    if (matched) return matched;
    pageToken = payload.data?.next_page_token || null;
    if (!pageToken) break;
    if (page === maxPages - 1) {
      throw new Error(`Booking video sync reached the safety limit of ${maxPages} pages before finding the end of TikTok pagination.`);
    }
  }
  return null;
};

const syncBookingVideo = async (bookingVideo, { shop: suppliedShop, now = new Date(), signal } = {}) => {
  if (signal?.aborted) {
    const error = new Error('Job was stopped by the user.');
    error.name = 'AbortError';
    throw error;
  }
  const booking = bookingVideo.booking;
  const shop = suppliedShop || await TikTokShop.findByPk(booking?.target_shop_id, {
    include: [{ association: 'authorization' }],
  });
  if (!shop?.authorization) throw new Error('TikTok Shop is not connected.');
  try {
    const rawVideo = await loadVideoPerformance(shop, bookingVideo);
    if (!rawVideo) throw new Error('Video was not returned by TikTok Shop Video Performance.');
    const metrics = metricOf(rawVideo);
    const detectedPostedAt = postedAtOf(rawVideo);
    await BookingVideoPerformanceSnapshot.upsert({
      booking_video_id: bookingVideo.id,
      snapshot_date: dateOnly(now),
      ...metrics,
      synced_at: now,
    });
    const effectiveAttributionEnd = detectedPostedAt
      ? shiftDate(detectedPostedAt, 30)
      : bookingVideo.attribution_end;
    const finalized = dateOnly(now) > effectiveAttributionEnd;
    await bookingVideo.update({
      creator_username: usernameOf(rawVideo) || bookingVideo.creator_username,
      title: rawVideo.title || bookingVideo.title,
      posted_at: detectedPostedAt || bookingVideo.posted_at,
      ...(detectedPostedAt ? {
        attribution_start: dateOnly(detectedPostedAt),
        attribution_end: effectiveAttributionEnd,
      } : {}),
      status: finalized ? 'FINALIZED' : 'COLLECTING',
      last_synced_at: now,
      last_sync_error: null,
      updated_at: now,
    });
    return { booking_video_id: bookingVideo.id, platform_video_id: bookingVideo.platform_video_id, status: 'SUCCEEDED' };
  } catch (error) {
    await bookingVideo.update({
      status: 'SYNC_FAILED',
      last_synced_at: now,
      last_sync_error: String(error.message || error).slice(0, 4000),
      updated_at: now,
    });
    throw error;
  }
};

const syncActiveBookingVideos = async ({ signal, now = new Date() } = {}) => {
  const videos = await BookingVideo.findAll({
    where: {
      status: { [Op.in]: ['COLLECTING', 'SYNC_FAILED'] },
    },
    include: [{ association: 'booking', required: true }],
    order: [['id', 'ASC']],
  });
  const results = [];
  for (const video of videos) {
    if (signal?.aborted) {
      const error = new Error('Job was stopped by the user.');
      error.name = 'AbortError';
      throw error;
    }
    if (video.attribution_end < dateOnly(now)) {
      await video.update({ status: 'FINALIZED', updated_at: now });
      results.push({
        booking_video_id: video.id,
        platform_video_id: video.platform_video_id,
        status: 'SUCCEEDED',
        finalized: true,
      });
      continue;
    }
    try {
      results.push(await syncBookingVideo(video, { now, signal }));
    } catch (error) {
      if (signal?.aborted || error.name === 'AbortError') throw error;
      results.push({
        booking_video_id: video.id,
        platform_video_id: video.platform_video_id,
        status: 'FAILED',
        error: error.message,
      });
    }
  }
  return {
    total: results.length,
    succeeded: results.filter((item) => item.status === 'SUCCEEDED').length,
    failed: results.filter((item) => item.status === 'FAILED').length,
    results,
  };
};

const latestSnapshot = (video) => [...(video.performance_snapshots || [])]
  .sort((left, right) => (
    String(right.snapshot_date || '').localeCompare(String(left.snapshot_date || ''))
    || new Date(right.synced_at || 0) - new Date(left.synced_at || 0)
  ))[0] || null;

const calculateActualPerformance = (booking) => {
  const videos = booking.booking_videos || [];
  const latest = videos.map(latestSnapshot).filter(Boolean);
  const bookingCost = numberOrZero(booking.booking_cost);
  const grossGmv = latest.reduce((sum, row) => sum + numberOrZero(row.gross_gmv), 0);
  const hasCompleteRefunds = latest.length > 0 && latest.every((row) => row.refunded_gmv !== null && row.refunded_gmv !== undefined);
  const refundedGmv = hasCompleteRefunds
    ? latest.reduce((sum, row) => sum + numberOrZero(row.refunded_gmv), 0)
    : null;
  const netGmv = hasCompleteRefunds ? grossGmv - refundedGmv : null;
  const statuses = new Set(videos.map((video) => video.status));
  const status = !videos.length ? 'AWAITING_VIDEO'
    : statuses.has('COLLECTING') ? 'COLLECTING'
      : statuses.has('SYNC_FAILED') ? 'SYNC_FAILED' : 'FINALIZED';
  return {
    status,
    attribution_days: 30,
    video_count: videos.length,
    snapshot_count: latest.length,
    gross_gmv: grossGmv,
    refunded_gmv: refundedGmv,
    net_gmv: netGmv,
    orders: latest.reduce((sum, row) => sum + numberOrZero(row.orders), 0),
    items_sold: latest.reduce((sum, row) => sum + numberOrZero(row.items_sold), 0),
    views: latest.reduce((sum, row) => sum + numberOrZero(row.views), 0),
    currency: latest.find((row) => row.currency)?.currency || null,
    gross_roas: bookingCost > 0 && latest.length ? grossGmv / bookingCost : null,
    net_roas: bookingCost > 0 && netGmv !== null ? netGmv / bookingCost : null,
    roi: null,
    roi_status: 'MISSING_COST_DATA',
    roi_missing_fields: ['cost_of_goods', 'platform_fee', 'affiliate_commission', 'sample_shipping_cost'],
  };
};

const serializeBookingWithActual = (instance) => {
  const booking = typeof instance?.toJSON === 'function' ? instance.toJSON() : { ...instance };
  return { ...booking, actual_performance: calculateActualPerformance(booking) };
};

module.exports = {
  bookingVideoInclude,
  calculateActualPerformance,
  recordBookingVideoMatch,
  serializeBookingWithActual,
  syncActiveBookingVideos,
  syncBookingVideo,
  __test: { dateOnly, shiftDate, metricOf, latestSnapshot },
};
