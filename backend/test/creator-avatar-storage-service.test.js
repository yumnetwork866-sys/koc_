const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  cacheCreatorAvatar,
  cacheCreatorAvatars,
  creatorStorageKey,
  isAllowedAvatarHost,
  isLocalCreatorAvatarUrl,
} = require('../src/services/creatorAvatarStorageService');

test('creator avatar storage accepts only TikTok CDN hosts', () => {
  assert.equal(isAllowedAvatarHost('p16-common-sign.tiktokcdn.com'), true);
  assert.equal(isAllowedAvatarHost('tiktokcdn.com'), true);
  assert.equal(isAllowedAvatarHost('tiktokcdn.com.example.test'), false);
  assert.equal(isAllowedAvatarHost('127.0.0.1'), false);
});

test('creator avatar storage downloads once and returns a stable local URL', async (t) => {
  const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'creator-avatar-test-'));
  t.after(() => fs.rm(storageRoot, { recursive: true, force: true }));
  let fetchCalls = 0;
  const creator = {
    creator_open_id: 'creator-open-id',
    username: 'demo.creator',
    avatar_url: 'https://p16-common-sign.tiktokcdn.com/avatar.webp',
  };
  const fetchImpl = async () => {
    fetchCalls += 1;
    return new Response(Buffer.from('fake-webp-image'), {
      status: 200,
      headers: { 'content-type': 'image/webp' },
    });
  };

  const first = await cacheCreatorAvatar(7, creator, { storageRoot, fetchImpl });
  const second = await cacheCreatorAvatar(7, creator, {
    storageRoot,
    fetchImpl: async () => { throw new Error('must not download an existing avatar'); },
  });

  assert.equal(first, second);
  assert.equal(isLocalCreatorAvatarUrl(first), true);
  assert.equal(fetchCalls, 1);
  assert.equal(
    await fs.readFile(path.join(storageRoot, '7', `${creatorStorageKey(creator)}.webp`), 'utf8'),
    'fake-webp-image',
  );
});

test('creator avatar batch preserves the remote URL when a download is invalid', async () => {
  const warnings = [];
  const [creator] = await cacheCreatorAvatars(7, [{
    username: 'bad.creator',
    avatar_url: 'https://p16-common-sign.tiktokcdn.com/not-an-image',
  }], {
    fetchImpl: async () => new Response('not an image', {
      status: 200,
      headers: { 'content-type': 'text/plain' },
    }),
    logger: { warn(message, details) { warnings.push({ message, details }); } },
  });

  assert.equal(creator.avatar_url, 'https://p16-common-sign.tiktokcdn.com/not-an-image');
  assert.equal(warnings[0].message, '[Creator Avatar Cache] Download failed');
});
