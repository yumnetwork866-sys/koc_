const crypto = require('crypto');

const TOKEN_PREFIX = 'v1';

const getEncryptionKey = () => {
  const secret = process.env.TIKTOK_PARTNER_TOKEN_ENCRYPTION_KEY;
  if (!secret || secret.length < 32) {
    throw new Error('TIKTOK_PARTNER_TOKEN_ENCRYPTION_KEY must be at least 32 characters.');
  }
  return crypto.createHash('sha256').update(secret).digest();
};

const encryptPartnerToken = (token) => {
  if (!token) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [TOKEN_PREFIX, iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join(':');
};

const decryptPartnerToken = (value) => {
  if (!value) return null;
  const [prefix, iv, tag, ciphertext] = String(value).split(':');
  if (prefix !== TOKEN_PREFIX || !iv || !tag || !ciphertext) throw new Error('Stored TikTok Partner token is invalid.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
};

module.exports = { encryptPartnerToken, decryptPartnerToken };
