import { clearStoredSession, getStoredSession, getStoredFacebookChatbotToken } from './session';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

async function apiRequest(path, options = {}) {
  const body = options.body && typeof options.body !== 'string'
    ? JSON.stringify(options.body)
    : options.body;

  const sessionToken = getStoredSession()?.token || null;
  const facebookChatbotToken = options.facebookToken || null;
  const { signal, ...restOptions } = options;

  const response = await fetch(`${API_BASE_URL}${path}`, {
    cache: 'no-store',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
      ...(facebookChatbotToken ? { 'X-FB-Chatbot-Token': facebookChatbotToken } : {}),
      ...(restOptions.headers || {}),
    },
    ...restOptions,
    body,
    ...(signal ? { signal } : {}),
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;

    try {
      const payload = await response.json();
      if (payload?.message) {
        message = payload.message;
      }
    } catch {
      // Ignore JSON parse failures and keep the generic error.
    }

    if (response.status === 401 && path !== '/auth/login') {
      clearStoredSession();
    }

    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return response.json();
}

export function getApiBaseUrl() {
  return API_BASE_URL;
}

export function fetchUsers(signal) {
  return apiRequest('/users', { signal });
}

export function fetchVideos(signal) {
  return apiRequest('/videos', { signal });
}

export function fetchReports(signal) {
  return apiRequest('/reports', { signal });
}

export function fetchKpis(signal) {
  return apiRequest('/reports/kpis', { signal });
}

export function fetchChannels(signal) {
  return apiRequest('/channels', { signal });
}

export function deleteChannel(channelId) {
  return apiRequest(`/channels/${channelId}`, {
    method: 'DELETE',
  });
}

export function syncChannelVideos(channelId) {
  return apiRequest(`/channels/${channelId}/sync-videos`, {
    method: 'POST',
  });
}

export function revokeChannelAuthorization(channelId) {
  return apiRequest(`/channels/${channelId}/revoke`, {
    method: 'POST',
  });
}

export function fetchProducts(signal) {
  return apiRequest('/products', { signal });
}

export function fetchAssignments(signal) {
  return apiRequest('/assignments', { signal });
}

export function createUser(payload) {
  return apiRequest('/users', {
    method: 'POST',
    body: payload,
  });
}

export function updateUser(userId, payload) {
  return apiRequest(`/users/${userId}`, {
    method: 'PUT',
    body: payload,
  });
}

export function deleteUser(userId) {
  return apiRequest(`/users/${userId}`, {
    method: 'DELETE',
  });
}

export function createChannel(payload) {
  return apiRequest('/channels', {
    method: 'POST',
    body: payload,
  });
}

export function createVideo(payload) {
  return apiRequest('/videos', {
    method: 'POST',
    body: payload,
  });
}

export function createAssignment(payload) {
  return apiRequest('/assignments', {
    method: 'POST',
    body: payload,
  });
}

export function generateWeeklyReport(payload) {
  return apiRequest('/reports/generate', {
    method: 'POST',
    body: payload,
  });
}

export function loginAdmin(payload) {
  return apiRequest('/auth/login', {
    method: 'POST',
    body: payload,
  });
}

export function getTikTokOauthUrl() {
  return apiRequest('/channels/oauth/tiktok/start').then((response) => response.authorizeUrl);
}

export function getFacebookOauthUrl() {
  return apiRequest('/chatbot/facebook/start').then((response) => response.authorizeUrl);
}

export function fetchChatbotFacebookMe(signal) {
  return apiRequest('/chatbot/facebook/me', { signal, facebookToken: getStoredFacebookChatbotToken() });
}

export function logoutChatbotFacebook() {
  return apiRequest('/chatbot/facebook/logout', { method: 'POST', facebookToken: getStoredFacebookChatbotToken() });
}

export function revokeChatbotFacebookAccount() {
  return apiRequest('/chatbot/facebook/revoke', { method: 'POST', facebookToken: getStoredFacebookChatbotToken() });
}

export function revokeChatbotFacebookAccountByUser(userId) {
  return apiRequest(`/chatbot/facebook/users/${encodeURIComponent(userId)}/revoke`, {
    method: 'POST',
    facebookToken: getStoredFacebookChatbotToken(),
  });
}

export function fetchFacebookManagedPages(signal) {
  return apiRequest('/chatbot/facebook/me/pages', { signal, facebookToken: getStoredFacebookChatbotToken() });
}

export function connectFacebookPage(pageId) {
  return apiRequest(`/chatbot/pages/${pageId}/connect`, { method: 'POST', facebookToken: getStoredFacebookChatbotToken() });
}

export function disconnectFacebookPage(pageId) {
  return apiRequest(`/chatbot/pages/${pageId}`, { method: 'DELETE', facebookToken: getStoredFacebookChatbotToken() });
}

export function fetchChatbotPages(signal) {
  return apiRequest('/chatbot/pages', { signal });
}

export function fetchChatbotStats(signal) {
  return apiRequest('/chatbot/stats', { signal });
}

export function fetchChatbotConversations(signal) {
  return apiRequest('/chatbot/conversations', { signal });
}

export function fetchChatbotMessages(senderId, pageId, signal) {
  const params = new URLSearchParams({ senderId });
  if (pageId) params.set('pageId', pageId);
  return apiRequest(`/chatbot/messages?${params.toString()}`, { signal });
}

export function sendChatbotMessage(payload) {
  return apiRequest('/chatbot/send', { method: 'POST', body: payload });
}

export function fetchChatbotOrders(signal) {
  return apiRequest('/chatbot/orders', { signal });
}

export function updateChatbotOrder(orderId, payload) {
  return apiRequest(`/chatbot/orders/${orderId}`, { method: 'PATCH', body: payload });
}

export function fetchChatbotKnowledgeDocs(signal) {
  return apiRequest('/chatbot/kb', { signal });
}

export function createChatbotKnowledgeDoc(payload) {
  return apiRequest('/chatbot/kb', { method: 'POST', body: payload });
}

export function deleteChatbotKnowledgeDoc(docId) {
  return apiRequest(`/chatbot/kb/${docId}`, { method: 'DELETE' });
}

export function fetchChatbotSettings(signal) {
  return apiRequest('/chatbot/settings', { signal });
}

export function fetchChatbotOllamaModels(signal) {
  return apiRequest('/chatbot/ollama/models', { signal });
}

export function updateChatbotSettings(payload) {
  return apiRequest('/chatbot/settings', {
    method: 'PUT',
    body: payload,
  });
}
