import assert from 'node:assert/strict';
import test from 'node:test';
import {
  creatorMessagingErrorText,
  creatorMessagingText,
  isCreatorMessagingNotice,
} from '../src/lib/tiktokCreatorMessaging.js';

test('creator messaging threshold code is converted to localized copy', () => {
  const t = (key) => `translated:${key}`;
  assert.equal(
    creatorMessagingErrorText(
      new Error('im_threshold_seller_five_before_respond'),
      t,
    ),
    'translated:sellerAffiliate.messageFiveBeforeResponse',
  );
});

test('creator messaging threshold system messages are localized when rendered', () => {
  const t = (key) => `translated:${key}`;
  assert.equal(
    creatorMessagingText('im_threshold_seller_five_before_respond', t),
    'translated:sellerAffiliate.messageFiveBeforeResponse',
  );
  assert.equal(isCreatorMessagingNotice('im_threshold_seller_five_before_respond'), true);
  assert.equal(isCreatorMessagingNotice('Hello creator'), false);
});

test('other creator messaging errors keep their original message', () => {
  assert.equal(
    creatorMessagingErrorText(new Error('Request failed'), () => ''),
    'Request failed',
  );
});
