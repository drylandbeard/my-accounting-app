import { create } from 'zustand';

// Types based on your database schema
export interface User {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
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
  access_type?: "direct" | "granted";
  granted_by_accountant?: string;
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

// Helper functions for currentCompany persistence
const getCurrentCompanyFromStorage = (): Company | null => {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem('currentCompany');
    console.log('🔍 Getting company from storage:', stored);
    return stored ? JSON.parse(stored) : null;
  } catch {
    console.log('❌ Error reading company from localStorage');
    return null;
  }
};

const setCurrentCompanyInStorage = (company: Company | null) => {
  if (typeof window === 'undefined') return;
  try {
    if (company) {
      console.log('💾 Storing company in localStorage:', company);
      localStorage.setItem('currentCompany', JSON.stringify(company));
    } else {
      console.log('🗑️ Removing company from localStorage');
      localStorage.removeItem('currentCompany');
    }
  } catch {
    console.log('❌ Error writing to localStorage');
  }
};

// Main auth store - no persistence except for currentCompany
export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  companies: [],
  currentCompany: getCurrentCompanyFromStorage(),
  isAuthenticated: false,
  isLoading: false,

  setAuth: (auth) => {
    console.log('🔐 Setting auth with currentCompany:', auth.currentCompany);
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

  setCurrentCompany: (company) => {
    console.log('🏢 setCurrentCompany called with:', company);
    set({ currentCompany: company });
    setCurrentCompanyInStorage(company);
  },

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
    
    // Update localStorage if current company was updated
    if (state.currentCompany?.id === companyId && updatedCurrentCompany) {
      setCurrentCompanyInStorage(updatedCurrentCompany);
    }
    
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
    
    // Clear localStorage if current company was removed
    if (state.currentCompany?.id === companyId) {
      setCurrentCompanyInStorage(null);
    }
    
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
    setCurrentCompanyInStorage(null);
    useTokenStore.getState().clearTokens();
  },

  logout: () => {
    const { clearAuth } = get();
    clearAuth();
    
    // Clear refresh token cookie by calling logout endpoint (HttpOnly cookies can only be cleared server-side)
    // Make this synchronous to ensure it completes before redirect
    fetch('/api/auth/logout', { 
      method: 'POST', 
      credentials: 'include',
      keepalive: true // Ensures request completes even if page unloads
    }).finally(() => {
      // Clear any non-HttpOnly cookies with similar names as a safety measure
      if (typeof document !== 'undefined') {
        // Clear any potential non-HttpOnly refreshToken cookie
        document.cookie = 'refreshToken=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
        // Clear any other auth-related cookies that might exist
        document.cookie = 'accessToken=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
      }
      
      // Redirect to login page
      window.location.href = '/';
    });
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
  const { setAuth, clearAuth } = useAuthStore.getState();
  
  console.log('🚀 Initializing auth...');
  
  try {
    // Try to validate existing session first
    // This will work with either access token (Authorization header) or refresh token (cookie)
    let response = await fetch('/api/auth/validate', {
      method: 'GET',
      credentials: 'include', // Include cookies
    });

    // If validation succeeds, we have a valid session
    if (response.ok) {
      const data = await response.json();
      if (data.user && data.valid) {
        // Ensure we have a fresh access token
        const { refreshTokens } = useAuthStore.getState();
        const refreshed = await refreshTokens();
        
        if (refreshed) {
                      // Restore currentCompany from localStorage and validate user still has access
            const storedCompany = getCurrentCompanyFromStorage();
            let validCurrentCompany = null;
            
            console.log('📦 Stored company found:', storedCompany);
            console.log('🏢 User companies:', data.companies);
            
            if (storedCompany && data.companies) {
              // Check if stored company is still in user's companies list
              const hasAccess = data.companies.some(
                (userCompany: UserCompany) => userCompany.companies.id === storedCompany.id
              );
              console.log('🔐 User has access to stored company:', hasAccess);
              if (hasAccess) {
                validCurrentCompany = storedCompany;
                console.log('✅ Restoring company:', validCurrentCompany);
              } else {
                console.log('❌ User no longer has access to stored company, clearing...');
                // Clear invalid stored company
                setCurrentCompanyInStorage(null);
              }
            }
          
          setAuth({
            user: data.user,
            companies: data.companies || [],
            currentCompany: validCurrentCompany,
            accessToken: useTokenStore.getState().accessToken!,
          });
          return;
        }
      }
    }
    
    // If validation fails, try to refresh tokens
    if (response.status === 401) {
      const { refreshTokens } = useAuthStore.getState();
      const refreshed = await refreshTokens();
      
      if (refreshed) {
        // After successful refresh, validate again to get user data
        response = await fetch('/api/auth/validate', {
          method: 'GET',
          headers: { 
            'Authorization': `Bearer ${useTokenStore.getState().accessToken}` 
          },
          credentials: 'include',
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.user && data.valid) {
                      // Restore currentCompany from localStorage and validate user still has access
          const storedCompany = getCurrentCompanyFromStorage();
          let validCurrentCompany = null;
          
          console.log('📦 [After refresh] Stored company found:', storedCompany);
          console.log('🏢 [After refresh] User companies:', data.companies);
          
          if (storedCompany && data.companies) {
            // Check if stored company is still in user's companies list
            const hasAccess = data.companies.some(
              (userCompany: UserCompany) => userCompany.companies.id === storedCompany.id
            );
            console.log('🔐 [After refresh] User has access to stored company:', hasAccess);
            if (hasAccess) {
              validCurrentCompany = storedCompany;
              console.log('✅ [After refresh] Restoring company:', validCurrentCompany);
            } else {
              console.log('❌ [After refresh] User no longer has access to stored company, clearing...');
              // Clear invalid stored company
              setCurrentCompanyInStorage(null);
            }
          }
            
            setAuth({
              user: data.user,
              companies: data.companies || [],
              currentCompany: validCurrentCompany,
              accessToken: useTokenStore.getState().accessToken!,
            });
            return;
          }
        }
      }
    }
    
    // If all attempts fail, clear auth state
    clearAuth();
  } catch (error) {
    console.error('Auth initialization error:', error);
    clearAuth();
  }
}; 