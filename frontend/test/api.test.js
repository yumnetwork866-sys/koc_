import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchUsers, syncChannelVideos } from '../src/lib/api.js';
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
