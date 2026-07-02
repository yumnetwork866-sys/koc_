const { Op } = require('sequelize');
const { User } = require('../models');
const { verifyPassword } = require('../lib/password');
const { createSessionToken } = require('../lib/session');

const login = async (req, res) => {
  try {
    const identifier = (req.body.identifier || req.body.email || req.body.username || '').trim();
    const { password } = req.body;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminPassword) {
      throw new Error('ADMIN_PASSWORD must be set in .env');
    }

    if (!identifier || !password) {
      return res.status(400).json({ message: 'username and password are required' });
    }

    const user = await User.unscoped().findOne({
      where: {
        [Op.or]: [{ email: identifier }, { name: identifier }],
      },
    });

    const passwordIsValid = user?.password_hash
      ? await verifyPassword(password, user.password_hash)
      : password === adminPassword;

    if (!user || user.role !== 'admin' || !passwordIsValid) {
      return res.status(401).json({ message: 'Invalid admin credentials' });
    }

    const safeUser = user.get({ plain: true });
    delete safeUser.password_hash;

    res.json({
      token: createSessionToken(user),
      user: safeUser,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  login,
};
