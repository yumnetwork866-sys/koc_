const PERMISSIONS = ['reports', 'tiktok', 'users'];

const ALL_PERMISSIONS = [...PERMISSIONS];

const DEFAULT_PERMISSIONS = ['reports'];

const normalizePermissions = (value) => {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((permission) => PERMISSIONS.includes(permission)))];
};

module.exports = { PERMISSIONS, ALL_PERMISSIONS, DEFAULT_PERMISSIONS, normalizePermissions };
