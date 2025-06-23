import { create } from 'zustand';

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
  updateCompany: (companyId: string, updates: Partial<Company>) => void;
  removeCompany: (companyId: string) => void;
  addMemberToCurrentCompany: (member: { id: string; email: string; role: "Owner" | "Member" | "Accountant" }) => void;
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

// Main auth store - no persistence, everything in memory
export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  companies: [],
  currentCompany: null,
  isAuthenticated: false,
  isLoading: false,

  setAuth: (auth) => {
    // Store user data in memory only
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

  updateCompany: (companyId, updates) => set((state) => {
    // Update in companies array
    const updatedCompanies = state.companies.map(userCompany => 
      userCompany.companies.id === companyId 
        ? { ...userCompany, companies: { ...userCompany.companies, ...updates } }
        : userCompany
    );
    
    // Update current company if it's the one being updated
    const updatedCurrentCompany = state.currentCompany?.id === companyId
      ? { ...state.currentCompany, ...updates }
      : state.currentCompany;
    
    return {
      companies: updatedCompanies,
      currentCompany: updatedCurrentCompany
    };
  }),

  removeCompany: (companyId) => set((state) => {
    // Remove from companies array
    const updatedCompanies = state.companies.filter(userCompany => 
      userCompany.companies.id !== companyId
    );
    
    // Clear current company if it's the one being removed
    const updatedCurrentCompany = state.currentCompany?.id === companyId
      ? null
      : state.currentCompany;
    
    return {
      companies: updatedCompanies,
      currentCompany: updatedCurrentCompany
    };
  }),

  addMemberToCurrentCompany: (member) => {
    // This is primarily for UI state management - the backend handles the actual DB updates
    // For now, this is a placeholder. In a full implementation, you might want to track team members in Zustand
    console.log("Member added to company:", member);
  },

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
    fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
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
}));

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

// Initialize auth state on app start
export const initializeAuth = async () => {
  const { setAuth, refreshTokens } = useAuthStore.getState();
  const { accessToken } = useTokenStore.getState();
  
  // If we have a refresh token cookie but no access token, try to refresh
  if (!accessToken) {
    const refreshed = await refreshTokens();
    
    if (refreshed) {
      // After refresh, validate the session to get user data and companies
      try {
        const response = await fetch('/api/auth/validate', {
          headers: { 
            'Authorization': `Bearer ${useTokenStore.getState().accessToken}` 
          },
          credentials: 'include',
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.user) {
            setAuth({
              user: data.user,
              companies: data.companies || [],
              currentCompany: data.currentCompany || null,
              accessToken: useTokenStore.getState().accessToken!,
            });
          }
        }
      } catch {
        // Silent fail - user will need to login
      }
    }
  }
}; 