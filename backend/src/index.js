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
const { sequelize } = require('./models');

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());

// Routes
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to Content Performance Reporting API' });
});

// API routes
app.use('/api/users', userRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/videos', videoRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/channels', channelRoutes);
app.use('/api/products', productRoutes);
app.use('/api/assignments', assignmentRoutes);
app.use('/api/import', importRoutes);
app.use('/api/auth', authRoutes);

const startServer = async () => {
  try {
    await sequelize.sync({ alter: true });
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to initialize database schema:', error);
    process.exit(1);
  }
};

startServer();

module.exports = app;
