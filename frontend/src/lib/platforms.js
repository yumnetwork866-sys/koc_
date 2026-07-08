export const PLATFORMS = [
  { key: 'tiktok', label: 'TikTok', status: 'active', description: 'Primary platform' },
  { key: 'youtube', label: 'YouTube', status: 'placeholder', description: 'Coming soon' },
  { key: 'facebook', label: 'Facebook', status: 'active', description: 'Primary platform' },
];

export function getPlatformLabel(platform) {
  return PLATFORMS.find((item) => item.key === platform)?.label || platform || 'Unknown';
}
