const { DataTypes } = require('sequelize');
const sequelize = require('../db/config');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true,
    },
  },
  password_hash: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  role: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'member',
  },
  avatar_url: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
}, {
  tableName: 'users',
  timestamps: false,
  defaultScope: {
    attributes: { exclude: ['password_hash'] },
  },
});

const Role = sequelize.define('Role', {
  key: {
    type: DataTypes.STRING(64),
    primaryKey: true,
  },
  label: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  is_system: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  created_at: DataTypes.DATE,
  updated_at: DataTypes.DATE,
}, {
  tableName: 'roles',
  timestamps: false,
});

const Booking = sequelize.define('Booking', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  staff_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  creator_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  booking_cost: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0,
  },
  status: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'booked',
    validate: {
      isIn: [['draft', 'booked', 'waiting_video', 'video_posted', 'done', 'cancelled']],
    },
  },
  deadline: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  note: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  video_platform_id: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  video_url: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  posted_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  tableName: 'bookings',
  timestamps: false,
  indexes: [
    { fields: ['staff_id'] },
    { fields: ['creator_id'] },
    { fields: ['status'] },
    { fields: ['deadline'] },
  ],
});

const TikTokPartnerAuthorization = sequelize.define('TikTokPartnerAuthorization', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  creator_id: { type: DataTypes.INTEGER, allowNull: false, unique: true },
  open_id: { type: DataTypes.STRING, allowNull: true, unique: true },
  user_type: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  granted_scopes: { type: DataTypes.TEXT, allowNull: true },
  access_token_encrypted: { type: DataTypes.TEXT, allowNull: false },
  refresh_token_encrypted: { type: DataTypes.TEXT, allowNull: true },
  access_token_expires_at: { type: DataTypes.DATE, allowNull: true },
  refresh_token_expires_at: { type: DataTypes.DATE, allowNull: true },
  shop_id: { type: DataTypes.STRING, allowNull: true },
  username: { type: DataTypes.STRING, allowNull: true },
  avatar_url: { type: DataTypes.TEXT, allowNull: true },
  register_region: { type: DataTypes.STRING, allowNull: true },
  showcase_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  last_synced_at: { type: DataTypes.DATE, allowNull: true },
  last_sync_status: { type: DataTypes.STRING, allowNull: true },
  last_sync_error: { type: DataTypes.TEXT, allowNull: true },
  connected_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
  tableName: 'tiktok_partner_authorizations',
  timestamps: false,
  indexes: [{ fields: ['creator_id'], unique: true }, { fields: ['open_id'] }],
});

const TikTokShopAuthorization = sequelize.define('TikTokShopAuthorization', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  open_id: { type: DataTypes.STRING, allowNull: true, unique: true },
  user_type: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  granted_scopes: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
  access_token_encrypted: { type: DataTypes.TEXT, allowNull: false },
  refresh_token_encrypted: { type: DataTypes.TEXT, allowNull: true },
  access_token_expires_at: { type: DataTypes.DATE, allowNull: true },
  refresh_token_expires_at: { type: DataTypes.DATE, allowNull: true },
  connected_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  last_sync_status: { type: DataTypes.STRING, allowNull: true },
  last_sync_error: { type: DataTypes.TEXT, allowNull: true },
}, { tableName: 'tiktok_shop_authorizations', timestamps: false });

const TikTokShop = sequelize.define('TikTokShop', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  authorization_id: { type: DataTypes.INTEGER, allowNull: false },
  platform_shop_id: { type: DataTypes.STRING, allowNull: false, unique: true },
  name: { type: DataTypes.STRING, allowNull: false },
  region: { type: DataTypes.STRING, allowNull: true },
  seller_type: { type: DataTypes.STRING, allowNull: true },
  cipher: { type: DataTypes.TEXT, allowNull: false, unique: true },
  code: { type: DataTypes.STRING, allowNull: true },
  last_synced_at: { type: DataTypes.DATE, allowNull: true },
  last_sync_status: { type: DataTypes.STRING, allowNull: true },
  last_sync_error: { type: DataTypes.TEXT, allowNull: true },
}, { tableName: 'tiktok_shops', timestamps: false });

