const { User, Role } = require('../models');
const { hashPassword } = require('../lib/password');
const MIN_PASSWORD_LENGTH = 8;

const roleExists = async (role) => Boolean(await Role.findByPk(role));

const serializeUser = (user) => {
  const safeUser = user.get({ plain: true });
  delete safeUser.password_hash;
  return safeUser;
};

// Get all users
const getUsers = async (req, res) => {
  try {
    const users = await User.findAll({
      order: [['id', 'ASC']],
    });
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get user by ID
const getUserById = async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Create new user
const createUser = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }

    if (role && !(await roleExists(role))) {
      return res.status(400).json({ message: 'Invalid role' });
    }

    const user = await User.create({
      name,
      email,
      role,
      password_hash: await hashPassword(password),
    });
    res.status(201).json(serializeUser(user));
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Update user
const updateUser = async (req, res) => {
  try {
    if (req.body.role && !(await roleExists(req.body.role))) {
      return res.status(400).json({ message: 'Invalid role' });
    }

    const payload = {};

    if (typeof req.body.name === 'string' && req.body.name.trim()) {
      payload.name = req.body.name.trim();
    }

    if (typeof req.body.email === 'string' && req.body.email.trim()) {
      payload.email = req.body.email.trim();
    }

    if (typeof req.body.role === 'string' && req.body.role.trim()) {
      payload.role = req.body.role.trim();
    }

    if (typeof req.body.password === 'string' && req.body.password.trim()) {
      if (req.body.password.length < MIN_PASSWORD_LENGTH) {
        return res.status(400).json({ message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
      }
      payload.password_hash = await hashPassword(req.body.password);
    }

    if (!Object.keys(payload).length) {
      return res.status(400).json({ message: 'No update fields provided' });
    }

    const [updated] = await User.update(payload, {
      where: { id: req.params.id },
      validate: true,
    });
    if (updated) {
      const updatedUser = await User.findByPk(req.params.id);
      res.json(serializeUser(updatedUser));
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Delete user
const deleteUser = async (req, res) => {
  try {
    const deleted = await User.destroy({
      where: { id: req.params.id }
    });
    if (deleted) {
      res.json({ message: 'User deleted successfully' });
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser
};
