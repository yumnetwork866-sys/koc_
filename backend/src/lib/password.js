const { randomBytes, scrypt, timingSafeEqual } = require('crypto');
const { promisify } = require('util');

const scryptAsync = promisify(scrypt);

const hashPassword = async (password) => {
  const salt = randomBytes(16).toString('hex');
  const hash = await scryptAsync(password, salt, 64);
  return `${salt}:${hash.toString('hex')}`;
};

const verifyPassword = async (password, passwordHash) => {
  const [salt, storedHash] = (passwordHash || '').split(':');

  if (!salt || !storedHash) {
    return false;
  }

  const derivedHash = await scryptAsync(password, salt, 64);
  const storedHashBuffer = Buffer.from(storedHash, 'hex');

  return storedHashBuffer.length === derivedHash.length
    && timingSafeEqual(storedHashBuffer, derivedHash);
};

module.exports = { hashPassword, verifyPassword };