const TikTokShopAnalyticsSnapshot = sequelize.define('TikTokShopAnalyticsSnapshot', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  shop_id: { type: DataTypes.INTEGER, allowNull: false },
  start_date: { type: DataTypes.DATEONLY, allowNull: false },
  end_date: { type: DataTypes.DATEONLY, allowNull: false },
  currency: { type: DataTypes.STRING, allowNull: false, defaultValue: 'LOCAL' },
  metrics: { type: DataTypes.JSONB, allowNull: false },
  latest_available_date: { type: DataTypes.DATEONLY, allowNull: true },
  request_id: { type: DataTypes.STRING, allowNull: true },
  synced_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
  tableName: 'tiktok_shop_analytics_snapshots',
  timestamps: false,
  indexes: [{ unique: true, fields: ['shop_id', 'start_date', 'end_date', 'currency'] }],
});

const TikTokCreatorPerformanceExport = sequelize.define('TikTokCreatorPerformanceExport', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  shop_id: { type: DataTypes.INTEGER, allowNull: false },
  task_id: { type: DataTypes.STRING, allowNull: false },
  module_type: { type: DataTypes.STRING, allowNull: false, defaultValue: 'CREATOR' },
  window_type: { type: DataTypes.STRING, allowNull: false },
  plan_type: { type: DataTypes.STRING, allowNull: false, defaultValue: 'ALL' },
  start_date: { type: DataTypes.DATEONLY, allowNull: false },
  end_date: { type: DataTypes.DATEONLY, allowNull: false },
  status: { type: DataTypes.STRING, allowNull: false, defaultValue: 'PROCESSING' },
  request_id: DataTypes.STRING,
  row_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  error: DataTypes.TEXT,
  created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  completed_at: DataTypes.DATE,
}, { tableName: 'tiktok_creator_performance_exports', timestamps: false });

const TikTokCreatorPerformanceSnapshot = sequelize.define('TikTokCreatorPerformanceSnapshot', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  export_id: { type: DataTypes.INTEGER, allowNull: false },
  shop_id: { type: DataTypes.INTEGER, allowNull: false },
  username: { type: DataTypes.STRING, allowNull: false },
  nickname: DataTypes.STRING,
  avatar_url: DataTypes.TEXT,
  creator_open_id: DataTypes.STRING,
  start_date: { type: DataTypes.DATEONLY, allowNull: false },
  end_date: { type: DataTypes.DATEONLY, allowNull: false },
  window_type: { type: DataTypes.STRING, allowNull: false },
  plan_type: { type: DataTypes.STRING, allowNull: false, defaultValue: 'ALL' },
  currency: { type: DataTypes.STRING, allowNull: false },
  affiliate_gmv: DataTypes.DECIMAL(20, 4),
  live_gmv: DataTypes.DECIMAL(20, 4),
  video_gmv: DataTypes.DECIMAL(20, 4),
  product_card_gmv: DataTypes.DECIMAL(20, 4),
  affiliate_products_sold: DataTypes.INTEGER,
  items_sold: DataTypes.INTEGER,
  estimated_commission: DataTypes.DECIMAL(20, 4),
  estimated_flat_fee: DataTypes.DECIMAL(20, 4),
  average_order_value: DataTypes.DECIMAL(20, 4),
  product_showcase_count: DataTypes.INTEGER,
  affiliate_orders: DataTypes.INTEGER,
  ctr: DataTypes.DECIMAL(12, 8),
  product_impressions: DataTypes.BIGINT,
  average_affiliate_customers: DataTypes.DECIMAL(20, 4),
  live_streams: DataTypes.INTEGER,
  shoppable_videos: DataTypes.INTEGER,
  target_gmv: DataTypes.DECIMAL(20, 4),
  target_estimated_commission: DataTypes.DECIMAL(20, 4),
  open_gmv: DataTypes.DECIMAL(20, 4),
  open_estimated_commission: DataTypes.DECIMAL(20, 4),
  refunded_gmv: DataTypes.DECIMAL(20, 4),
  items_refunded: DataTypes.INTEGER,
  followers: DataTypes.BIGINT,
  raw_metrics: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  synced_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
  tableName: 'tiktok_creator_performance_snapshots',
  timestamps: false,
  indexes: [{ unique: true, fields: ['shop_id', 'username', 'start_date', 'end_date', 'plan_type'] }],
});

