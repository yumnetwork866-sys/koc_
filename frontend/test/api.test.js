import assert from 'node:assert/strict';
import test from 'node:test';
import {
  fetchTikTokSellerMarketplaceCreators, fetchTikTokShopAnalytics, fetchUsers, startTikTokPartnerOauth, startTikTokShopOauth, syncChannelVideos, syncTikTokShopAnalytics,
} from '../src/lib/api.js';
import { getStoredSession, saveStoredSession } from '../src/lib/session.js';

function createStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

function createSession(id) {
  const payload = Buffer.from(JSON.stringify({
    role: 'admin',
    exp: Date.now() + 60_000,
  })).toString('base64url');
  return { token: `${payload}.${id}`, user: { id } };
}

async function withBrowser(callback) {
  const descriptors = new Map(
    ['window', 'localStorage', 'fetch'].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
  );
  const browserWindow = new EventTarget();
  browserWindow.setTimeout = (handler, delay) => setTimeout(handler, delay);
  browserWindow.clearTimeout = (timeoutId) => clearTimeout(timeoutId);

  Object.defineProperty(globalThis, 'window', { configurable: true, value: browserWindow });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: createStorage() });

  try {
    await callback();
  } finally {
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}

function errorResponse(status, message) {
  return new Response(JSON.stringify({ message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('a delayed 401 from an old request does not remove the new login', async () => {
  await withBrowser(async () => {
    const oldSession = createSession('old');
    const newSession = createSession('new');
    let resolveFetch;
    globalThis.fetch = () => new Promise((resolve) => { resolveFetch = resolve; });

    saveStoredSession(oldSession);
    const request = fetchUsers();
    saveStoredSession(newSession);
    resolveFetch(errorResponse(401, 'Session expired'));

    await assert.rejects(request, /Session expired/);
    assert.equal(getStoredSession()?.token, newSession.token);
  });
});

test('a current admin 401 clears the session while a platform 428 does not', async () => {
  await withBrowser(async () => {
    const session = createSession('current');
    saveStoredSession(session);
    globalThis.fetch = async () => errorResponse(428, 'TikTok authorization is required');

    await assert.rejects(syncChannelVideos(1), /TikTok authorization is required/);
    assert.equal(getStoredSession()?.token, session.token);

    globalThis.fetch = async () => errorResponse(401, 'Session expired');
    await assert.rejects(fetchUsers(), /Session expired/);
    assert.equal(getStoredSession(), null);
  });
});

test('TikTok Shop API helpers preserve analytics filters, sync payload and abort signal', async () => {
  await withBrowser(async () => {
    saveStoredSession(createSession('shop-admin'));
    const calls = [];
    globalThis.fetch = async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({ authorizeUrl: 'https://services.example.test/authorize', snapshots: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    await startTikTokShopOauth();
    await fetchTikTokShopAnalytics(7, { startDate: '2026-06-01', endDate: '2026-07-01', currency: 'LOCAL' });
    const controller = new AbortController();
    await syncTikTokShopAnalytics(7, { start_date: '2026-06-01', end_date: '2026-07-01', currency: 'LOCAL' }, controller.signal);

    assert.equal(calls[0].url, '/api/tiktok-shop/oauth/start');
    assert.equal(calls[1].url, '/api/tiktok-shop/shops/7/analytics?start_date=2026-06-01&end_date=2026-07-01&currency=LOCAL');
    assert.equal(calls[2].url, '/api/tiktok-shop/shops/7/analytics/sync');
    assert.equal(calls[2].options.method, 'POST');
    assert.equal(calls[2].options.signal, controller.signal);
    assert.deepEqual(JSON.parse(calls[2].options.body), {
      start_date: '2026-06-01', end_date: '2026-07-01', currency: 'LOCAL',
    });
  });
});

test('Creator OAuth helper sends either creator_id or the explicit create_koc intent', async () => {
  await withBrowser(async () => {
    saveStoredSession(createSession('creator-admin'));
    const calls = [];
    globalThis.fetch = async (url) => {
      calls.push(url);
      return new Response(JSON.stringify({ authorizeUrl: 'https://services.example.test/authorize' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    await startTikTokPartnerOauth('/manage/koc-performance', { creatorId: 42 });
    await startTikTokPartnerOauth('/manage/koc-performance', { createKoc: true });

    assert.equal(calls[0], '/api/bookings/tiktok-partner/oauth/start?return_path=%2Fmanage%2Fkoc-performance&creator_id=42');
    assert.equal(calls[1], '/api/bookings/tiktok-partner/oauth/start?return_path=%2Fmanage%2Fkoc-performance&create_koc=true');
  });
});

test('Creator Marketplace helper sends the discovery keyword and pagination', async () => {
  await withBrowser(async () => {
    saveStoredSession(createSession('marketplace-admin'));
    let request;
    globalThis.fetch = async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify({ creators: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const controller = new AbortController();
    await fetchTikTokSellerMarketplaceCreators(7, {
      keyword: '@demo.creator', pageToken: 'next-page', pageSize: 20, signal: controller.signal,
    });

    assert.equal(request.url, '/api/tiktok-shop/shops/7/affiliate/marketplace-creators?page_token=next-page&page_size=20&keyword=%40demo.creator');
    assert.equal(request.options.signal, controller.signal);
  });
});
