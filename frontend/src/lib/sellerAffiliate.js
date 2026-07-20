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
