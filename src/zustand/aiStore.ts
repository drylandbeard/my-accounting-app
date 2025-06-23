import { create } from 'zustand';
import { supabase } from '@/lib/supabase';

interface Category {
  id: string;
  name: string;
  type: string;
  company_id: string;
  parent_id?: string | null;
  subtype?: string;
  plaid_account_id?: string | null;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  showConfirmation?: boolean;
  pendingAction?: {
    action: string;
    [key: string]: unknown;
  };
}

interface AIState {
  // Categories data
  categories: Category[];
  isLoadingCategories: boolean;
  
  // AI Panel state
  isPanelOpen: boolean;
  messages: Message[];
  proactiveMode: boolean;
  
  // Actions
  setCategories: (categories: Category[]) => void;
  refreshCategories: (companyId: string) => Promise<void>;
  setPanelOpen: (isOpen: boolean) => void;
  addMessage: (message: Message) => void;
  updateMessage: (index: number, message: Message) => void;
  setMessages: (messages: Message[]) => void;
  setProactiveMode: (mode: boolean) => void;
  
  // AI specific actions
  highlightCategory: (categoryId: string) => void;
  highlightedCategoryIds: Set<string>;
  lastActionId: string | null;
}

export const useAIStore = create<AIState>((set, get) => ({
  // Initial state
  categories: [],
  isLoadingCategories: false,
  isPanelOpen: false,
  messages: [],
  proactiveMode: true,
  highlightedCategoryIds: new Set(),
  lastActionId: null,
  
  // Actions
  setCategories: (categories) => set({ categories }),
  
  refreshCategories: async (companyId: string) => {
    set({ isLoadingCategories: true });
    try {
      const { data: catData, error } = await supabase
        .from('chart_of_accounts')
        .select('*')
        .eq('company_id', companyId)
        .order('parent_id', { ascending: true, nullsFirst: true })
        .order('type', { ascending: true })
        .order('name', { ascending: true });
      
      if (error) {
        console.error('Error refreshing categories:', error);
        return;
      }
      
      set({ categories: catData || [], isLoadingCategories: false });
    } catch (err) {
      console.error('Error in refreshCategories:', err);
      set({ isLoadingCategories: false });
    }
  },
  
  setPanelOpen: (isOpen) => set({ isPanelOpen: isOpen }),
  
  addMessage: (message) => set((state) => ({
    messages: [...state.messages, message]
  })),
  
  updateMessage: (index, message) => set((state) => ({
    messages: state.messages.map((msg, i) => i === index ? message : msg)
  })),
  
  setMessages: (messages) => set({ messages }),
  
  setProactiveMode: (mode) => {
    set({ proactiveMode: mode });
    localStorage.setItem("aiProactiveMode", JSON.stringify(mode));
  },
  
  highlightCategory: (categoryId: string) => {
    const { highlightedCategoryIds } = get();
    const newHighlightedIds = new Set(highlightedCategoryIds);
    newHighlightedIds.add(categoryId);
    
    set({ 
      highlightedCategoryIds: newHighlightedIds,
      lastActionId: categoryId 
    });
    
    // Remove highlight after 3 seconds
    setTimeout(() => {
      const currentState = get();
      const updatedIds = new Set(currentState.highlightedCategoryIds);
      updatedIds.delete(categoryId);
      
      set({
        highlightedCategoryIds: updatedIds,
        lastActionId: currentState.lastActionId === categoryId ? null : currentState.lastActionId
      });
    }, 3000);
  }
})); 