const crypto = require('crypto');
const { Op, QueryTypes } = require('sequelize');
const {
  User, Booking, TikTokPartnerAuthorization, TikTokShop,
  TikTokTargetCollaborationSnapshot, TikTokCreatorPerformanceSnapshot,
  BookingVideo, BookingVideoPerformanceSnapshot,
  ShopVideo, ShopVideoPerformanceSnapshot, sequelize,
} = require('../models');
const { normalizeCreatorProfile } = require('../services/tiktokCreatorProfileService');
const {
  buildAuthorizationUrl,
  parseAuthorizationState,
  exchangeAuthorizationCode,
  getCreatorOverview,
  getCreatorProfileWithAccessToken,
  searchTargetCollaborations,
  tokenFields,
  grantedScopesOf,
  CREATOR_PROFILE_SCOPE,
} = require('../services/tiktokPartnerService');
const { getShopVideoPerformance } = require('../services/tiktokShopService');
const {
  recordBookingVideoMatch,
  serializeBookingWithActual,
  syncBookingVideo,
} = require('../services/bookingVideoPerformanceService');
const { handleShopOauthCallback } = require('./tiktokShopController');
const {
  creatorCollaborationsFixture,
  creatorOverviewFixture,
  isDemoAuthorization,
  sellerAffiliateFixture,
} = require('../lib/tiktokDemoFixtures');

const ALLOWED_STATUSES = new Set(['draft', 'booked', 'waiting_video', 'video_posted', 'done', 'cancelled']);

const compactPayload = (payload) => Object.fromEntries(
  Object.entries(payload).filter(([, value]) => value !== undefined),
);

const normalizeBookingVideoUrl = (value) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (Array.isArray(value)) {
    if (!value.length) return null;
    return JSON.stringify(value);
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
};

