const crypto = require('crypto');

const TOKEN_PREFIX = 'v1';

const getEncryptionKey = () => {
  const secret = process.env.TIKTOK_TOKEN_ENCRYPTION_KEY;

  if (!secret || secret.length < 32) {
    throw new Error('TIKTOK_TOKEN_ENCRYPTION_KEY must be set to a secret of at least 32 characters.');
  }

  return crypto.createHash('sha256').update(secret).digest();
};

const encryptToken = (token) => {
  if (!token) {
    return null;
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [TOKEN_PREFIX, iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join(':');
};

const decryptToken = (value) => {
  if (!value) {
    return null;
  }

  const [prefix, ivValue, tagValue, ciphertextValue] = value.split(':');

  // Existing records stored before encryption are kept usable until their next OAuth refresh.
  if (prefix !== TOKEN_PREFIX || !ivValue || !tagValue || !ciphertextValue) {
    return value;
  }

  const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), Buffer.from(ivValue, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
};

const isEncryptedToken = (value) => typeof value === 'string' && value.startsWith(`${TOKEN_PREFIX}:`);

module.exports = { encryptToken, decryptToken, isEncryptedToken };
