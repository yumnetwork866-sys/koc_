const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

async function apiRequest(path, options = {}) {
  const body = options.body && typeof options.body !== 'string'
    ? JSON.stringify(options.body)
    : options.body;

  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
    body,
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

    throw new Error(message);
  }

  return response.json();
}

export function getApiBaseUrl() {
  return API_BASE_URL;
}

export function fetchUsers(signal) {
  return apiRequest('/users', { signal });
}

export function fetchTeams(signal) {
  return apiRequest('/teams', { signal });
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

export function fetchProducts(signal) {
  return apiRequest('/products', { signal });
}

export function fetchAssignments(signal) {
  return apiRequest('/assignments', { signal });
}

export function createTeam(payload) {
  return apiRequest('/teams', {
    method: 'POST',
    body: payload,
  });
}

export function createUser(payload) {
  return apiRequest('/users', {
    method: 'POST',
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

export function importPlatformData(payload) {
  return apiRequest('/import/platform', {
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
