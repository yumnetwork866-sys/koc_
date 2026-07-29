const GMV_RANGES = [
  'GMV_RANGE_0_100',
  'GMV_RANGE_100_1000',
  'GMV_RANGE_1000_10000',
  'GMV_RANGE_10000_AND_ABOVE',
];

const UNITS_SOLD_RANGES = [
  'UNITS_SOLD_RANGE_0_10',
  'UNITS_SOLD_RANGE_10_100',
  'UNITS_SOLD_RANGE_100_1000',
  'UNITS_SOLD_RANGE_1000_AND_ABOVE',
];

// TikTok Marketplace Search is a ranked search endpoint, not a full catalog
// export. The unfiltered result set is finite, so follow it with bounded,
// stable segments to expose creators outside the default ranking.
const MARKETPLACE_DISCOVERY_SEGMENTS = [
  { key: 'all', filters: {} },
  ...GMV_RANGES.flatMap((gmvRange) => UNITS_SOLD_RANGES.map((unitsSoldRange) => ({
    key: `${gmvRange}:${unitsSoldRange}`,
    filters: {
      gmv_ranges: [gmvRange],
      units_sold_ranges: [unitsSoldRange],
    },
  }))),
];

const marketplaceDiscoverySegment = (index) => (
  MARKETPLACE_DISCOVERY_SEGMENTS[
    Math.min(
      MARKETPLACE_DISCOVERY_SEGMENTS.length - 1,
      Math.max(0, Number(index) || 0),
    )
  ]
);

module.exports = {
  GMV_RANGES,
  UNITS_SOLD_RANGES,
  MARKETPLACE_DISCOVERY_SEGMENTS,
  marketplaceDiscoverySegment,
};
