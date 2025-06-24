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
  updateCategory: (idOrName: string, updates: Partial<Category>) => Promise<boolean>;
  deleteCategory: (idOrName: string) => Promise<boolean>;
  highlightCategory: (categoryId: string) => void;
  clearError: () => void;
  
  // New functionality
  findCategoryByName: (name: string, caseSensitive?: boolean) => Category | null;
  findCategoriesByName: (namePattern: string, caseSensitive?: boolean) => Category[];
  findParentByName: (childId: string, parentName: string) => Category | null;
  moveCategory: (categoryIdOrName: string, newParentIdOrName: string | null) => Promise<boolean>;
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
      // Handle parent_id conversion if it's provided as a name
      let processedParentId = categoryData.parent_id || null;
      if (categoryData.parent_id && typeof categoryData.parent_id === 'string') {
        const isParentUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(categoryData.parent_id);
        
        if (!isParentUUID) {
          // It's likely a name, find the parent category by name
          const parentCategory = get().findCategoryByName(categoryData.parent_id);
          if (!parentCategory) {
            set({ error: `Parent category not found: ${categoryData.parent_id}` });
            return null;
          }
          processedParentId = parentCategory.id;
        }
      }
      
      // Prepare data for API call
      const requestData = {
        name: categoryData.name.trim(),
        type: categoryData.type,
        parent_id: processedParentId,
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
  
  updateCategory: async (idOrName: string, updates) => {
    // Store original categories for potential revert
    const originalCategories = get().categories;
    
    console.log('updateCategory debug:', { 
      idOrName, 
      updates, 
      availableCategories: originalCategories.map(c => ({ id: c.id, name: c.name }))
    }); // Debug log
    
    // Determine if we have an ID or name for the main category
    let categoryId = idOrName;
    let categoryName = null;
    
    // Check if it looks like a UUID (ID) or a name
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrName);
    
    if (!isUUID) {
      // It's likely a name, find the category by name
      const category = get().findCategoryByName(idOrName);
      console.log('Found category by name:', category); // Debug log
      if (!category) {
        set({ error: `Category not found: ${idOrName}` });
        return false;
      }
      categoryId = category.id;
      categoryName = category.name;
    }
    
    // Handle parent_id conversion if it's provided as a name
    let processedUpdates = { ...updates };
    if (updates.parent_id !== undefined && updates.parent_id !== null) {
      const parentIdOrName = updates.parent_id;
      const isParentUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(parentIdOrName);
      
      if (!isParentUUID) {
        // It's likely a name, find the parent category by name
        const parentCategory = get().findCategoryByName(parentIdOrName);
        if (!parentCategory) {
          set({ error: `Parent category not found: ${parentIdOrName}` });
          return false;
        }
        processedUpdates.parent_id = parentCategory.id;
      }
    }
    
    console.log('Final update data:', { categoryId, categoryName, processedUpdates }); // Debug log
    
    try {
      // Optimistic update with proper sorting
      const updatedCategories = originalCategories.map((cat) =>
        cat.id === categoryId ? { ...cat, ...processedUpdates } : cat
      );
      
      // Sort the categories to match API sorting behavior
      const sortedCategories = sortCategories(updatedCategories);
      set({ categories: sortedCategories, error: null });
      
      // Highlight immediately with optimistic update
      get().highlightCategory(categoryId);
      
      // Prepare data for API call
      const requestData = {
        id: categoryId,
        ...processedUpdates
      };

      // Call the API route
      const response = await api.put('/api/category/update', requestData);
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('API error updating category:', errorData.error);
        // Revert optimistic update
        set({ categories: originalCategories, error: errorData.error || 'Failed to update category' });
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
      const errorMessage = err instanceof Error ? err.message : 'Network error occurred';
      set({ categories: originalCategories, error: errorMessage });
      return false;
    }
  },
  
  deleteCategory: async (idOrName: string) => {
    // Store original categories for potential revert
    const originalCategories = get();
    
    // Determine if we have an ID or name
    let categoryId = idOrName;
    let categoryName = null;
    
    // Check if it looks like a UUID (ID) or a name
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrName);
    
    if (!isUUID) {
      // It's likely a name, find the category by name
      const category = get().findCategoryByName(idOrName);
      if (!category) {
        set({ error: `Category not found: ${idOrName}` });
        return false;
      }
      categoryId = category.id;
      categoryName = category.name;
    }
    
    try {
      // Optimistic delete
      const updatedCategories = originalCategories.categories.filter((cat) => cat.id !== categoryId);
      set({ categories: updatedCategories, error: null });
      
      // Call the API route
      const response = await api.delete('/api/category/delete', {
        body: JSON.stringify({ categoryId: categoryId })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('API error deleting category:', errorData.error);
        // Revert optimistic delete
        set({ categories: originalCategories.categories, error: errorData.error || 'Failed to delete category' });
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
      set({ categories: originalCategories.categories, error: 'Failed to delete category' });
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
  },
  
  // New helper functions
  
  // Find a category by name (case-insensitive by default)
  findCategoryByName: (name: string, caseSensitive = false) => {
    const { categories } = get();
    console.log('findCategoryByName debug:', { 
      searchName: name, 
      caseSensitive, 
      availableCategories: categories.map(c => ({ id: c.id, name: c.name }))
    }); // Debug log
    
    if (caseSensitive) {
      const found = categories.find((cat) => cat.name === name) || null;
      console.log('Case-sensitive search result:', found); // Debug log
      return found;
    } else {
      const found = categories.find((cat) => cat.name.toLowerCase() === name.toLowerCase()) || null;
      console.log('Case-insensitive search result:', found); // Debug log
      return found;
    }
  },
  
  // Find categories by partial name (case-insensitive by default)
  findCategoriesByName: (namePattern: string, caseSensitive = false) => {
    const { categories } = get();
    const pattern = caseSensitive ? namePattern : namePattern.toLowerCase();
    
    return categories.filter((cat) => {
      const catName = caseSensitive ? cat.name : cat.name.toLowerCase();
      return catName.includes(pattern);
    });
  },
  
  // Find parent category by name for a specific child
  findParentByName: (childId: string, parentName: string) => {
    const { categories } = get();
    const possibleParents = categories.filter(c => c.name.toLowerCase() === parentName.toLowerCase());
    
    // If multiple categories match, find one with compatible type
    if (possibleParents.length > 1) {
      const child = categories.find(c => c.id === childId);
      if (child) {
        return possibleParents.find(p => p.type === child.type) || possibleParents[0];
      }
    }
    
    return possibleParents[0] || null;
  },
  
  // Move a category under a new parent (or to root if null)
  moveCategory: async (categoryIdOrName: string, newParentIdOrName: string | null) => {
    // Determine if we have IDs or names
    let categoryId = categoryIdOrName;
    let newParentId = newParentIdOrName;
    
    // Check if category looks like a UUID (ID) or a name
    const isCategoryUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(categoryIdOrName);
    
    if (!isCategoryUUID) {
      // It's likely a name, find the category by name
      const category = get().findCategoryByName(categoryIdOrName);
      if (!category) {
        set({ error: `Category not found: ${categoryIdOrName}` });
        return false;
      }
      categoryId = category.id;
    }
    
    // Check if parent looks like a UUID (ID) or a name
    if (newParentIdOrName && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(newParentIdOrName)) {
      // It's likely a name, find the category by name
      const category = get().findCategoryByName(newParentIdOrName);
      if (!category) {
        set({ error: `Parent category not found: ${newParentIdOrName}` });
        return false;
      }
      newParentId = category.id;
    }
    
    // This is essentially an update operation
    return get().updateCategory(categoryId, { parent_id: newParentId });
  },
})); 