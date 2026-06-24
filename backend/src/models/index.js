const { DataTypes } = require('sequelize');
const sequelize = require('../db/config');

// User model
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
  },
  role: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  team_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
}, {
  tableName: 'users',
  timestamps: false,
});

// Team model
const Team = sequelize.define('Team', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
}, {
  tableName: 'teams',
  timestamps: false,
});

// Video model
const Video = sequelize.define('Video', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  creator_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  team_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  type: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  published_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  views: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  revenue: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00,
  },
}, {
  tableName: 'videos',
  timestamps: false,
});

// Report model
const Report = sequelize.define('Report', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  total_videos: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  total_views: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  total_revenue: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00,
  },
  report_date: {
    type: DataTypes.DATE,
    allowNull: false,
  },
}, {
  tableName: 'reports',
  timestamps: false,
});

// Define relationships
User.belongsTo(Team, { foreignKey: 'team_id' });
Team.hasMany(User, { foreignKey: 'team_id' });

Video.belongsTo(User, { foreignKey: 'creator_id' });
User.hasMany(Video, { foreignKey: 'creator_id' });

Video.belongsTo(Team, { foreignKey: 'team_id' });
Team.hasMany(Video, { foreignKey: 'team_id' });

Report.belongsTo(User, { foreignKey: 'user_id' });
User.hasMany(Report, { foreignKey: 'user_id' });

module.exports = {
  User,
  Team,
  Video,
  Report,
  sequelize,
};