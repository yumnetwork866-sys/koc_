import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getAffiliateOrderProductIds,
  getAffiliateOrderProgramIds,
} from '../src/lib/sellerAffiliate.js';

test('affiliate order fields are collected from every SKU and deduplicated', () => {
  const order = {
    skus: [
      { product_id: 'product-1', open_collaboration_id: 'open-1', target_collaboration_id: '' },
      { product_id: 'product-2', open_collaboration_id: '', target_collaboration_id: 'target-1' },
      { product_id: 'product-1', open_collaboration_id: 'open-1' },
    ],
  };

  assert.deepEqual(getAffiliateOrderProductIds(order), ['product-1', 'product-2']);
  assert.deepEqual(getAffiliateOrderProgramIds(order), ['open-1', 'target-1']);
});

test('affiliate order fields retain support for legacy top-level values', () => {
  const order = {
    product_id: 'legacy-product',
    program_id: 'legacy-program',
  };

  assert.deepEqual(getAffiliateOrderProductIds(order), ['legacy-product']);
  assert.deepEqual(getAffiliateOrderProgramIds(order), ['legacy-program']);
  assert.deepEqual(getAffiliateOrderProductIds(), []);
  assert.deepEqual(getAffiliateOrderProgramIds(), []);
});
