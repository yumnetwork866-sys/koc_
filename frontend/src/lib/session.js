const SESSION_STORAGE_KEY = 'content_report_session';
const FB_CHATBOT_TOKEN_STORAGE_KEY = 'content_report_fb_chatbot_token';

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

export function getStoredSession() {
  try {
    const session = JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY));
    const payload = decodeTokenPayload(session?.token);

    if (!session?.token || payload?.role !== 'admin' || !Number.isFinite(payload?.exp) || payload.exp < Date.now()) {
      clearStoredSession();
      return null;
    }

    return session;
  } catch {
    clearStoredSession();
    return null;
  }
}

export function saveStoredSession(session) {
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  window.dispatchEvent(new Event('content-report-session-change'));
}

export function clearStoredSession() {
  localStorage.removeItem(SESSION_STORAGE_KEY);
  window.dispatchEvent(new Event('content-report-session-change'));
}

export function hasValidSession() {
  return Boolean(getStoredSession());
}

export function getStoredFacebookChatbotToken() {
  try {
    const token = localStorage.getItem(FB_CHATBOT_TOKEN_STORAGE_KEY);
    return token || null;
  } catch {
    return null;
  }
}

export function saveStoredFacebookChatbotToken(token) {
  if (!token) {
    clearStoredFacebookChatbotToken();
    return;
  }

  localStorage.setItem(FB_CHATBOT_TOKEN_STORAGE_KEY, token);
  window.dispatchEvent(new Event('content-report-fb-chatbot-token-change'));
}

export function clearStoredFacebookChatbotToken() {
  localStorage.removeItem(FB_CHATBOT_TOKEN_STORAGE_KEY);
  window.dispatchEvent(new Event('content-report-fb-chatbot-token-change'));
}
