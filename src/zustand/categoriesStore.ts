import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { api } from '@/lib/api';

// Categories Store - manages category/chart of accounts state
// Types
export interface Category {
  id: string;
  name: string;
  type: string;
  company_id: string;
  parent_id?: string | null;
  subtype?: string;
  plaid_account_id?: string | null;
}

// Store interface
interface CategoriesState {
  // Categories data
  categories: Category[];
  isLoading: boolean;
  error: string | null;
  
  // Highlighting for real-time updates
  highlightedCategoryIds: Set<string>;
  lastActionCategoryId: string | null;
  
  // Actions
  refreshCategories: (companyId: string) => Promise<void>;
  addCategory: (category: Omit<Category, 'id'>) => Promise<Category | null>;
  updateCategory: (id: string, updates: Partial<Category>) => Promise<boolean>;
  deleteCategory: (id: string) => Promise<boolean>;
  highlightCategory: (categoryId: string) => void;
  clearError: () => void;
}

export const useCategoriesStore = create<CategoriesState>((set, get) => ({
  // Initial state
  categories: [],
  isLoading: false,
  error: null,
  highlightedCategoryIds: new Set(),
  lastActionCategoryId: null,
  
  // Actions
  refreshCategories: async (companyId: string) => {
    set({ isLoading: true, error: null });
    try {
      const { data, error } = await supabase
        .from('chart_of_accounts')
        .select('*')
        .eq('company_id', companyId)
        .order('parent_id', { ascending: true, nullsFirst: true })
        .order('type', { ascending: true })
        .order('name', { ascending: true });
      
      if (error) {
        console.error('Error refreshing categories:', error);
        set({ error: error.message, isLoading: false });
        return;
      }
      
      set({ categories: data || [], isLoading: false });
    } catch (err) {
      console.error('Error in refreshCategories:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to refresh categories';
      set({ error: errorMessage, isLoading: false });
    }
  },
  
  addCategory: async (categoryData) => {
    try {
      // Prepare data for API call
      const requestData = {
        name: categoryData.name.trim(),
        type: categoryData.type,
        parent_id: categoryData.parent_id || null,
      };

      // Call the API route instead of direct Supabase
      const response = await api.post('/api/category/create', requestData);
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('API error adding category:', errorData.error);
        set({ error: errorData.error || 'Failed to add category' });
        return null;
      }

      const result = await response.json();
      const newCategory = result.category as Category;
      
      // Update the store with the sorted categories from the API
      if (result.categories) {
        set({
          categories: result.categories,
          error: null
        });
      } else {
        // Fallback: add to existing categories if sorted list not available
        set((state) => ({
          categories: [...state.categories, newCategory],
          error: null
        }));
      }
      
      // Highlight the new category
      get().highlightCategory(newCategory.id);
      
      return newCategory;
    } catch (err) {
      console.error('Error in addCategory:', err);
      const errorMessage = err instanceof Error ? err.message : 'Network error occurred';
      set({ error: errorMessage });
      return null;
    }
  },
  
  updateCategory: async (id: string, updates) => {
    try {
      // Optimistic update
      const { categories } = get();
      const updatedCategories = categories.map((cat) =>
        cat.id === id ? { ...cat, ...updates } : cat
      );
      set({ categories: updatedCategories, error: null });
      
      // Prepare data for API call
      const requestData = {
        id,
        ...updates
      };

      // Call the API route instead of direct Supabase
      const response = await api.put('/api/category/update', requestData);
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('API error updating category:', errorData.error);
        // Revert optimistic update
        set({ categories, error: errorData.error || 'Failed to update category' });
        return false;
      }

      const result = await response.json();
      
      // Update the store with the sorted categories from the API if available
      if (result.categories) {
        set({
          categories: result.categories,
          error: null
        });
      }
      
      // Highlight the updated category
      get().highlightCategory(id);
      
      return true;
    } catch (err) {
      console.error('Error in updateCategory:', err);
      // Revert optimistic update
      const { categories } = get();
      const errorMessage = err instanceof Error ? err.message : 'Network error occurred';
      set({ categories, error: errorMessage });
      return false;
    }
  },
  
  deleteCategory: async (id: string) => {
    try {
      // Check if category has subcategories
      const { categories } = get();
      const subcategories = categories.filter(cat => cat.parent_id === id);
      
      if (subcategories.length > 0) {
        set({ error: `Cannot delete category because it has ${subcategories.length} subcategories. Please delete or reassign them first.` });
        return false;
      }
      
      // Check if category is used in transactions
      const { data: transactions, error: txError } = await supabase
        .from('transactions')
        .select('id')
        .or(`selected_category_id.eq.${id},corresponding_category_id.eq.${id}`)
        .limit(1);
      
      if (txError) {
        console.error('Error checking transactions:', txError);
        set({ error: 'Error checking if category is in use. Please try again.' });
        return false;
      }
      
      if (transactions && transactions.length > 0) {
        set({ error: 'Cannot delete category because it is used in existing transactions. Please reassign or delete the transactions first.' });
        return false;
      }
      
      // Optimistic delete
      const updatedCategories = categories.filter((cat) => cat.id !== id);
      set({ categories: updatedCategories, error: null });
      
      const { error } = await supabase
        .from('chart_of_accounts')
        .delete()
        .eq('id', id);
      
      if (error) {
        console.error('Error deleting category:', error);
        // Revert optimistic delete
        set({ categories, error: `Failed to delete category: ${error.message}` });
        return false;
      }
      
      return true;
    } catch (err) {
      console.error('Error in deleteCategory:', err);
      set({ error: 'Failed to delete category' });
      return false;
    }
  },
  
  highlightCategory: (categoryId: string) => {
    const { highlightedCategoryIds } = get();
    const newHighlightedIds = new Set(highlightedCategoryIds);
    newHighlightedIds.add(categoryId);
    
    set({ 
      highlightedCategoryIds: newHighlightedIds,
      lastActionCategoryId: categoryId 
    });
    
    // Remove highlight after 3 seconds
    setTimeout(() => {
      const currentState = get();
      const updatedIds = new Set(currentState.highlightedCategoryIds);
      updatedIds.delete(categoryId);
      
      set({
        highlightedCategoryIds: updatedIds,
        lastActionCategoryId: currentState.lastActionCategoryId === categoryId ? null : currentState.lastActionCategoryId
      });
    }, 3000);
  },
  
  clearError: () => {
    set({ error: null });
  }
})); 