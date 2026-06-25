const { Team, User } = require('../models');

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'email and password are required' });
    }

    const user = await User.findOne({
      where: { email },
      include: [{ model: Team, as: 'team' }],
    });

    if (!user || user.role !== 'admin' || password !== (process.env.ADMIN_PASSWORD || 'admin123')) {
      return res.status(401).json({ message: 'Invalid admin credentials' });
    }

    res.json({
      token: `admin-demo-${user.id}`,
      user,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  login,
};
