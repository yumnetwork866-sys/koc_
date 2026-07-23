const { TikTokTargetCollaborationSnapshot } = require('../models');
const { contactDate } = require('./tiktokCreatorContactHistoryService');

const dateFromFields = (row, fields) => {
  for (const field of fields) {
    const value = contactDate(row?.[field]);
    if (value) return value;
  }
  return null;
};

const collaborationId = (row) => String(
  row?.id || row?.collaboration_id || row?.target_collaboration_id || '',
).trim();

const saveTargetCollaborationSnapshots = async (shopId, collaborations = [], {
  model = TikTokTargetCollaborationSnapshot,
  syncedAt = new Date(),
} = {}) => {
  const rows = collaborations
    .filter((row) => collaborationId(row))
    .map((row) => ({
      shop_id: Number(shopId),
      collaboration_id: collaborationId(row),
      name: row.name || row.title || null,
      status: String(row.status || row.collaboration_status || '').toUpperCase() || null,
      start_at: dateFromFields(row, ['start_time', 'start_at', 'valid_from']),
      end_at: dateFromFields(row, ['end_time', 'end_at', 'valid_until', 'expiration_time']),
      raw_data: row,
      synced_at: syncedAt,
    }));
  if (!rows.length) return 0;
  await model.bulkCreate(rows, {
    conflictAttributes: ['shop_id', 'collaboration_id'],
    updateOnDuplicate: ['name', 'status', 'start_at', 'end_at', 'raw_data', 'synced_at'],
  });
  return rows.length;
};

module.exports = { collaborationId, saveTargetCollaborationSnapshots };
