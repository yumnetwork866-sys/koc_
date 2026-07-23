const crypto = require('crypto');
const { Op, QueryTypes } = require('sequelize');
const {
  User, Booking, TikTokPartnerAuthorization, TikTokShop,
  TikTokTargetCollaborationSnapshot, TikTokCreatorPerformanceSnapshot, sequelize,
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
const { handleShopOauthCallback } = require('./tiktokShopController');
const {
  creatorCollaborationsFixture,
  creatorOverviewFixture,
  isDemoAuthorization,
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

const bookingInclude = [
  { model: User, as: 'staff' },
  { model: User, as: 'creator' },
];

const resolveSellerShopId = async (authorization, requestedShopId) => {
  const explicitShopId = String(requestedShopId || '').trim();
  if (explicitShopId) return explicitShopId;
  const sellerShop = await TikTokShop.findOne({ order: [['id', 'ASC']] });
  return String(sellerShop?.platform_shop_id || authorization?.shop_id || '').trim();
};

const getTargetKocs = async (req, res) => {
  try {
    const keyword = String(req.query.keyword || '').trim();
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
    for (const instance of collaborations) {
      const collaboration = instance.toJSON();
      const raw = collaboration.raw_data || {};
      for (const creator of raw.creators || []) {
        const profile = normalizeCreatorProfile(creator);
        if (!profile.creator_open_id) continue;
        const searchable = `${profile.nickname || ''} ${profile.username || ''} ${collaboration.name || ''}`.toLowerCase();
        if (keyword && !searchable.includes(keyword.toLowerCase())) continue;
        const performance = performanceByCreator.get(`${collaboration.shop_id}:open:${profile.creator_open_id}`)
          || performanceByCreator.get(`${collaboration.shop_id}:username:${profile.username}`)
          || null;
        candidates.push({
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
    candidates.sort((left, right) => {
      const active = (value) => ['ONGOING', 'VALID', 'EXPIRING'].includes(value) ? 1 : 0;
      return active(right.collaboration_status) - active(left.collaboration_status)
        || new Date(right.collaboration_end_at || 0) - new Date(left.collaboration_end_at || 0)
        || String(left.nickname || left.username).localeCompare(String(right.nickname || right.username));
    });
    res.json(candidates);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const findTargetCreator = async (shopId, collaborationIdValue, creatorOpenId) => {
  if (!Number.isInteger(Number(shopId))
    || !String(collaborationIdValue || '').trim()
    || !String(creatorOpenId || '').trim()) return null;
  const snapshot = await TikTokTargetCollaborationSnapshot.findOne({
    where: { shop_id: Number(shopId), collaboration_id: String(collaborationIdValue) },
  });
  if (!snapshot) return null;
  const collaboration = snapshot.toJSON();
  const raw = collaboration.raw_data || {};
  const creator = (raw.creators || []).find((item) => {
    const profile = normalizeCreatorProfile(item);
    return String(profile.creator_open_id || '') === String(creatorOpenId || '');
  });
  if (!creator) return null;
  const profile = normalizeCreatorProfile(creator);
  const performance = await TikTokCreatorPerformanceSnapshot.findOne({
    where: {
      shop_id: Number(shopId),
      [Op.or]: [
        ...(profile.creator_open_id ? [{ creator_open_id: profile.creator_open_id }] : []),
        ...(profile.username ? [{ username: { [Op.iLike]: profile.username } }] : []),
      ],
    },
    order: [['end_date', 'DESC'], ['synced_at', 'DESC'], ['id', 'DESC']],
  });
  return { collaboration, raw, profile, performance: performance?.toJSON() || null };
};

const getBookings = async (req, res) => {
  try {
    const bookings = await Booking.findAll({
      where: { evaluation_snapshot: { [Op.not]: null } },
      include: bookingInclude,
      order: [['deadline', 'ASC'], ['id', 'DESC']],
    });
    res.json(bookings);
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
    res.json(booking);
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
    );
    if (!targetCreator) return res.status(400).json({ message: 'Select a KOC from a synced Target Collaboration.' });
    const { collaboration, raw, profile, performance } = targetCreator;
    const evaluationSnapshot = {
      recorded_at: new Date().toISOString(),
      collaboration: {
        id: collaboration.collaboration_id,
        name: collaboration.name,
        status: collaboration.status,
        start_at: collaboration.start_at,
        end_at: collaboration.end_at,
        products: Array.isArray(raw.products) ? raw.products : [],
        synced_at: collaboration.synced_at,
      },
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
      target_shop_id: collaboration.shop_id,
      target_collaboration_id: collaboration.collaboration_id,
      evaluation_snapshot: evaluationSnapshot,
      booking_cost: cost,
      status: 'draft',
      deadline: collaboration.end_at ? new Date(collaboration.end_at).toISOString().slice(0, 10) : null,
      note: req.body.note || null,
      updated_at: new Date(),
    });

    if (!ALLOWED_STATUSES.has(payload.status)) {
      return res.status(400).json({ message: 'Invalid booking status' });
    }

    const booking = await Booking.create(payload);
    const createdBooking = await Booking.findByPk(booking.id, { include: bookingInclude });
    res.status(201).json(createdBooking);
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
    res.json(booking);
  } catch (error) {
    res.status(500).json({ message: error.message });
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
  deleteBooking,
  getTargetKocs,
  getTikTokPartnerCollaborations,
  getTikTokPartnerStatuses,
  startTikTokPartnerOauth,
  handleTikTokPartnerOauthCallback,
  disconnectTikTokPartner,
  getTikTokPartnerCreatorOverview,
};
