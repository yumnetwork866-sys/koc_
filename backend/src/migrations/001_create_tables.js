const { DataTypes } = require('sequelize');
const { sequelize } = require('../models');

// Migration file to create tables
const createTables = async () => {
  try {
    // Sync models with database
    await sequelize.sync({ alter: true });
    console.log('Database & tables created successfully!');
  } catch (error) {
    console.error('Error creating tables:', error);
  }
};

module.exports = {
  up: createTables,
  down: async () => {
    try {
      // Drop all tables
      await sequelize.drop();
      console.log('Tables dropped successfully!');
    } catch (error) {
      console.error('Error dropping tables:', error);
    }
  }
};