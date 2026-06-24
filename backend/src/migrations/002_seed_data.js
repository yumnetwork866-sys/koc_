// Add seed data to database
const { User, Team, Video, Report } = require('../models');

const seedDatabase = async () => {
  try {
    // Create default teams
    const team1 = await Team.findOrCreate({
      where: { name: 'Marketing' },
      defaults: { name: 'Marketing' }
    });

    const team2 = await Team.findOrCreate({
      where: { name: 'Content AI' },
      defaults: { name: 'Content AI' }
    });

    const team3 = await Team.findOrCreate({
      where: { name: 'News Team' },
      defaults: { name: 'News Team' }
    });

    console.log('Default teams created');

    // Create default users
    const user1 = await User.findOrCreate({
      where: { email: 'admin@company.com' },
      defaults: {
        name: 'Admin User',
        email: 'admin@company.com',
        role: 'admin',
        team_id: null
      }
    });

    const user2 = await User.findOrCreate({
      where: { email: 'john@company.com' },
      defaults: {
        name: 'John Doe',
        email: 'john@company.com',
        role: 'employee',
        team_id: team1[0].id
      }
    });

    console.log('Default users created');

    // Create sample data - This is for demonstration only
    console.log('Database seeding completed');
  } catch (error) {
    console.error('Error seeding database:', error);
  }
};

module.exports = {
  up: seedDatabase,
  down: async () => {
    try {
      // Clear all tables
      await User.destroy({ where: {} });
      await Team.destroy({ where: {} });
      await Video.destroy({ where: {} });
      await Report.destroy({ where: {} });
      console.log('Database cleared');
    } catch (error) {
      console.error('Error clearing database:', error);
    }
  }
};