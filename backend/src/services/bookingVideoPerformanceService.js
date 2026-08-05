const { Op } = require('sequelize');
const {
  Booking,
  BookingVideo,
  BookingVideoPerformanceSnapshot,
  TikTokCreatorPerformanceExport,
  TikTokShop,
  TikTokVideoPerformanceSnapshot,
} = require('../models');

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
const exportDurationDays = (exportRecord) => {
  const start = Date.parse(`${exportRecord?.start_date}T00:00:00.000Z`);
  const end = Date.parse(`${exportRecord?.end_date}T00:00:00.000Z`);
  return Number.isFinite(start) && Number.isFinite(end) ? Math.round((end - start) / 86400000) : null;
};

const metricOfAffiliateSnapshot = (snapshot) => ({
  gross_gmv: numberOrZero(snapshot.creator_attributed_gmv),
  refunded_gmv: null,
  net_gmv: null,
  orders: numberOrZero(snapshot.attributed_orders),
  items_sold: numberOrZero(snapshot.attributed_items_sold),
  views: numberOrZero(snapshot.video_views),
  ctr: snapshot.ctr ?? null,
  currency: snapshot.raw_metrics?.detail?.performance?.intervals?.[0]?.sales?.overall?.gmv?.currency
    || snapshot.raw_metrics?.list?.gmv?.currency
    || null,
  raw_metrics: {
    source: 'AFFILIATE_VIDEO_PERFORMANCE',
    export_id: snapshot.export_id,
    video: snapshot.raw_metrics,
  },
});

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

const loadAffiliateVideoPerformance = async (shopId, videoId) => {
  const recentExports = await TikTokCreatorPerformanceExport.findAll({
    where: {
      shop_id: shopId,
      module_type: 'VIDEO_API',
      status: 'SUCCEEDED',
    },
    attributes: ['id', 'start_date', 'end_date'],
    order: [['end_date', 'DESC'], ['created_at', 'DESC']],
    limit: 20,
  });
  const findSnapshot = async (days) => {
    const exportIds = recentExports
      .filter((record) => exportDurationDays(record) === days)
      .map((record) => record.id);
    if (!exportIds.length) return null;
    return TikTokVideoPerformanceSnapshot.findOne({
      where: {
        export_id: { [Op.in]: exportIds },
        video_id: String(videoId),
      },
      order: [['export_id', 'DESC']],
    });
  };
  return (await findSnapshot(30)) || findSnapshot(7);
};

const affiliateCandidateFromSnapshot = (snapshot) => {
  const source = snapshot.raw_metrics?.list || {};
  const postedAt = postedAtOf({ video_post_time: snapshot.post_date, post_time: snapshot.post_date });
  return {
    id: String(snapshot.video_id),
    title: snapshot.video_title || source.title || snapshot.video_id,
    username: usernameOf(source),
    posted_at: postedAt,
    video_url: snapshot.video_link || null,
    gmv: {
      amount: numberOrZero(snapshot.creator_attributed_gmv),
      currency: snapshot.raw_metrics?.detail?.performance?.intervals?.[0]?.sales?.overall?.gmv?.currency
        || source.gmv?.currency
        || null,
    },
    views: numberOrZero(snapshot.video_views),
    orders: numberOrZero(snapshot.attributed_orders),
    items_sold: numberOrZero(snapshot.attributed_items_sold),
    ctr: snapshot.ctr ?? null,
  };
};