const dateOnly = (value) => new Date(value).toISOString().slice(0, 10);
const normalizedUsername = (value) => String(value || '').trim().replace(/^@+/, '').toLowerCase();
const tiktokVideoIdFromUrl = (value) => {
  const text = String(value || '').trim();
  if (!/^https?:\/\/(?:www\.)?tiktok\.com\//i.test(text)) return null;
  return text.match(/\/video\/(\d{10,30})(?:[/?#]|$)/i)?.[1] || null;
};
const videoUsername = (video) => normalizedUsername(
  video?.creator?.user_name || video?.creator?.username || video?.username,
);
const videoPostedAt = (video) => {
  const raw = String(video?.video_post_time || video?.post_time || '').trim();
  if (!raw) return null;
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const parsed = new Date(/[zZ]|[+-]\d\d:\d\d$/.test(normalized) ? normalized : `${normalized}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};
const normalizeVideoCandidate = (video) => {
  const id = String(video?.id || video?.video_id || '').trim();
  const username = videoUsername(video);
  const gmv = video?.gmv && typeof video.gmv === 'object'
    ? video.gmv
    : { amount: String(video?.gmv || 0), currency: null };
  return {
    id,
    title: String(video?.title || id || 'TikTok video'),
    username,
    posted_at: videoPostedAt(video),
    video_url: id && username ? `https://www.tiktok.com/@${encodeURIComponent(username)}/video/${encodeURIComponent(id)}` : null,
    gmv: {
      amount: Number(gmv?.amount || 0),
      currency: gmv?.currency || null,
    },
    views: Number(video?.views ?? video?.video_views ?? 0),
    orders: Number(video?.sku_orders ?? video?.orders ?? 0),
    items_sold: Number(video?.items_sold ?? video?.units_sold ?? 0),
    ctr: Number(video?.click_through_rate ?? video?.ctr ?? 0),
  };
};

const normalizeCachedVideoCandidate = (videoInstance) => {
  const video = typeof videoInstance?.toJSON === 'function' ? videoInstance.toJSON() : videoInstance;
  const latest = [...(video.performance_snapshots || [])].sort((left, right) => (
    String(right.snapshot_date || '').localeCompare(String(left.snapshot_date || ''))
    || new Date(right.synced_at || 0) - new Date(left.synced_at || 0)
  ))[0] || {};
  return {
    id: String(video.platform_video_id),
    title: video.title || video.platform_video_id,
    username: normalizedUsername(video.creator_username),
    posted_at: video.posted_at || null,
    video_url: video.video_url || null,
    gmv: {
      amount: Number(latest.gross_gmv || 0),
      currency: latest.currency || null,
    },
    views: Number(latest.views || 0),
    orders: Number(latest.orders || 0),
    items_sold: Number(latest.items_sold || 0),
    ctr: Number(latest.ctr || 0),
    cached_catalog: true,
    catalog_synced_at: latest.synced_at || video.last_seen_at || null,
  };
};

const bookingVideoDateRange = (booking, now = new Date()) => {
  const earliest = new Date(now);
  earliest.setUTCDate(earliest.getUTCDate() - 89);
  const bookingDate = new Date(booking.created_at || booking.evaluation_snapshot?.recorded_at || earliest);
  const start = bookingDate > earliest ? bookingDate : earliest;
  const end = new Date(now);
  end.setUTCDate(end.getUTCDate() + 1);
  return { startDate: dateOnly(start), endDate: dateOnly(end) };
};

const findBookingVideoCandidates = async (booking) => {
  const username = normalizedUsername(booking.creator_username);
  if (!username) {
    const error = new Error('Booking does not have a creator username for video matching.');
    error.status = 400;
    throw error;
  }
  if (!booking.target_shop_id) {
    const error = new Error('Booking is not linked to a TikTok Shop.');
    error.status = 400;
    throw error;
  }

  const shop = await TikTokShop.findByPk(booking.target_shop_id, {
    include: [{ association: 'authorization' }],
  });
  if (!shop?.authorization) {
    const error = new Error('TikTok Shop is not connected.');
    error.status = 409;
    throw error;
  }

  const range = bookingVideoDateRange(booking);
  if (ShopVideo?.findAll) {
    const cached = await ShopVideo.findAll({
      where: {
        shop_id: booking.target_shop_id,
        creator_username: { [Op.iLike]: username },
        posted_at: {
          [Op.gte]: new Date(`${range.startDate}T00:00:00.000Z`),
          [Op.lt]: new Date(`${range.endDate}T00:00:00.000Z`),
        },
      },
      include: [{
        model: ShopVideoPerformanceSnapshot,
        as: 'performance_snapshots',
        required: false,
      }],
      order: [['posted_at', 'DESC']],
    });
    if (cached.length) {
      return {
        candidates: cached.map(normalizeCachedVideoCandidate),
        range,
        source: 'SHOP_VIDEO_CATALOG',
      };
    }
  }
  const videos = [];
  let pageToken = null;
  const configuredMaxPages = Number(process.env.BOOKING_VIDEO_MATCH_MAX_PAGES);
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
        startDate: range.startDate,
        endDate: range.endDate,
        currency: 'LOCAL',
        accountType: 'AFFILIATE_ACCOUNTS',
        sortField: 'gmv',
        sortOrder: 'DESC',
        pageSize: 100,
        pageToken,
      });
    videos.push(...(payload.data?.videos || []));
    pageToken = payload.data?.next_page_token || null;
    if (!pageToken) break;
    if (page === maxPages - 1) {
      const error = new Error(`Booking video matching reached the safety limit of ${maxPages} pages before TikTok pagination ended.`);
      error.status = 424;
      throw error;
    }
  }

  const candidatesById = new Map();
  videos
    .filter((video) => videoUsername(video) === username)
    .map(normalizeVideoCandidate)
    .filter((video) => video.id)
    .forEach((video) => candidatesById.set(video.id, video));
  return {
    candidates: [...candidatesById.values()].sort((left, right) => (
      new Date(right.posted_at || 0) - new Date(left.posted_at || 0)
      || right.gmv.amount - left.gmv.amount
    )),
    range,
  };
};

const bookingInclude = [
  { model: User, as: 'staff' },
  { model: User, as: 'creator' },
  {
    model: BookingVideo,
    as: 'booking_videos',
    required: false,
    include: [{
      model: BookingVideoPerformanceSnapshot,
      as: 'performance_snapshots',
      required: false,
    }],
  },
];

const resolveSellerShopId = async (authorization, requestedShopId) => {
  const explicitShopId = String(requestedShopId || '').trim();
  if (explicitShopId) return explicitShopId;
  const sellerShop = await TikTokShop.findOne({ order: [['id', 'ASC']] });
  return String(sellerShop?.platform_shop_id || authorization?.shop_id || '').trim();
};

const creatorIdentityKeys = (shopId, creator = {}) => {
  const keys = [];
  const creatorOpenId = String(creator.creator_open_id || '').trim();
  const username = String(creator.username || '').trim().toLowerCase();
  if (creatorOpenId) keys.push(`${shopId}:open:${creatorOpenId}`);
  if (username) keys.push(`${shopId}:username:${username}`);
  return keys;
};
const canonicalCreatorKey = (shopId, creator = {}) => {
  const username = String(creator.username || '').trim().replace(/^@+/, '').toLowerCase();
  const creatorOpenId = String(creator.creator_open_id || '').trim();
  return username
    ? `${shopId}:username:${username}`
    : `${shopId}:open:${creatorOpenId}`;
};
const collaborationOption = (candidate) => candidate.collaboration_id ? {
  id: candidate.collaboration_id,
  name: candidate.collaboration_name,
  status: candidate.collaboration_status,
  start_at: candidate.collaboration_start_at,
  end_at: candidate.collaboration_end_at,
  products: candidate.products || [],
  synced_at: candidate.collaboration_synced_at || null,
} : null;
const mergeCreatorCandidates = (rows) => {
  const merged = new Map();
  for (const row of rows) {
    const key = canonicalCreatorKey(row.shop_id, row);
    const existing = merged.get(key);
    const collaboration = collaborationOption(row);
    if (!existing) {
      merged.set(key, {
        ...row,
        collaborations: collaboration ? [collaboration] : [],
      });
      continue;
    }
    if (collaboration && !existing.collaborations.some((item) => String(item.id) === String(collaboration.id))) {
      existing.collaborations.push(collaboration);
    }
    existing.performance ||= row.performance;
    existing.creator_open_id ||= row.creator_open_id;
    existing.nickname ||= row.nickname;
    existing.avatar_url ||= row.avatar_url;
  }
  return [...merged.values()];
};

const getTargetKocs = async (req, res) => {
  try {
    const keyword = String(req.query.keyword || '').trim();
    const normalizedKeyword = keyword.toLowerCase();
    const collaborations = await TikTokTargetCollaborationSnapshot.findAll({
      where: { status: { [Op.in]: ['ONGOING', 'VALID', 'EXPIRING'] } },
      order: [['end_at', 'DESC'], ['synced_at', 'DESC']],
    });
    const performanceRows = await sequelize.query(`
      SELECT DISTINCT ON (shop_id, COALESCE(NULLIF(creator_open_id, ''), LOWER(username))) *
      FROM tiktok_creator_performance_snapshots
      ORDER BY shop_id, COALESCE(NULLIF(creator_open_id, ''), LOWER(username)), end_date DESC, synced_at DESC, id DESC
    `, { type: QueryTypes.SELECT });
    const performanceByCreator = new Map();
    for (const performance of performanceRows) {
      if (performance.creator_open_id) performanceByCreator.set(`${performance.shop_id}:open:${performance.creator_open_id}`, performance);
      if (performance.username) performanceByCreator.set(`${performance.shop_id}:username:${String(performance.username).toLowerCase()}`, performance);
    }
    const candidates = [];
    const collaborationCreatorKeys = new Set();
    for (const instance of collaborations) {
      const collaboration = instance.toJSON();
      const raw = collaboration.raw_data || {};
      for (const creator of raw.creators || []) {
        const profile = normalizeCreatorProfile(creator);
        const identityKeys = creatorIdentityKeys(collaboration.shop_id, profile);
        if (!identityKeys.length) continue;
        identityKeys.forEach((key) => collaborationCreatorKeys.add(key));
        const searchable = `${profile.nickname || ''} ${profile.username || ''} ${collaboration.name || ''}`.toLowerCase();
        if (normalizedKeyword && !searchable.includes(normalizedKeyword)) continue;
        const performance = identityKeys.map((key) => performanceByCreator.get(key)).find(Boolean) || null;
        candidates.push({
          source: 'TARGET_COLLABORATION',
          shop_id: collaboration.shop_id,
          collaboration_id: collaboration.collaboration_id,
          collaboration_name: collaboration.name,
          collaboration_status: collaboration.status,
          collaboration_start_at: collaboration.start_at,
          collaboration_end_at: collaboration.end_at,
          products: Array.isArray(raw.products) ? raw.products : [],
          creator_open_id: profile.creator_open_id,
          username: profile.username,
          nickname: profile.nickname,
          avatar_url: profile.avatar_url,
          performance,
          collaboration_synced_at: collaboration.synced_at,
        });
      }
    }
    for (const performance of performanceRows) {
      const identityKeys = creatorIdentityKeys(performance.shop_id, performance);
      if (!identityKeys.length || identityKeys.some((key) => collaborationCreatorKeys.has(key))) continue;
      const searchable = `${performance.nickname || ''} ${performance.username || ''}`.toLowerCase();
      if (normalizedKeyword && !searchable.includes(normalizedKeyword)) continue;
      candidates.push({
        source: 'CREATOR_PERFORMANCE',
        shop_id: performance.shop_id,
        collaboration_id: null,
        collaboration_name: null,
        collaboration_status: null,
        collaboration_start_at: null,
        collaboration_end_at: null,
        products: [],
        creator_open_id: performance.creator_open_id || null,
        username: performance.username,
        nickname: performance.nickname,
        avatar_url: performance.avatar_url,
        performance,
        performance_synced_at: performance.synced_at,
      });
    }
    const mergedCandidates = mergeCreatorCandidates(candidates);
    mergedCandidates.sort((left, right) => {
      const active = (value) => ['ONGOING', 'VALID', 'EXPIRING'].includes(value) ? 1 : 0;
      return active(right.collaboration_status) - active(left.collaboration_status)
        || new Date(right.collaboration_end_at || 0) - new Date(left.collaboration_end_at || 0)
        || String(left.nickname || left.username).localeCompare(String(right.nickname || right.username));
    });
    res.json(mergedCandidates);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const findTargetCreator = async (shopId, collaborationIdValue, creatorOpenIdValue, creatorUsernameValue) => {
  const normalizedShopId = Number(shopId);
  const collaborationId = String(collaborationIdValue || '').trim();
  const creatorOpenId = String(creatorOpenIdValue || '').trim();
  const creatorUsername = String(creatorUsernameValue || '').trim();
  if (!Number.isInteger(normalizedShopId) || (!creatorOpenId && !creatorUsername)) return null;

  if (collaborationId) {
    const snapshot = await TikTokTargetCollaborationSnapshot.findOne({
      where: { shop_id: normalizedShopId, collaboration_id: collaborationId },
    });
    if (snapshot) {
      const collaboration = snapshot.toJSON();
      const raw = collaboration.raw_data || {};
      const creator = (raw.creators || []).find((item) => {
        const profile = normalizeCreatorProfile(item);
        return (creatorOpenId && String(profile.creator_open_id || '') === creatorOpenId)
          || (creatorUsername && String(profile.username || '').toLowerCase() === creatorUsername.toLowerCase());
      });
      if (creator) {
        const profile = normalizeCreatorProfile(creator);
        const performance = await TikTokCreatorPerformanceSnapshot.findOne({
          where: {
            shop_id: normalizedShopId,
            [Op.or]: [
              ...(profile.creator_open_id ? [{ creator_open_id: profile.creator_open_id }] : []),
              ...(profile.username ? [{ username: { [Op.iLike]: profile.username } }] : []),
            ],
          },
          order: [['end_date', 'DESC'], ['synced_at', 'DESC'], ['id', 'DESC']],
        });
        return { collaboration, raw, profile, performance: performance?.toJSON() || null };
      }
    }
  }

  const creatorConditions = [
    ...(creatorOpenId ? [{ creator_open_id: creatorOpenId }] : []),
    ...(creatorUsername ? [{ username: { [Op.iLike]: creatorUsername } }] : []),
  ];
  const performance = await TikTokCreatorPerformanceSnapshot.findOne({
    where: {
      shop_id: normalizedShopId,
      [Op.or]: creatorConditions,
    },
    order: [['end_date', 'DESC'], ['synced_at', 'DESC'], ['id', 'DESC']],
  });
  if (!performance) return null;
  const performanceData = performance.toJSON();
  return {
    collaboration: null,
    raw: null,
    profile: {
      creator_open_id: performanceData.creator_open_id || null,
      username: performanceData.username,
      nickname: performanceData.nickname || performanceData.username,
      avatar_url: performanceData.avatar_url || null,
    },
    performance: performanceData,
  };
};

const getBookings = async (req, res) => {
  try {
    const bookings = await Booking.findAll({
      where: { evaluation_snapshot: { [Op.not]: null } },
      include: bookingInclude,
      order: [['deadline', 'ASC'], ['id', 'DESC']],
    });
    res.json(bookings.map(serializeBookingWithActual));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getBookingById = async (req, res) => {
  try {
    const booking = await Booking.findByPk(req.params.id, { include: bookingInclude });
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }
    res.json(serializeBookingWithActual(booking));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const createBooking = async (req, res) => {
  try {
    const cost = Number(req.body.booking_cost);
    if (!Number.isFinite(cost) || cost < 0) return res.status(400).json({ message: 'Booking cost must be zero or greater.' });
    const targetCreator = await findTargetCreator(
      req.body.target_shop_id,
      req.body.target_collaboration_id,
      req.body.creator_open_id,
      req.body.creator_username,
    );
    if (!targetCreator) return res.status(400).json({ message: 'Select a KOC from synced Target Collaboration or Creator Performance data.' });
    const { collaboration, raw, profile, performance } = targetCreator;
    const evaluationSnapshot = {
      recorded_at: new Date().toISOString(),
      collaboration: collaboration ? {
        id: collaboration.collaboration_id,
        name: collaboration.name,
        status: collaboration.status,
        start_at: collaboration.start_at,
        end_at: collaboration.end_at,
        products: Array.isArray(raw.products) ? raw.products : [],
        synced_at: collaboration.synced_at,
      } : null,
      performance,
    };
    const payload = compactPayload({
      staff_id: null,
      staff_name: null,
      creator_id: null,
      creator_open_id: profile.creator_open_id,
      creator_username: profile.username,
      creator_name: profile.nickname,
      creator_avatar_url: profile.avatar_url,
      target_shop_id: collaboration?.shop_id || performance.shop_id,
      target_collaboration_id: collaboration?.collaboration_id || null,
      evaluation_snapshot: evaluationSnapshot,
      booking_cost: cost,
      status: 'draft',
      deadline: collaboration?.end_at ? new Date(collaboration.end_at).toISOString().slice(0, 10) : null,
      note: req.body.note || null,
      updated_at: new Date(),
    });

    if (!ALLOWED_STATUSES.has(payload.status)) {
      return res.status(400).json({ message: 'Invalid booking status' });
    }

    const booking = await Booking.create(payload);
    const createdBooking = await Booking.findByPk(booking.id, { include: bookingInclude });
    res.status(201).json(serializeBookingWithActual(createdBooking));
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const updateBooking = async (req, res) => {
  try {
    if (req.body.booking_cost !== undefined) {
      const cost = Number(req.body.booking_cost);
      if (!Number.isFinite(cost) || cost < 0) return res.status(400).json({ message: 'Booking cost must be zero or greater.' });
      req.body.booking_cost = cost;
    }
    if (req.body.status && !ALLOWED_STATUSES.has(req.body.status)) {
      return res.status(400).json({ message: 'Invalid booking status' });
    }

    const payload = compactPayload({
      staff_id: req.body.staff_id,
      staff_name: req.body.staff_name === undefined ? undefined : String(req.body.staff_name || '').trim(),
      creator_id: req.body.creator_id,
      booking_cost: req.body.booking_cost,
      status: req.body.status,
      deadline: req.body.deadline,
      note: req.body.note,
      video_platform_id: req.body.video_platform_id,
      video_url: normalizeBookingVideoUrl(req.body.video_url),
      posted_at: req.body.posted_at,
      updated_at: new Date(),
    });

    const [updated] = await Booking.update(payload, {
      where: { id: req.params.id },
      individualHooks: true,
      validate: true,
    });

    if (!updated) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    const booking = await Booking.findByPk(req.params.id, { include: bookingInclude });
    res.json(serializeBookingWithActual(booking));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const matchBookingVideo = async (req, res) => {
  try {
    const booking = await Booking.findByPk(req.params.id);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    const manualVideoUrl = String(req.body?.video_url || '').trim();
    const manualVideoId = manualVideoUrl ? tiktokVideoIdFromUrl(manualVideoUrl) : null;
    if (manualVideoUrl && !manualVideoId) {
      return res.status(400).json({ message: 'Enter a valid TikTok video URL.' });
    }
    const { candidates, range } = manualVideoId
      ? { candidates: [], range: bookingVideoDateRange(booking) }
      : await findBookingVideoCandidates(booking);
    const requestedVideoId = String(req.body?.video_id || manualVideoId || booking.video_platform_id || '').trim();
    let selected = requestedVideoId
      ? candidates.find((candidate) => candidate.id === requestedVideoId)
      : candidates.length === 1 ? candidates[0] : null;
    if (!selected && manualVideoId) {
      selected = {
        id: manualVideoId,
        title: 'TikTok video',
        username: normalizedUsername(booking.creator_username),
        posted_at: null,
        video_url: manualVideoUrl,
        gmv: { amount: 0, currency: null },
        views: 0,
        orders: 0,
        items_sold: 0,
        ctr: 0,
        manually_confirmed: true,
      };
    }

    if (!selected) {
      return res.json({
        status: requestedVideoId ? 'no_match' : candidates.length ? 'needs_confirmation' : 'no_match',
        candidates: requestedVideoId ? [] : candidates,
        range,
      });
    }

    const mappingSource = selected.manually_confirmed
      ? 'MANUAL_URL'
      : selected.cached_catalog ? 'SHOP_VIDEO_CATALOG' : 'TIKTOK_SHOP_VIDEO_PERFORMANCE';
    const evaluationSnapshot = {
      ...(booking.evaluation_snapshot || {}),
      video_match: {
        source: mappingSource,
        matched_at: new Date().toISOString(),
        ...selected,
      },
    };
    await booking.update({
      video_platform_id: selected.id,
      video_url: selected.video_url,
      posted_at: selected.posted_at,
      evaluation_snapshot: evaluationSnapshot,
      updated_at: new Date(),
    });
    const linkedVideo = await recordBookingVideoMatch(
      booking,
      selected,
      mappingSource,
    );
    let syncWarning = null;
    if (linkedVideo && (selected.cached_catalog || selected.manually_confirmed)) {
      linkedVideo.booking = booking;
      await syncBookingVideo(linkedVideo).catch((syncError) => {
        syncWarning = syncError.message;
      });
    }
    const updated = await Booking.findByPk(booking.id, { include: bookingInclude });
    return res.json({
      status: 'matched',
      booking: serializeBookingWithActual(updated),
      candidate: selected,
      range,
      ...(syncWarning ? { sync_warning: syncWarning } : {}),
    });
  } catch (error) {
    res.status(error.status || 502).json({ message: error.message });
  }
};

const deleteBooking = async (req, res) => {
  try {
    const deleted = await Booking.destroy({
      where: { id: req.params.id },
    });
    if (!deleted) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    res.json({ message: 'Booking deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getTikTokPartnerCollaborations = async (req, res) => {
  try {
    const creatorId = Number(req.query.creator_id);
    if (!Number.isInteger(creatorId)) return res.status(400).json({ message: 'creator_id is required.' });
    const authorization = await TikTokPartnerAuthorization.findOne({ where: { creator_id: creatorId } });
    if (!authorization) return res.status(409).json({ message: 'This KOC has not connected TikTok Partner.' });
    const shopId = await resolveSellerShopId(authorization, req.query.shop_id);
    const result = isDemoAuthorization(authorization)
      ? creatorCollaborationsFixture(authorization)
      : await searchTargetCollaborations({
        authorization,
        shopId,
        pageToken: req.query.page_token,
        pageSize: req.query.page_size,
        keyword: req.query.keyword,
      });
    res.json(result);
  } catch (error) {
    const status = error.message.startsWith('TikTok Partner is not configured') ? 503 : 502;
    res.status(status).json({ message: error.message });
  }
};

const getTikTokPartnerStatuses = async (req, res) => {
  try {
    const creators = await User.findAll({
      where: { role: 'koc' },
      include: [{ model: TikTokPartnerAuthorization, as: 'tiktok_partner_authorization', required: false }],
      order: [['name', 'ASC']],
    });
    res.json(creators.map((creator) => {
      const authorization = creator.tiktok_partner_authorization;
      const grantedScopes = grantedScopesOf(authorization);
      const refreshExpiresAt = authorization?.refresh_token_expires_at
        ? new Date(authorization.refresh_token_expires_at).getTime()
        : null;
      const tokenExpired = Boolean(authorization && refreshExpiresAt && refreshExpiresAt <= Date.now());
      return {
        creator_id: creator.id,
        connected: Boolean(authorization),
        open_id: authorization?.open_id || null,
        status: !authorization ? 'disconnected' : (tokenExpired ? 'expired' : 'connected'),
        username: authorization?.username || null,
        avatar_url: authorization?.avatar_url || null,
        register_region: authorization?.register_region || null,
        showcase_count: authorization?.showcase_count || 0,
        last_synced_at: authorization?.last_synced_at || null,
        last_sync_status: authorization?.last_sync_status || null,
        last_sync_error: authorization?.last_sync_error || null,
        granted_scopes: grantedScopes,
        access_token_expires_at: authorization?.access_token_expires_at || null,
        connected_at: authorization?.connected_at || null,
      };
    }));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const startTikTokPartnerOauth = async (req, res) => {
  try {
    const creatorId = Number(req.query.creator_id);
    const createKoc = req.query.create_koc === 'true';
    if (createKoc && Number.isInteger(creatorId)) return res.status(400).json({ message: 'Choose either an existing KOC or create a new KOC, not both.' });
    if (!createKoc) {
      if (!Number.isInteger(creatorId) || creatorId <= 0) return res.status(400).json({ message: 'creator_id is required when connecting an existing KOC.' });
      const creator = await User.findOne({ where: { id: creatorId, role: 'koc' }, attributes: ['id'] });
      if (!creator) return res.status(404).json({ message: 'KOC not found.' });
    }
    res.json({ authorizeUrl: buildAuthorizationUrl({
      returnPath: req.query.return_path,
      creatorId: createKoc ? null : creatorId,
      createKoc,
    }) });
  } catch (error) {
    const status = error.message.startsWith('TikTok Partner is not configured') ? 503 : 500;
    res.status(status).json({ message: error.message });
  }
};

const buildPartnerReturnUrl = (status, message, creatorId, returnPath = '/bookings') => {
  const safeReturnPath = ['/bookings', '/manage/koc-performance'].includes(returnPath) ? returnPath : '/bookings';
  const url = new URL(safeReturnPath, process.env.FRONTEND_URL || 'http://localhost:3005');
  url.searchParams.set('partner_oauth_status', status);
  if (message) url.searchParams.set('partner_oauth_message', message);
  if (creatorId) url.searchParams.set('creator_id', String(creatorId));
  return url.toString();
};

const handleTikTokPartnerOauthCallback = async (req, res) => {
  let creatorId;
  let returnPath = '/bookings';
  try {
    const state = parseAuthorizationState(req.query.state);
    if (state.oauthType === 'shop') return handleShopOauthCallback(req, res);
    if (state.oauthType && state.oauthType !== 'creator') throw new Error('TikTok OAuth state has an unsupported authorization type.');
    returnPath = state.returnPath;
    const targetCreatorId = Number(state.creator_id ?? state.creatorId);
    const createKoc = (state.create_koc ?? state.createKoc) === true;
    if ((!Number.isInteger(targetCreatorId) || targetCreatorId <= 0) && !createKoc) {
      throw new Error('TikTok Creator authorization is not linked to a KOC. Start the connection again.');
    }
    if (!req.query.code || req.query.code === 'null') throw new Error(req.query.error || 'Creator denied TikTok authorization.');
    const tokenData = await exchangeAuthorizationCode(req.query.code);
    if (Number(tokenData.user_type) !== 1) throw new Error('TikTok authorization must return a Creator token (user_type=1).');
    const scopes = tokenData.granted_scopes || tokenData.granted_permissions || [];
    const normalizedScopes = Array.isArray(scopes) ? scopes : String(scopes).split(',').map((item) => item.trim()).filter(Boolean);
    if (!normalizedScopes.includes(CREATOR_PROFILE_SCOPE)) {
      throw new Error(`Creator did not grant ${CREATOR_PROFILE_SCOPE}.`);
    }
    const profile = await getCreatorProfileWithAccessToken(tokenData.access_token);
    const openId = profile.creator_user_open_id || tokenData.open_id;
    if (!openId) throw new Error('TikTok Creator profile did not return an open ID.');
    const existingByOpenId = await TikTokPartnerAuthorization.findOne({ where: { open_id: openId } });
    const existingByCreator = Number.isInteger(targetCreatorId)
      ? await TikTokPartnerAuthorization.findOne({ where: { creator_id: targetCreatorId } })
      : null;
    if (existingByOpenId && Number.isInteger(targetCreatorId) && existingByOpenId.creator_id !== targetCreatorId) {
      throw new Error('This TikTok Creator is already linked to another KOC.');
    }
    let creator = Number.isInteger(targetCreatorId)
      ? await User.findOne({ where: { id: targetCreatorId, role: 'koc' } })
      : existingByOpenId ? await User.findByPk(existingByOpenId.creator_id) : null;
    if (!creator && createKoc) {
      const identifier = crypto.createHash('sha256').update(openId).digest('hex').slice(0, 24);
      creator = await User.create({
        name: profile.username || `TikTok Creator ${openId.slice(-6)}`,
        email: `tiktok.${identifier}@creators.yumnetwork.vn`,
        role: 'koc',
      });
    }
    if (!creator) throw new Error('The selected KOC no longer exists.');
    creatorId = creator.id;
    const existing = existingByCreator || existingByOpenId;
    const sellerShopId = await resolveSellerShopId(existing);
    const values = {
      creator_id: creatorId,
      shop_id: sellerShopId || null,
      connected_at: new Date(),
      username: profile.username || existing?.username || null,
      avatar_url: profile.avatar?.url || profile.avatar_url || existing?.avatar_url || null,
      register_region: profile.register_region || existing?.register_region || null,
      last_synced_at: new Date(),
      last_sync_status: 'success',
      last_sync_error: null,
      ...tokenFields({ ...tokenData, open_id: openId, granted_scopes: normalizedScopes }, existing || {}),
    };
    let authorization;
    if (existing) {
      authorization = existing;
      await authorization.update(values);
    } else {
      authorization = await TikTokPartnerAuthorization.create(values);
    }
    await sequelize.query(`
      INSERT INTO tiktok_partner_sync_logs (authorization_id, creator_id, status, synced_at)
      VALUES (:authorizationId, :creatorId, 'success', NOW())
    `, { replacements: { authorizationId: authorization.id, creatorId } });
    return res.redirect(buildPartnerReturnUrl('success', 'TikTok Creator connected.', creatorId, returnPath));
  } catch (error) {
    console.error('[TikTok Partner OAuth] Callback failed', { creatorId, message: error.message });
    return res.redirect(buildPartnerReturnUrl('error', error.message || 'TikTok Partner OAuth failed.', creatorId, returnPath));
  }
};

const getTikTokPartnerCreatorOverview = async (req, res) => {
  try {
    const creatorId = Number(req.params.creatorId);
    const authorization = Number.isInteger(creatorId)
      ? await TikTokPartnerAuthorization.findOne({ where: { creator_id: creatorId } })
      : null;
    if (!authorization) return res.status(409).json({ message: 'This KOC has not connected TikTok Partner.' });
    const shopId = await resolveSellerShopId(authorization);
    const overview = isDemoAuthorization(authorization)
      ? creatorOverviewFixture(authorization)
      : await getCreatorOverview(authorization, { shopId });
    await authorization.update({
      username: overview.profile?.username || authorization.username,
      avatar_url: overview.profile?.avatar?.url || overview.profile?.avatar_url || authorization.avatar_url,
      register_region: overview.profile?.register_region || authorization.register_region,
      showcase_count: overview.showcase?.totalCount || 0,
      last_synced_at: new Date(),
      last_sync_status: 'success',
      last_sync_error: null,
      ...(shopId ? { shop_id: shopId } : {}),
    });
    await sequelize.query(`
      INSERT INTO tiktok_partner_sync_logs (authorization_id, creator_id, status, synced_at)
      VALUES (:authorizationId, :creatorId, 'success', NOW())
    `, { replacements: { authorizationId: authorization.id, creatorId } });
    res.json(overview);
  } catch (error) {
    const creatorId = Number(req.params.creatorId);
    if (Number.isInteger(creatorId)) {
      await TikTokPartnerAuthorization.update({
        last_synced_at: new Date(),
        last_sync_status: 'failed',
        last_sync_error: String(error.message || error).slice(0, 2000),
      }, { where: { creator_id: creatorId } }).catch(() => {});
      await sequelize.query(`
        INSERT INTO tiktok_partner_sync_logs (authorization_id, creator_id, status, error, synced_at)
        SELECT id, creator_id, 'failed', :error, NOW()
        FROM tiktok_partner_authorizations WHERE creator_id = :creatorId
      `, { replacements: { creatorId, error: String(error.message || error).slice(0, 2000) } }).catch(() => {});
    }
    res.status(502).json({ message: error.message });
  }
};

const disconnectTikTokPartner = async (req, res) => {
  try {
    const creatorId = Number(req.params.creatorId);
    const deleted = await TikTokPartnerAuthorization.destroy({ where: { creator_id: creatorId } });
    if (!deleted) return res.status(404).json({ message: 'TikTok Partner connection not found.' });
    res.json({ message: 'TikTok Creator disconnected.' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getBookings,
  getBookingById,
  createBooking,
  updateBooking,
  matchBookingVideo,
  deleteBooking,
  getTargetKocs,
  getTikTokPartnerCollaborations,
  getTikTokPartnerStatuses,
  startTikTokPartnerOauth,
  handleTikTokPartnerOauthCallback,
  disconnectTikTokPartner,
  getTikTokPartnerCreatorOverview,
  __test: {
    bookingVideoDateRange,
    normalizeVideoCandidate,
    tiktokVideoIdFromUrl,
    mergeCreatorCandidates,
  },
};
