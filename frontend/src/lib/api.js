const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
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