const TikTokChannel = sequelize.define('TikTokChannel', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  platform: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'tiktok',
    validate: {
      isIn: [['tiktok', 'youtube', 'facebook']],
    },
  },
  tiktok_open_id: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true,
  },
  creator_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    unique: true,
  },
  username: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  display_name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  avatar_url: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  avatar_large_url: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  bio_description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  is_verified: {
    type: DataTypes.BOOLEAN,
    allowNull: true,
  },
  follower_count: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  following_count: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  likes_count: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  video_count: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  profile_url: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  access_token_encrypted: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  refresh_token_encrypted: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  token_expires_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  refresh_token_expires_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  last_sync_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  last_sync_status: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: {
      isIn: [['success', 'failed']],
    },
  },
  last_sync_error: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  sync_source: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'import',
    validate: {
      isIn: [['oauth', 'import', 'crawler']],
    },
  },
}, {
  tableName: 'tiktok_channels',
  timestamps: false,
});

const Video = sequelize.define('Video', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  platform: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'tiktok',
  },
  platform_video_id: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  channel_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  video_url: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  thumbnail_url: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  published_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  views: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  likes: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  comments: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  shares: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  duration: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  campaign: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  content_type: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  last_synced_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  tableName: 'videos',
  timestamps: false,
  indexes: [
    { fields: ['published_at'] },
    { fields: ['channel_id'] },
  ],
});

const VideoAssignment = sequelize.define('VideoAssignment', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  video_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  assignment_role: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      isIn: [['script', 'editor', 'uploader', 'actor', 'ai_creator']],
    },
  },
}, {
  tableName: 'video_assignments',
  timestamps: false,
  indexes: [
    {
      unique: true,
      fields: ['video_id', 'user_id', 'assignment_role'],
    },
    {
      fields: ['user_id', 'video_id'],
    },
  ],
});

const Product = sequelize.define('Product', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
}, {
  tableName: 'products',
  timestamps: false,
});

const VideoProduct = sequelize.define('VideoProduct', {
  video_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
  },
  product_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
  },
}, {
  tableName: 'video_products',
  timestamps: false,
});

const VideoDailyStats = sequelize.define('VideoDailyStats', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  video_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  views: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  likes: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  comments: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  shares: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
}, {
  tableName: 'video_daily_stats',
  timestamps: false,
  indexes: [
    { fields: ['video_id', 'date'], unique: true },
    { fields: ['date'] },
  ],
});

const WeeklyReport = sequelize.define('WeeklyReport', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  week_start: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  week_end: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  generated_content: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
}, {
  tableName: 'weekly_reports',
  timestamps: false,
});

const FacebookPage = sequelize.define('FacebookPage', {
  id: {
    type: DataTypes.STRING,
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  access_token_encrypted: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  owner_id: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  owner_name: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  avatar_url: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  connected_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  updated_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'facebook_pages',
  timestamps: false,
});

const FacebookOauthState = sequelize.define('FacebookOauthState', {
  state: {
    type: DataTypes.STRING,
    primaryKey: true,
  },
  expires_at: {
    type: DataTypes.DATE,
    allowNull: false,
  },
}, {
  tableName: 'facebook_oauth_states',
  timestamps: false,
});

const FacebookUserSession = sequelize.define('FacebookUserSession', {
  sid: {
    type: DataTypes.STRING,
    primaryKey: true,
  },
  user_id: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  user_name: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  avatar_url: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  user_token_encrypted: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  expires_at: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'facebook_user_sessions',
  timestamps: false,
});

const ChatbotMessage = sequelize.define('ChatbotMessage', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  sender_id: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  page_id: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  display_name: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  avatar_url: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  direction: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      isIn: [['in', 'out']],
    },
  },
  text: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  via: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'system',
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'chatbot_messages',
  timestamps: false,
});

const ChatbotOrder = sequelize.define('ChatbotOrder', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  sender_id: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  page_id: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  raw: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  phone: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  address: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  status: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'new',
    validate: {
      isIn: [['new', 'confirmed', 'done', 'cancelled']],
    },
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'chatbot_orders',
  timestamps: false,
});

const ChatbotKnowledgeDoc = sequelize.define('ChatbotKnowledgeDoc', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  embedding: {
    type: DataTypes.JSONB,
    allowNull: true,
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'chatbot_knowledge_docs',
  timestamps: false,
});

const ChatbotSetting = sequelize.define('ChatbotSetting', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
  },
  provider: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'gemini',
  },
  model: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  ollama_host: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  updated_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'chatbot_settings',
  timestamps: false,
});

