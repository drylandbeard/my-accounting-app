import { useTokenStore, useAuthStore } from "@/zustand/authStore";

/**
 * Base API configuration
 */
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "";

/**
 * Default headers for API requests
 */
const DEFAULT_HEADERS = {
  "Content-Type": "application/json",
};

/**
 * API client for unauthenticated requests (public endpoints)
 */
export const publicApi = {
  async get(url: string, options: RequestInit = {}) {
    return fetch(`${API_BASE_URL}${url}`, {
      ...options,
      method: "GET",
      headers: {
        ...DEFAULT_HEADERS,
        ...options.headers,
      },
      credentials: "include", // Include cookies for refresh tokens
    });
  },

  async post(url: string, data?: unknown, options: RequestInit = {}) {
    return fetch(`${API_BASE_URL}${url}`, {
      ...options,
      method: "POST",
      headers: {
        ...DEFAULT_HEADERS,
        ...options.headers,
      },
      body: data ? JSON.stringify(data) : undefined,
      credentials: "include",
    });
  },

  async put(url: string, data?: unknown, options: RequestInit = {}) {
    return fetch(`${API_BASE_URL}${url}`, {
      ...options,
      method: "PUT",
      headers: {
        ...DEFAULT_HEADERS,
        ...options.headers,
      },
      body: data ? JSON.stringify(data) : undefined,
      credentials: "include",
    });
  },

  async delete(url: string, options: RequestInit = {}) {
    return fetch(`${API_BASE_URL}${url}`, {
      ...options,
      method: "DELETE",
      headers: {
        ...DEFAULT_HEADERS,
        ...options.headers,
      },
      credentials: "include",
    });
  },
};

/**
 * API client for authenticated requests (requires access token)
 */
export const authApi = {
  async get(url: string, options: RequestInit = {}) {
    return makeAuthenticatedRequest(url, {
      ...options,
      method: "GET",
    });
  },

  async post(url: string, data?: unknown, options: RequestInit = {}) {
    return makeAuthenticatedRequest(url, {
      ...options,
      method: "POST",
      body: data ? JSON.stringify(data) : undefined,
    });
  },

  async put(url: string, data?: unknown, options: RequestInit = {}) {
    return makeAuthenticatedRequest(url, {
      ...options,
      method: "PUT",
      body: data ? JSON.stringify(data) : undefined,
    });
  },

  async delete(url: string, options: RequestInit = {}) {
    return makeAuthenticatedRequest(url, {
      ...options,
      method: "DELETE",
      body: options.body,
    });
  },
};

// Company-scoped API is now handled automatically by authApi

/**
 * Make an authenticated request with automatic token handling and company context
 */
async function makeAuthenticatedRequest(url: string, options: RequestInit) {
  const { accessToken } = useTokenStore.getState();
  const { user, currentCompany } = useAuthStore.getState();
  
  // Build headers with authentication and company context
  const headers: Record<string, string> = {
    ...DEFAULT_HEADERS,
    ...(options.headers as Record<string, string> || {}),
  };
  
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }
  
  // Automatically include company and user context if available
  if (user) {
    headers["x-user-id"] = user.id;
  }
  
  if (currentCompany) {
    headers["x-company-id"] = currentCompany.id;
  }

  let response = await fetch(`${API_BASE_URL}${url}`, {
    ...options,
    headers,
    credentials: "include", // Include cookies for refresh tokens
  });

  // Auto-refresh on 401 (but only if we had an access token to begin with)
  if (response.status === 401 && accessToken) {
    const refreshed = await refreshTokens();
    if (refreshed) {
      const { accessToken: newToken } = useTokenStore.getState();
      headers["Authorization"] = `Bearer ${newToken}`;
      response = await fetch(`${API_BASE_URL}${url}`, {
        ...options,
        headers,
        credentials: "include",
      });
    } else {
      // If refresh fails, redirect to login
      window.location.href = "/";
    }
  }

  return response;
}

/**
 * Refresh tokens helper
 */
async function refreshTokens(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    });

    if (response.ok) {
      const { accessToken } = await response.json();
      useTokenStore.getState().setAccessToken(accessToken);
      return true;
    }
    
    return false;
  } catch {
    return false;
  }
}

/**
 * Simplified API client - authenticated requests automatically include company context
 */
export const api = {
  // Public API methods (no authentication required)
  public: publicApi,
  
  // Authenticated API methods (automatically includes company context when available)
  ...authApi,
};

export default api; 