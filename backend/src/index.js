const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const {
  CREATOR_AVATAR_STORAGE_ROOT,
  CREATOR_AVATAR_PUBLIC_PREFIX,
} = require('./services/creatorAvatarStorageService');
require('dotenv').config();

const PORT = process.env.PORT || 8000;

// Import routes
const userRoutes = require('./routes/userRoutes');
const roleRoutes = require('./routes/roleRoutes');
const contentTeamRoutes = require('./routes/contentTeamRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const videoRoutes = require('./routes/videoRoutes');
const reportRoutes = require('./routes/reportRoutes');
const publicReportRoutes = require('./routes/publicReportRoutes');
const channelRoutes = require('./routes/channelRoutes');
const productRoutes = require('./routes/productRoutes');
const assignmentRoutes = require('./routes/assignmentRoutes');
const importRoutes = require('./routes/importRoutes');
const authRoutes = require('./routes/authRoutes');
const assistantRoutes = require('./routes/assistantRoutes');
const chatbotRoutes = require('./routes/chatbotRoutes');
const whatsappRoutes = require('./routes/whatsappRoutes');
const tiktokPartnerPublicRoutes = require('./routes/tiktokPartnerPublicRoutes');
const tiktokShopRoutes = require('./routes/tiktokShopRoutes');
const scheduleRoutes = require('./routes/scheduleRoutes');
const { sequelize, TikTokChannel, User } = require('./models');
const { encryptToken, isEncryptedToken } = require('./lib/tokenEncryption');
const { requireAdmin } = require('./lib/session');
const { getAdminAccount } = require('./lib/adminAccount');
const { startDatabaseScheduler } = require('./services/scheduledJobService');
const { startMarketplaceCreatorDiscoveryJob } = require('./jobs/scheduleMarketplaceCreatorDiscovery');

const httpLogFormat = process.env.HTTP_LOG_FORMAT || ':method :url :status :response-time ms';

const createApp = () => {
  const app = express();

  app.use(helmet());
  app.use(cors({
    origin: process.env.FRONTEND_URL || true,
    credentials: true,
  }));
  app.use(morgan(httpLogFormat));
  app.use(express.json({
    limit: '256kb',
    verify: (req, _res, buffer) => {
      req.rawBody = buffer;
    },
  }));
  app.use(CREATOR_AVATAR_PUBLIC_PREFIX, express.static(CREATOR_AVATAR_STORAGE_ROOT, {
    dotfiles: 'deny',
    fallthrough: false,
    maxAge: '7d',
  }));
  app.use(chatbotRoutes.publicRouter);
  app.use(whatsappRoutes.publicRouter);
  app.use('/api/bookings/tiktok-partner', tiktokPartnerPublicRoutes);
  app.use('/api/public/reports', publicReportRoutes);

  app.get('/', (req, res) => {
    res.json({ message: 'Welcome to Content Performance Reporting API' });
  });

  app.use('/api/users', requireAdmin, userRoutes);
  app.use('/api/roles', requireAdmin, roleRoutes);
  app.use('/api/content-teams', requireAdmin, contentTeamRoutes);
  app.use('/api/bookings', requireAdmin, bookingRoutes);
  app.use('/api/videos', requireAdmin, videoRoutes);
  app.use('/api/reports', requireAdmin, reportRoutes);
  app.use('/api/channels', channelRoutes);
  app.use('/api/products', requireAdmin, productRoutes);
  app.use('/api/assignments', requireAdmin, assignmentRoutes);
  app.use('/api/import', requireAdmin, importRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/assistant', assistantRoutes);
  app.use('/api/chatbot', requireAdmin, chatbotRoutes.adminRouter);
  app.use('/api/whatsapp', requireAdmin, whatsappRoutes.adminRouter);
  app.use('/api/tiktok-shop', requireAdmin, tiktokShopRoutes.adminRouter);
  app.use('/api/schedules', requireAdmin, scheduleRoutes);

  return app;
};

const app = createApp();

const startServer = async () => {
  try {
    if (!process.env.ADMIN_PASSWORD) {
      throw new Error('ADMIN_PASSWORD must be set in .env');
    }

    if (!process.env.SESSION_SECRET) {
      throw new Error('SESSION_SECRET must be set in .env');
    }

    const channels = await TikTokChannel.findAll({
      attributes: ['id', 'access_token_encrypted', 'refresh_token_encrypted'],
    });

    for (const channel of channels) {
      const accessToken = channel.access_token_encrypted;
      const refreshToken = channel.refresh_token_encrypted;

      if ((accessToken && !isEncryptedToken(accessToken)) || (refreshToken && !isEncryptedToken(refreshToken))) {
        await channel.update({
          access_token_encrypted: accessToken ? encryptToken(accessToken) : null,
          refresh_token_encrypted: refreshToken ? encryptToken(refreshToken) : null,
        });
      }
    }

    const adminAccount = getAdminAccount();
    const [adminUser] = await User.findOrCreate({
      where: { email: adminAccount.email },
      defaults: {
        name: adminAccount.username,
        email: adminAccount.email,
        role: 'admin',
      },
    });

    if (adminUser.name !== adminAccount.username || adminUser.email !== adminAccount.email) {
      await adminUser.update({
        name: adminAccount.username,
        email: adminAccount.email,
      });
    }

    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
    startDatabaseScheduler();
    startMarketplaceCreatorDiscoveryJob();
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

if (require.main === module) {
  startServer();
}

module.exports = { app, createApp, startServer };