const autoLinkBookingVideos = async (booking, now = new Date()) => {
  const username = String(booking.creator_username || '').trim().replace(/^@+/, '').toLowerCase();
  if (!username || !booking.target_shop_id) return { status: 'missing_identity' };
  const recentExports = await TikTokCreatorPerformanceExport.findAll({
    where: {
      shop_id: booking.target_shop_id,
      module_type: 'VIDEO_API',
      status: 'SUCCEEDED',
    },
    attributes: ['id', 'start_date', 'end_date'],
    order: [['end_date', 'DESC'], ['created_at', 'DESC']],
    limit: 20,
  });
  const exportRecord = recentExports.find((record) => exportDurationDays(record) === 30)
    || recentExports.find((record) => exportDurationDays(record) === 7);
  if (!exportRecord) return { status: 'missing_snapshot' };
  const snapshots = await TikTokVideoPerformanceSnapshot.findAll({
    where: {
      export_id: exportRecord.id,
      video_link: { [Op.iLike]: `%/@${username}/video/%` },
    },
    order: [['post_date', 'DESC'], ['id', 'DESC']],
  });
  const candidates = snapshots.map(affiliateCandidateFromSnapshot);
  if (!candidates.length) return { status: 'no_match', candidate_count: 0 };
  const selected = candidates[0];
  const mappingSource = 'AFFILIATE_VIDEO_PERFORMANCE';
  await booking.update({
    video_platform_id: selected.id,
    video_url: selected.video_url,
    posted_at: selected.posted_at,
    evaluation_snapshot: {
      ...booking.evaluation_snapshot,
      video_match: {
        source: mappingSource,
        matched_at: new Date().toISOString(),
        video_count: candidates.length,
        ...selected,
      },
    },
    updated_at: now,
  });
  for (const candidate of candidates) {
    await recordBookingVideoMatch(booking, candidate, mappingSource, now);
  }
  return { status: 'matched', video_id: selected.id, video_count: candidates.length };
};

const autoLinkCreatorVideos = async (now, signal) => {
  const bookings = await Booking.findAll({
    where: {
      evaluation_snapshot: { [Op.not]: null },
      target_shop_id: { [Op.not]: null },
    },
    order: [['id', 'ASC']],
  });
  const results = [];
  for (const booking of bookings) {
    if (signal?.aborted) {
      const error = new Error('Job was stopped by the user.');
      error.name = 'AbortError';
      throw error;
    }
    results.push({ booking_id: booking.id, ...(await autoLinkBookingVideos(booking, now)) });
  }
  return results;
};

const syncBookingVideo = async (bookingVideo, { shop: suppliedShop, now = new Date(), signal } = {}) => {
  if (signal?.aborted) {
    const error = new Error('Job was stopped by the user.');
    error.name = 'AbortError';
    throw error;
  }
  const booking = bookingVideo.booking;
  const shop = suppliedShop || await TikTokShop.findByPk(booking?.target_shop_id);
  if (!shop) throw new Error('Booking is not linked to a TikTok Shop.');
  try {
    const affiliateSnapshot = await loadAffiliateVideoPerformance(shop.id, bookingVideo.platform_video_id);
    if (!affiliateSnapshot) {
      throw new Error('Video is not available in the latest Affiliate Video Performance snapshots.');
    }
    const sourceVideo = affiliateSnapshot.raw_metrics?.list || {};
    const metrics = metricOfAffiliateSnapshot(affiliateSnapshot);
    const detectedPostedAt = postedAtOf({
      video_post_time: affiliateSnapshot.post_date,
      post_time: affiliateSnapshot.post_date,
    });
    await BookingVideoPerformanceSnapshot.upsert({
      booking_video_id: bookingVideo.id,
      snapshot_date: dateOnly(now),
      ...metrics,
      synced_at: now,
    });
    await bookingVideo.update({
      creator_username: usernameOf(sourceVideo) || bookingVideo.creator_username,
      title: affiliateSnapshot.video_title || sourceVideo.title || bookingVideo.title,
      posted_at: detectedPostedAt || bookingVideo.posted_at,
      ...(detectedPostedAt ? {
        attribution_start: dateOnly(detectedPostedAt),
        attribution_end: shiftDate(detectedPostedAt, 30),
      } : {}),
      status: 'COLLECTING',
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
  const autoLinked = await autoLinkCreatorVideos(now, signal);
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
    auto_linked: autoLinked,
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
  const bookingCost = numberOrZero(booking.total_cost ?? booking.booking_cost);
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
    currency: latest.find((row) => row.currency)?.currency || booking.currency || null,
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
  autoLinkBookingVideos,
  bookingVideoInclude,
  calculateActualPerformance,
  recordBookingVideoMatch,
  serializeBookingWithActual,
  syncActiveBookingVideos,
  syncBookingVideo,
  __test: {
    dateOnly,
    shiftDate,
    metricOfAffiliateSnapshot,
    exportDurationDays,
    affiliateCandidateFromSnapshot,
    latestSnapshot,
  },
};
