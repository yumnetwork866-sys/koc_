export const PERMISSIONS = [
  { key: 'reports', labelKey: 'permissions.reports' },
  { key: 'tiktok', labelKey: 'permissions.tiktok' },
  { key: 'users', labelKey: 'permissions.users' },
];

export const ALL_PERMISSIONS = PERMISSIONS.map((permission) => permission.key);

export const DEFAULT_PERMISSIONS = ['reports'];

export const permissionLabelKey = (key) => (
  PERMISSIONS.find((permission) => permission.key === key)?.labelKey || null
);
