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
  refreshToken: string;
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

// Separate store for sensitive tokens (no persistence)
interface TokenState {
  accessToken: string | null;
  refreshToken: string | null;
  setTokens: (accessToken: string, refreshToken: string) => void;
  clearTokens: () => void;
}

// Token store - not persisted for security
export const useTokenStore = create<TokenState>((set) => ({
  accessToken: null,
  refreshToken: null,
  setTokens: (accessToken, refreshToken) => set({ accessToken, refreshToken }),
  clearTokens: () => set({ accessToken: null, refreshToken: null }),
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
        
        // Store tokens in separate non-persisted store
        useTokenStore.getState().setTokens(auth.accessToken, auth.refreshToken);
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
        // Redirect to login page
        window.location.href = '/';
      },

      refreshTokens: async () => {
        const { refreshToken } = useTokenStore.getState();
        if (!refreshToken) return false;

        try {
          const response = await fetch('/api/auth/refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken }),
          });

          if (response.ok) {
            const { accessToken: newAccessToken, refreshToken: newRefreshToken } = await response.json();
            useTokenStore.getState().setTokens(newAccessToken, newRefreshToken);
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
  const { accessToken, refreshToken } = useTokenStore.getState();
  
  // If we have stored auth state but no tokens in memory, try to refresh
  if (isAuthenticated && !accessToken && refreshToken) {
    await useAuthStore.getState().refreshTokens();
  }
  
  // If we have an access token, validate it
  if (accessToken) {
    try {
      const response = await fetch('/api/auth/validate', {
        headers: { 'Authorization': `Bearer ${accessToken}` },
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

// AI Side Panel Store - Global state for AI assistant
interface Category {
  id: string;
  name: string;
  type: string;
  company_id: string;
  parent_id?: string | null;
  subtype?: string;
  plaid_account_id?: string | null;
}

interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  spent?: number;
  received?: number;
  plaid_account_id?: string;
  plaid_account_name?: string;
  selected_category_id?: string;
}

interface Account {
  id: string;
  name: string;
  plaid_account_id?: string;
  company_id: string;
}

interface Payee {
  id: string;
  name: string;
  company_id: string;
}

interface CurrentScreenContext {
  page: 'categories' | 'transactions' | 'reports' | 'settings' | 'automations' | 'journal-table' | 'other';
  data: {
    categories?: Category[];
    transactions?: Transaction[];
    accounts?: Account[];
    payees?: Payee[];
    filteredData?: unknown[];
    searchTerm?: string;
    currentFilters?: Record<string, unknown>;
  };
  lastUpdate: number;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  showConfirmation?: boolean;
  pendingAction?: unknown;
}

interface AISidePanelState {
  // Panel state
  isOpen: boolean;
  panelWidth: number;
  proactiveMode: boolean;
  
  // Chat state
  messages: Message[];
  isLoading: boolean;
  
  // Current screen context - this is what makes it work across all pages
  currentScreenContext: CurrentScreenContext;
  
  // Data state
  categories: Category[];
  transactions: Transaction[];
  accounts: Account[];
  payees: Payee[];
  
  // Activity tracking
  lastActivityTime: number;
  recentProactiveMessages: Set<string>;
  
  // Actions
  setIsOpen: (open: boolean) => void;
  setPanelWidth: (width: number) => void;
  setProactiveMode: (mode: boolean) => void;
  addMessage: (message: Message) => void;
  setMessages: (messages: Message[]) => void;
  clearMessages: () => void;
  setIsLoading: (loading: boolean) => void;
  
  // Context tracking - this is the key feature
  updateScreenContext: (page: CurrentScreenContext['page'], data: CurrentScreenContext['data']) => void;
  
  // Data management
  setCategories: (categories: Category[]) => void;
  setTransactions: (transactions: Transaction[]) => void;
  setAccounts: (accounts: Account[]) => void;
  setPayees: (payees: Payee[]) => void;
  refreshCategories: () => Promise<void>;
  
  // Activity tracking
  updateActivityTime: () => void;
  addProactiveMessage: (messageKey: string) => void;
  clearProactiveMessage: (messageKey: string) => void;
}

const DEFAULT_PANEL_WIDTH = 400;

export const useAISidePanelStore = create<AISidePanelState>()(
  persist(
    (set, get) => ({
      // Initial state
      isOpen: false,
      panelWidth: DEFAULT_PANEL_WIDTH,
      proactiveMode: true,
      messages: [
        {
          role: "assistant",
          content: `👋 Hey there! I'm your **continuous** accounting assistant agent. I'm always monitoring your workflow and looking for ways to optimize it!

🔄 **Continuous Mode**: I'll automatically suggest improvements when you make changes, monitor for new transactions, and check in periodically to help enhance your accounting setup.

I can help you:
• Create and organize chart of account categories
• Set up category hierarchies that make sense for your business
• Proactively suggest optimizations as you work
• Monitor changes and offer continuous improvements
• Answer questions about accounting structure

What kind of business are you running? I'd love to learn more so I can continuously provide tailored suggestions! 💡

*Tip: Toggle the "🔄 Continuous" button in the header if you prefer manual-only assistance.*`,
        },
      ],
      isLoading: false,
      
      currentScreenContext: {
        page: 'other',
        data: {},
        lastUpdate: Date.now(),
      },
      
      categories: [],
      transactions: [],
      accounts: [],
      payees: [],
      
      lastActivityTime: Date.now(),
      recentProactiveMessages: new Set(),
      
      // Actions
      setIsOpen: (open) => set({ isOpen: open }),
      
      setPanelWidth: (width) => {
        set({ panelWidth: width });
        // Also persist to localStorage for immediate persistence
        if (typeof window !== 'undefined') {
          localStorage.setItem('aiPanelWidth', width.toString());
        }
      },
      
      setProactiveMode: (mode) => set({ proactiveMode: mode }),
      
      addMessage: (message) => set((state) => ({ 
        messages: [...state.messages, message] 
      })),
      
      setMessages: (messages) => set({ messages }),
      
      clearMessages: () => set({ 
        messages: [{
          role: "assistant",
          content: `👋 Chat cleared! I'm still here to help with your accounting. What would you like to work on?`,
        }]
      }),
      
      setIsLoading: (loading) => set({ isLoading: loading }),
      
      // This is the key method - updates what the AI can see from the current screen
      updateScreenContext: (page, data) => set((state) => ({
        currentScreenContext: {
          page,
          data: { ...state.currentScreenContext.data, ...data },
          lastUpdate: Date.now(),
        }
      })),
      
      setCategories: (categories) => set({ categories }),
      setTransactions: (transactions) => set({ transactions }),
      setAccounts: (accounts) => set({ accounts }),
      setPayees: (payees) => set({ payees }),
      
      refreshCategories: async () => {
        const authState = useAuthStore.getState();
        const currentCompany = authState.currentCompany;
        
        if (!currentCompany?.id) return;
        
        try {
          const { supabase } = await import('@/lib/supabase');
          const { data, error } = await supabase
            .from('chart_of_accounts')
            .select('*')
            .eq('company_id', currentCompany.id)
            .order('parent_id', { ascending: true, nullsFirst: true })
            .order('type', { ascending: true })
            .order('name', { ascending: true });
          
          if (error) {
            console.error('Error refreshing categories:', error);
            return;
          }
          
          set({ categories: data || [] });
          
          // Update screen context if we're on categories page
          const state = get();
          if (state.currentScreenContext.page === 'categories') {
            state.updateScreenContext('categories', { categories: data || [] });
          }
        } catch (err) {
          console.error('Error in refreshCategories:', err);
        }
      },
      
      updateActivityTime: () => set({ lastActivityTime: Date.now() }),
      
      addProactiveMessage: (messageKey: string) => set((state) => {
        if (state.recentProactiveMessages.has(messageKey)) return state;
        
        const newRecentMessages = new Set(state.recentProactiveMessages);
        newRecentMessages.add(messageKey);
        
        // Add message after a delay (handled by the component)
        return {
          recentProactiveMessages: newRecentMessages,
        };
      }),
      
      clearProactiveMessage: (messageKey) => set((state) => {
        const newRecentMessages = new Set(state.recentProactiveMessages);
        newRecentMessages.delete(messageKey);
        return { recentProactiveMessages: newRecentMessages };
      }),
    }),
    {
      name: 'ai-side-panel-storage',
      partialize: (state) => ({
        // Only persist these specific fields
        panelWidth: state.panelWidth,
        proactiveMode: state.proactiveMode,
        messages: state.messages.map(msg => ({
          role: msg.role,
          content: msg.content,
          // Don't persist confirmation states
        })),
      }),
    }
  )
);

// Hook to easily track current screen context
export const useScreenContext = () => {
  const updateScreenContext = useAISidePanelStore(state => state.updateScreenContext);
  const currentScreenContext = useAISidePanelStore(state => state.currentScreenContext);
  
  return { updateScreenContext, currentScreenContext };
}; 