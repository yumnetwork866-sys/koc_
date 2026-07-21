const uniqueValues = (values) => [...new Set(values
  .filter((value) => value !== undefined && value !== null && String(value).trim())
  .map(String))];

export const getAffiliateOrderProductIds = (order = {}) => uniqueValues([
  order.product_id,
  order.product?.id,
  ...(Array.isArray(order.skus) ? order.skus.map((sku) => sku?.product_id) : []),
]);

export const getAffiliateOrderProgramIds = (order = {}) => uniqueValues([
  order.program_id,
  order.collaboration_id,
  ...(Array.isArray(order.skus)
    ? order.skus.flatMap((sku) => [sku?.target_collaboration_id, sku?.open_collaboration_id])
    : []),
]);

const metricSources = (creator = {}) => [
  creator,
  creator.content_performance,
  creator.video_performance,
  creator.performance,
].filter(Boolean);

export const getCreatorMetric = (creator, names) => {
  for (const source of metricSources(creator)) {
    for (const name of names) {
      if (source[name] !== undefined && source[name] !== null && source[name] !== '') return source[name];
    }
  }
  return null;
};

const numericPercentage = (value) => {
  const numeric = Number(String(value ?? '').trim().replace('%', '').replaceAll(',', ''));
  return Number.isFinite(numeric) ? numeric : null;
};

// Marketplace model values are percentages unless the payload explicitly identifies
// a ratio or basis-point unit. This avoids guessing the unit from the value itself:
// 0.4 means 0.4%, while { ratio: 0.4 } means 40%.
export const normalizeEngagementPercentage = (value) => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'object') return numericPercentage(value);

  if (value.percentage !== undefined) return numericPercentage(value.percentage);
  if (value.percentage_value !== undefined) return numericPercentage(value.percentage_value);
  if (value.ratio !== undefined) {
    const ratio = numericPercentage(value.ratio);
    return ratio === null ? null : ratio * 100;
  }

  const candidate = value.value ?? value.rate ?? value.amount;
  const numeric = numericPercentage(candidate);
  if (numeric === null) return null;
  const unit = String(value.unit || value.value_unit || value.rate_unit || '').trim().toUpperCase();
  if (['RATIO', 'FRACTION', 'DECIMAL'].includes(unit)) return numeric * 100;
  if (['BASIS_POINT', 'BASIS_POINTS', 'BPS', 'HUNDREDTH_OF_PERCENT'].includes(unit)) return numeric / 100;
  return numeric;
};

const finiteMetric = (creator, names) => {
  const value = getCreatorMetric(creator, names);
  if (value === null) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

export const getCreatorVideoEngagementRate = (creator) => {
  const views = finiteMetric(creator, [
    'avg_ec_video_play_count',
    'avg_ec_video_view_count',
    'avg_ec_video_views',
    'avg_video_view_count',
    'avg_video_views',
  ]);
  if (views !== null && views > 0) {
    const interactions = finiteMetric(creator, [
      'avg_ec_video_interaction_count',
      'avg_video_interaction_count',
    ]);
    if (interactions !== null) return interactions / views * 100;

    const likes = finiteMetric(creator, ['avg_ec_video_like_count', 'avg_video_like_count']);
    const comments = finiteMetric(creator, ['avg_ec_video_comment_count', 'avg_video_comment_count']);
    const shares = finiteMetric(creator, ['avg_ec_video_share_count', 'avg_video_share_count']);
    if (likes !== null || comments !== null || shares !== null) {
      return ((likes || 0) + (comments || 0) + (shares || 0)) / views * 100;
    }
  }

  const providedRate = getCreatorMetric(creator, [
    'ec_video_engagement_rate',
    'avg_ec_video_engagement_rate',
    'ec_video_engagement',
    'video_engagement_rate',
    'avg_video_engagement_rate',
    'video_engagement',
    'engagement_rate',
  ]);
  return normalizeEngagementPercentage(providedRate);
};
