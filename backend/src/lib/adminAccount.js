const DEFAULT_ADMIN_USERNAME = 'admin';
const DEFAULT_ADMIN_EMAIL_DOMAIN = 'admin.local';

const slugifyForEmail = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9._-]+/g, '.')
  .replace(/\.{2,}/g, '.')
  .replace(/^\.|\.$/g, '');

const getAdminAccount = () => {
  const username = (process.env.ADMIN_USERNAME || DEFAULT_ADMIN_USERNAME).trim();
  const email = username.includes('@')
    ? username
    : `${slugifyForEmail(username) || DEFAULT_ADMIN_USERNAME}@${DEFAULT_ADMIN_EMAIL_DOMAIN}`;

  return { username, email };
};

module.exports = { getAdminAccount };
