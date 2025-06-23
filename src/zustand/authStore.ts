import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// Types based on your database schema
export interface User {
  id: string;
  email: string;
  role: "Owner" | "Member" | "Accountant";
}

export interface Company {
  id: string;
  name: string;
  description?: string;
}

export interface UserCompany {
  company_id: string;
  role: "Owner" | "Member" | "Accountant";
  companies: Company;
}

interface AuthData {
  user: User;
  companies: UserCompany[];
  currentCompany: Company | null;
  accessToken: string;
}

interface AuthState {
  // Auth data
  user: User | null;
  companies: UserCompany[];
  currentCompany: Company | null;
  
  // Auth status
  isAuthenticated: boolean;
  isLoading: boolean;
  
  // Actions
  setAuth: (auth: AuthData) => void;
  setCurrentCompany: (company: Company | null) => void;
  clearAuth: () => void;
  logout: () => void;
  refreshTokens: () => Promise<boolean>;
}

// Separate store for access token only (no persistence)
interface TokenState {
  accessToken: string | null;
  setAccessToken: (accessToken: string) => void;
  clearTokens: () => void;
}

// Token store - not persisted for security (access token only)
export const useTokenStore = create<TokenState>((set) => ({
  accessToken: null,
  setAccessToken: (accessToken) => set({ accessToken }),
  clearTokens: () => set({ accessToken: null }),
}));

// Secure storage configuration - only use sessionStorage for security
const secureStorage = createJSONStorage(() => ({
  getItem: (name: string) => {
    // Only use sessionStorage for better security
    return sessionStorage.getItem(name);
  },
  setItem: (name: string, value: string) => {
    // Only store in sessionStorage
    sessionStorage.setItem(name, value);
  },
  removeItem: (name: string) => {
    sessionStorage.removeItem(name);
  },
}));

// Main auth store - persists user data but not tokens
export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      companies: [],
      currentCompany: null,
      isAuthenticated: false,
      isLoading: false,

      setAuth: (auth) => {
        // Store user data in persisted store
        set({ 
          user: auth.user,
          companies: auth.companies,
          currentCompany: auth.currentCompany,
          isAuthenticated: true 
        });
        
        // Store access token in separate non-persisted store
        useTokenStore.getState().setAccessToken(auth.accessToken);
      },

      setCurrentCompany: (company) => set({ currentCompany: company }),

      clearAuth: () => {
        set({ 
          user: null,
          companies: [],
          currentCompany: null,
          isAuthenticated: false 
        });
        useTokenStore.getState().clearTokens();
      },

      logout: () => {
        const { clearAuth } = get();
        clearAuth();
        // Clear refresh token cookie by calling logout endpoint
        fetch('/api/auth/logout', { method: 'POST' });
        // Redirect to login page
        window.location.href = '/';
      },

      refreshTokens: async () => {
        try {
          // No need to send refresh token - it's in cookies
          const response = await fetch('/api/auth/refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include', // Important: include cookies
          });

          if (response.ok) {
            const { accessToken } = await response.json();
            useTokenStore.getState().setAccessToken(accessToken);
            return true;
          }
          
          // If refresh fails, clear auth
          get().clearAuth();
          return false;
        } catch {
          get().clearAuth();
          return false;
        }
      },
    }),
    {
      name: 'auth-storage',
      storage: secureStorage,
      partialize: (state) => ({
        // Only persist non-sensitive data
        user: state.user,
        companies: state.companies,
        currentCompany: state.currentCompany,
        isAuthenticated: state.isAuthenticated,
        // Tokens are NOT persisted for security
      }),
    }
  )
);

// HTTP client with automatic token handling
export const createAuthenticatedFetch = () => {
  return async (url: string, options: RequestInit = {}) => {
    const { accessToken } = useTokenStore.getState();
    const { refreshTokens, clearAuth } = useAuthStore.getState();
    
    // Build headers properly
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    };
    
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    let response = await fetch(url, {
      ...options,
      headers,
      credentials: 'include', // Important: include cookies for refresh token
    });

    // Auto-refresh on 401
    if (response.status === 401 && accessToken) {
      const refreshed = await refreshTokens();
      if (refreshed) {
        const { accessToken: newToken } = useTokenStore.getState();
        headers['Authorization'] = `Bearer ${newToken}`;
        response = await fetch(url, {
          ...options,
          headers,
          credentials: 'include',
        });
      } else {
        // If refresh fails, redirect to login
        clearAuth();
        window.location.href = '/';
      }
    }

    return response;
  };
};

// Initialize auth state from tokens on app start
export const initializeAuth = async () => {
  const { isAuthenticated } = useAuthStore.getState();
  const { accessToken } = useTokenStore.getState();
  
  // If we have stored auth state but no access token in memory, try to refresh
  if (isAuthenticated && !accessToken) {
    await useAuthStore.getState().refreshTokens();
  }
  
  // If we have an access token, validate it
  if (accessToken) {
    try {
      const response = await fetch('/api/auth/validate', {
        headers: { 'Authorization': `Bearer ${accessToken}` },
        credentials: 'include',
      });
      
      if (!response.ok) {
        // Token invalid, try refresh
        const refreshed = await useAuthStore.getState().refreshTokens();
        if (!refreshed) {
          useAuthStore.getState().clearAuth();
        }
      }
    } catch {
      useAuthStore.getState().clearAuth();
    }
  }
}; 