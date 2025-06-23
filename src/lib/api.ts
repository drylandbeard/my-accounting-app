import { useTokenStore } from "@/zustand/authStore";

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
    });
  },
};

/**
 * API client for authenticated requests with company context
 */
export const companyApi = {
  async get(url: string, companyId: string, userId: string, options: RequestInit = {}) {
    return makeAuthenticatedRequest(url, {
      ...options,
      method: "GET",
      headers: {
        ...options.headers,
        "x-company-id": companyId,
        "x-user-id": userId,
      },
    });
  },

  async post(url: string, data: unknown, companyId: string, userId: string, options: RequestInit = {}) {
    return makeAuthenticatedRequest(url, {
      ...options,
      method: "POST",
      headers: {
        ...options.headers,
        "x-company-id": companyId,
        "x-user-id": userId,
      },
      body: JSON.stringify(data),
    });
  },

  async put(url: string, data: unknown, companyId: string, userId: string, options: RequestInit = {}) {
    return makeAuthenticatedRequest(url, {
      ...options,
      method: "PUT",
      headers: {
        ...options.headers,
        "x-company-id": companyId,
        "x-user-id": userId,
      },
      body: JSON.stringify(data),
    });
  },

  async delete(url: string, companyId: string, userId: string, options: RequestInit = {}) {
    return makeAuthenticatedRequest(url, {
      ...options,
      method: "DELETE",
      headers: {
        ...options.headers,
        "x-company-id": companyId,
        "x-user-id": userId,
      },
    });
  },
};

/**
 * Make an authenticated request with automatic token handling
 */
async function makeAuthenticatedRequest(url: string, options: RequestInit) {
  const { accessToken } = useTokenStore.getState();
  
  // Build headers with authentication
  const headers: Record<string, string> = {
    ...DEFAULT_HEADERS,
    ...(options.headers as Record<string, string> || {}),
  };
  
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
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
 * Convenience methods for common API patterns
 */
export const api = {
  // Public API methods (no authentication required)
  public: publicApi,
  
  // Authenticated API methods (requires access token)
  auth: authApi,
  
  // Company-scoped API methods (requires access token + company context)
  company: companyApi,
};

export default api; 