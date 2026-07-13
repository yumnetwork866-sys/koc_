const SESSION_STORAGE_KEY = 'content_report_session';
const FB_CHATBOT_TOKEN_STORAGE_KEY = 'content_report_fb_chatbot_token';
const SESSION_CHANGE_EVENT = 'content-report-session-change';
const FB_CHATBOT_TOKEN_CHANGE_EVENT = 'content-report-fb-chatbot-token-change';
const MAX_TIMEOUT_MS = 2_147_483_647;

function decodeTokenPayload(token) {
  const payload = token?.split('.')?.[0];
  if (!payload) return null;

  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

function readStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function dispatchChange(eventName) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(eventName));
  }
}

function decodeStoredSession(rawSession) {
  try {
    const session = JSON.parse(rawSession);
    const payload = decodeTokenPayload(session?.token);
    return { session, payload };
  } catch {
    return null;
  }
}

export function parseSessionSnapshot(rawSession) {
  const decoded = decodeStoredSession(rawSession);
  if (
    !decoded?.session?.token
    || decoded.payload?.role !== 'admin'
    || !Number.isFinite(decoded.payload?.exp)
    || decoded.payload.exp < Date.now()
  ) {
    return null;
  }

  return decoded.session;
}

export function getStoredSession() {
  return parseSessionSnapshot(readStorage(SESSION_STORAGE_KEY));
}

export function getSessionSnapshot() {
  const rawSession = readStorage(SESSION_STORAGE_KEY);
  return parseSessionSnapshot(rawSession) ? rawSession : null;
}

export function subscribeSession(listener) {
  if (typeof window === 'undefined') return () => {};

  let expirationTimer = null;

  const scheduleExpiration = () => {
    if (expirationTimer !== null) window.clearTimeout(expirationTimer);
    expirationTimer = null;

    const decoded = decodeStoredSession(readStorage(SESSION_STORAGE_KEY));
    const expiration = decoded?.payload?.exp;
    const token = decoded?.session?.token;
    if (!token || decoded.payload?.role !== 'admin' || !Number.isFinite(expiration)) return;

    const expireSession = () => {
      const remaining = expiration - Date.now();
      if (remaining > 0) {
        expirationTimer = window.setTimeout(expireSession, Math.min(remaining + 1, MAX_TIMEOUT_MS));
        return;
      }
      clearStoredSessionIfTokenMatches(token);
    };

    expirationTimer = window.setTimeout(
      expireSession,
      Math.min(Math.max(expiration - Date.now(), 0) + 1, MAX_TIMEOUT_MS),
    );
  };

  const notify = () => {
    scheduleExpiration();
    listener();
  };

  const handleStorage = (event) => {
    if (event.key === SESSION_STORAGE_KEY || event.key === null) {
      notify();
    }
  };

  window.addEventListener('storage', handleStorage);
  window.addEventListener(SESSION_CHANGE_EVENT, notify);
  scheduleExpiration();

  return () => {
    if (expirationTimer !== null) window.clearTimeout(expirationTimer);
    window.removeEventListener('storage', handleStorage);
    window.removeEventListener(SESSION_CHANGE_EVENT, notify);
  };
}

export function saveStoredSession(session) {
  const serializedSession = JSON.stringify(session);

  try {
    const previousSession = localStorage.getItem(SESSION_STORAGE_KEY);
    localStorage.setItem(SESSION_STORAGE_KEY, serializedSession);
    if (previousSession !== serializedSession) dispatchChange(SESSION_CHANGE_EVENT);
  } catch {
    throw new Error('Không thể lưu phiên đăng nhập trên trình duyệt này.');
  }
}

export function clearStoredSession() {
  try {
    if (localStorage.getItem(SESSION_STORAGE_KEY) === null) return false;
    localStorage.removeItem(SESSION_STORAGE_KEY);
    dispatchChange(SESSION_CHANGE_EVENT);
    return true;
  } catch {
    return false;
  }
}

export function clearStoredSessionIfTokenMatches(requestToken) {
  if (!requestToken) return false;

  try {
    const storedSession = JSON.parse(readStorage(SESSION_STORAGE_KEY));
    if (storedSession?.token !== requestToken) return false;
    return clearStoredSession();
  } catch {
    return false;
  }
}

export function hasValidSession() {
  return Boolean(getSessionSnapshot());
}

export function getStoredFacebookChatbotToken() {
  return readStorage(FB_CHATBOT_TOKEN_STORAGE_KEY) || null;
}

export function saveStoredFacebookChatbotToken(token) {
  if (!token) {
    clearStoredFacebookChatbotToken();
    return;
  }

  try {
    const previousToken = localStorage.getItem(FB_CHATBOT_TOKEN_STORAGE_KEY);
    localStorage.setItem(FB_CHATBOT_TOKEN_STORAGE_KEY, token);
    if (previousToken !== token) dispatchChange(FB_CHATBOT_TOKEN_CHANGE_EVENT);
  } catch {
    // A blocked storage API must not crash the application shell.
  }
}

export function clearStoredFacebookChatbotToken() {
  try {
    if (localStorage.getItem(FB_CHATBOT_TOKEN_STORAGE_KEY) === null) return false;
    localStorage.removeItem(FB_CHATBOT_TOKEN_STORAGE_KEY);
    dispatchChange(FB_CHATBOT_TOKEN_CHANGE_EVENT);
    return true;
  } catch {
    return false;
  }
}