User.hasMany(Booking, { foreignKey: 'staff_id', as: 'staff_bookings' });
Booking.belongsTo(User, { foreignKey: 'staff_id', as: 'staff' });
User.hasMany(Booking, { foreignKey: 'creator_id', as: 'creator_bookings' });
Booking.belongsTo(User, { foreignKey: 'creator_id', as: 'creator' });
User.hasOne(TikTokPartnerAuthorization, { foreignKey: 'creator_id', as: 'tiktok_partner_authorization' });
TikTokPartnerAuthorization.belongsTo(User, { foreignKey: 'creator_id', as: 'creator' });
TikTokShopAuthorization.hasMany(TikTokShop, { foreignKey: 'authorization_id', as: 'shops' });
TikTokShop.belongsTo(TikTokShopAuthorization, { foreignKey: 'authorization_id', as: 'authorization' });
TikTokShop.hasMany(TikTokShopAnalyticsSnapshot, { foreignKey: 'shop_id', as: 'analytics_snapshots' });
TikTokShopAnalyticsSnapshot.belongsTo(TikTokShop, { foreignKey: 'shop_id', as: 'shop' });
TikTokShop.hasMany(TikTokCreatorPerformanceExport, { foreignKey: 'shop_id', as: 'creator_performance_exports' });
TikTokCreatorPerformanceExport.belongsTo(TikTokShop, { foreignKey: 'shop_id', as: 'shop' });
TikTokShop.hasMany(TikTokCreatorPerformanceSnapshot, { foreignKey: 'shop_id', as: 'creator_performance_snapshots' });
TikTokCreatorPerformanceSnapshot.belongsTo(TikTokShop, { foreignKey: 'shop_id', as: 'shop' });
TikTokCreatorPerformanceExport.hasMany(TikTokCreatorPerformanceSnapshot, { foreignKey: 'export_id', as: 'creators' });
TikTokCreatorPerformanceSnapshot.belongsTo(TikTokCreatorPerformanceExport, { foreignKey: 'export_id', as: 'export' });

TikTokChannel.hasMany(Video, { foreignKey: 'channel_id', as: 'videos' });
Video.belongsTo(TikTokChannel, { foreignKey: 'channel_id', as: 'channel' });
User.hasOne(TikTokChannel, { foreignKey: 'creator_id', as: 'tiktok_channel' });
TikTokChannel.belongsTo(User, { foreignKey: 'creator_id', as: 'creator' });

Video.hasMany(VideoAssignment, { foreignKey: 'video_id', as: 'assignments' });
VideoAssignment.belongsTo(Video, { foreignKey: 'video_id', as: 'video' });
User.hasMany(VideoAssignment, { foreignKey: 'user_id', as: 'assignments' });
VideoAssignment.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

Video.belongsToMany(Product, {
  through: VideoProduct,
  foreignKey: 'video_id',
  otherKey: 'product_id',
  as: 'products',
});
Product.belongsToMany(Video, {
  through: VideoProduct,
  foreignKey: 'product_id',
  otherKey: 'video_id',
  as: 'videos',
});

Video.hasMany(VideoDailyStats, { foreignKey: 'video_id', as: 'daily_stats' });
VideoDailyStats.belongsTo(Video, { foreignKey: 'video_id', as: 'video' });

FacebookPage.hasMany(ChatbotMessage, { foreignKey: 'page_id', as: 'messages' });
ChatbotMessage.belongsTo(FacebookPage, { foreignKey: 'page_id', as: 'page' });
FacebookPage.hasMany(ChatbotOrder, { foreignKey: 'page_id', as: 'orders' });
ChatbotOrder.belongsTo(FacebookPage, { foreignKey: 'page_id', as: 'page' });

module.exports = {
  User,
  Role,
  Booking,
  TikTokPartnerAuthorization,
  TikTokShopAuthorization,
  TikTokShop,
  TikTokShopAnalyticsSnapshot,
  TikTokCreatorPerformanceExport,
  TikTokCreatorPerformanceSnapshot,
  TikTokChannel,
  Video,
  VideoAssignment,
  Product,
  VideoProduct,
  VideoDailyStats,
  WeeklyReport,
  FacebookPage,
  FacebookOauthState,
  FacebookUserSession,
  ChatbotMessage,
  ChatbotOrder,
  ChatbotKnowledgeDoc,
  ChatbotSetting,
  Report: WeeklyReport,
  sequelize,
};
