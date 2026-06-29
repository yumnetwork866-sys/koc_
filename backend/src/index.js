const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8000;

// Import routes
const userRoutes = require('./routes/userRoutes');
const teamRoutes = require('./routes/teamRoutes');
const videoRoutes = require('./routes/videoRoutes');
const reportRoutes = require('./routes/reportRoutes');
const channelRoutes = require('./routes/channelRoutes');
const productRoutes = require('./routes/productRoutes');
const assignmentRoutes = require('./routes/assignmentRoutes');
const importRoutes = require('./routes/importRoutes');
const authRoutes = require('./routes/authRoutes');
const chatbotRoutes = require('./routes/chatbotRoutes');
const { sequelize, TikTokChannel, User } = require('./models');
const { encryptToken, isEncryptedToken } = require('./lib/tokenEncryption');
const { requireAdmin } = require('./lib/session');

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || true,
  credentials: true,
}));
app.use(morgan('combined'));
app.use(express.json());
app.use(chatbotRoutes.publicRouter);

// Routes
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to Content Performance Reporting API' });
});

// API routes
app.use('/api/users', requireAdmin, userRoutes);
app.use('/api/teams', requireAdmin, teamRoutes);
app.use('/api/videos', requireAdmin, videoRoutes);
app.use('/api/reports', requireAdmin, reportRoutes);
app.use('/api/channels', channelRoutes);
app.use('/api/products', requireAdmin, productRoutes);
app.use('/api/assignments', requireAdmin, assignmentRoutes);
app.use('/api/import', requireAdmin, importRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/chatbot', requireAdmin, chatbotRoutes.adminRouter);

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

    const adminUsername = process.env.ADMIN_USERNAME || 'admin@company.com';
    const [adminUser] = await User.findOrCreate({
      where: { email: 'admin@company.com' },
      defaults: {
        name: adminUsername,
        email: 'admin@company.com',
        role: 'admin',
        team_id: null,
      },
    });

    if (adminUser.name !== adminUsername) {
      await adminUser.update({ name: adminUsername });
    }

    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

module.exports = app;
