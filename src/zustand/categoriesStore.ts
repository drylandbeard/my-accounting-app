import { create } from 'zustand';
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

// Helper function to sort categories the same way as the API
const sortCategories = (categories: Category[]): Category[] => {
  return [...categories].sort((a, b) => {
    // First sort by parent_id (nulls first - parents before children)
    if (a.parent_id === null && b.parent_id !== null) return -1;
    if (a.parent_id !== null && b.parent_id === null) return 1;
    
    // Then by type (alphabetical)
    const typeCompare = a.type.localeCompare(b.type);
    if (typeCompare !== 0) return typeCompare;
    
    // Finally by name (alphabetical)
    return a.name.localeCompare(b.name);
  });
};

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
  refreshCategories: () => Promise<void>;
  addCategory: (category: { name: string; type: string; parent_id?: string | null }) => Promise<Category | null>;
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
  refreshCategories: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.get('/api/category');
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('API error refreshing categories:', errorData.error);
        set({ error: errorData.error || 'Failed to refresh categories', isLoading: false });
        return;
      }
      
      const result = await response.json();
      set({ categories: result.categories || [], isLoading: false });
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

      // Call the API route
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
        // Fallback: add to existing categories with proper sorting if sorted list not available
        const updatedCategories = [...get().categories, newCategory];
        const sortedCategories = sortCategories(updatedCategories);
        set({
          categories: sortedCategories,
          error: null
        });
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
      // Optimistic update with proper sorting
      const { categories } = get();
      const updatedCategories = categories.map((cat) =>
        cat.id === id ? { ...cat, ...updates } : cat
      );
      
      // Sort the categories to match API sorting behavior
      const sortedCategories = sortCategories(updatedCategories);
      set({ categories: sortedCategories, error: null });
      
      // Highlight immediately with optimistic update
      get().highlightCategory(id);
      
      // Prepare data for API call
      const requestData = {
        id,
        ...updates
      };

      // Call the API route
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
      // Optimistic delete
      const { categories } = get();
      const updatedCategories = categories.filter((cat) => cat.id !== id);
      set({ categories: updatedCategories, error: null });
      
      // Call the API route
      const response = await api.delete('/api/category/delete', {
        body: JSON.stringify({ categoryId: id })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('API error deleting category:', errorData.error);
        // Revert optimistic delete
        set({ categories, error: errorData.error || 'Failed to delete category' });
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
      
      return true;
    } catch (err) {
      console.error('Error in deleteCategory:', err);
      // Revert optimistic delete
      const { categories } = get();
      set({ categories, error: 'Failed to delete category' });
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