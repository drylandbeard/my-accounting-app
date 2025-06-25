import { create } from 'zustand';
import { api } from '@/lib/api';
import { supabase } from '@/lib/supabase';

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
  createCategoryForTransaction: (categoryData: { name: string; type: string; parent_id?: string | null; transactionId?: string | null; selectedTransactions?: Set<string> }) => Promise<{ category: Category | null; shouldUpdateTransactions: boolean; transactionIds: string[] }>;
  updateCategory: (id: string, updates: Partial<Category>) => Promise<boolean>;
  updateCategoryWithMergeCheck: (id: string, updates: Partial<Category>, options?: { allowMergePrompt?: boolean; companyId?: string }) => Promise<{ success: boolean; needsMerge?: boolean; existingCategory?: Category; error?: string }>;
  mergeFromRename: (originalCategoryId: string, existingCategoryId: string, companyId: string) => Promise<boolean>;
  deleteCategory: (id: string) => Promise<boolean>;
  mergeCategories: (selectedCategoryIds: string[], targetCategoryId: string, companyId: string) => Promise<boolean>;
  highlightCategory: (categoryId: string) => void;
  clearError: () => void;
  
  // New functionality
  findCategoryByName: (name: string, caseSensitive?: boolean) => Category | null;
  findCategoriesByName: (namePattern: string, caseSensitive?: boolean) => Category[];
  findParentByName: (childId: string, parentName: string) => Category | null;
  moveCategory: (categoryIdOrName: string, newParentIdOrName: string | null) => Promise<boolean>;
  
  // Real-time subscriptions
  subscriptions: ReturnType<typeof supabase.channel>[];
  subscribeToCategories: (companyId: string) => () => void;
  unsubscribeFromCategories: () => void;
}

export const useCategoriesStore = create<CategoriesState>((set, get) => ({
  // Initial state
  categories: [],
  isLoading: false,
  error: null,
  highlightedCategoryIds: new Set(),
  lastActionCategoryId: null,
  subscriptions: [],
  
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

  createCategoryForTransaction: async (categoryData) => {
    try {
      // Create the category using the existing addCategory function
      const newCategory = await get().addCategory({
        name: categoryData.name,
        type: categoryData.type,
        parent_id: categoryData.parent_id
      });

      if (!newCategory) {
        return { category: null, shouldUpdateTransactions: false, transactionIds: [] };
      }

      // Determine which transactions should be updated
      let transactionIds: string[] = [];
      let shouldUpdateTransactions = false;

      if (categoryData.transactionId) {
        // Check if this transaction is part of a multi-selection
        if (categoryData.selectedTransactions && categoryData.selectedTransactions.has(categoryData.transactionId) && categoryData.selectedTransactions.size > 1) {
          // Apply to all selected transactions
          transactionIds = Array.from(categoryData.selectedTransactions);
          shouldUpdateTransactions = true;
        } else {
          // Apply to single transaction
          transactionIds = [categoryData.transactionId];
          shouldUpdateTransactions = true;
        }
      }

      return {
        category: newCategory,
        shouldUpdateTransactions,
        transactionIds
      };
    } catch (err) {
      console.error('Error in createCategoryForTransaction:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to create category';
      set({ error: errorMessage });
      return { category: null, shouldUpdateTransactions: false, transactionIds: [] };
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
    let finalParentId = updates.parent_id;
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
        finalParentId = parentCategory.id;
      }
    }
    
    const processedUpdates = { ...updates, parent_id: finalParentId };
    
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

  updateCategoryWithMergeCheck: async (id: string, updates, options = {}) => {
    const { allowMergePrompt = true } = options;
    const { categories } = get();
    
    try {
      // Get the original category
      const originalCategory = categories.find(cat => cat.id === id);
      if (!originalCategory) {
        return { success: false, error: 'Category not found' };
      }

      // Check if name is being changed and would create a duplicate
      if (updates.name && updates.name !== originalCategory.name) {
        const existingCategory = categories.find(cat => 
          cat.id !== id && 
          cat.name.toLowerCase() === updates.name!.toLowerCase()
        );

        if (existingCategory) {
          if (allowMergePrompt) {
            // For UI interactions - return info for modal
            return {
              success: false,
              needsMerge: true,
              existingCategory,
              error: `Category "${existingCategory.name}" already exists`
            };
          } else {
            // For AI interactions - just return error
            return {
              success: false,
              error: `Cannot rename category: A category named "${existingCategory.name}" already exists. Consider merging the categories instead.`
            };
          }
        }
      }

      // No conflict, proceed with normal update
      const success = await get().updateCategory(id, updates);
      return { success };
    } catch (err) {
      console.error('Error in updateCategoryWithMergeCheck:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to update category';
      return { success: false, error: errorMessage };
    }
  },

  // New method specifically for merging when rename conflict is detected
  mergeFromRename: async (originalCategoryId: string, existingCategoryId: string, companyId: string) => {
    try {
      const success = await get().mergeCategories(
        [originalCategoryId, existingCategoryId],
        existingCategoryId, // Use existing category as target
        companyId
      );
      return success;
    } catch (err) {
      console.error('Error in mergeFromRename:', err);
      return false;
    }
  },
  
  deleteCategory: async (idOrName: string) => {
    // Store original categories for potential revert
    const originalCategories = get();
    
    // Determine if we have an ID or name
    let categoryId = idOrName;
    
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

  mergeCategories: async (selectedCategoryIds: string[], targetCategoryId: string, companyId: string) => {
    const { categories } = get();
    set({ error: null });

    try {
      // Validation
      if (selectedCategoryIds.length < 2) {
        throw new Error('Please select at least 2 categories to merge');
      }

      if (!selectedCategoryIds.includes(targetCategoryId)) {
        throw new Error('Target category must be one of the selected categories');
      }

      // Get categories to merge
      const categoriesToMerge = categories.filter(cat => selectedCategoryIds.includes(cat.id));
      const targetCategory = categories.find(cat => cat.id === targetCategoryId);
      
      if (!targetCategory) {
        throw new Error('Target category not found');
      }

      // Validate all categories have the same type
      const types = new Set(categoriesToMerge.map(cat => cat.type));
      if (types.size > 1) {
        throw new Error('All categories to merge must have the same type');
      }

      // Get source categories (excluding target)
      const sourceCategories = categoriesToMerge.filter(cat => cat.id !== targetCategoryId);
      const sourceIds = sourceCategories.map(cat => cat.id);
      const sourceNames = sourceCategories.map(cat => cat.name);

      // Prevent circular parent-child relationships
      const wouldCreateCircularReference = sourceCategories.some(() => {
        // Check if target is a child of any source category
        let currentParentId = targetCategory.parent_id;
        while (currentParentId) {
          if (sourceIds.includes(currentParentId)) {
            return true;
          }
          const parentCat = categories.find(cat => cat.id === currentParentId);
          currentParentId = parentCat?.parent_id || null;
        }
        return false;
      });

      if (wouldCreateCircularReference) {
        throw new Error('Cannot merge: This would create a circular parent-child relationship');
      }

      // Execute merge in transaction-like manner using Supabase
      // Step 1: Move subcategories from source categories to target category
      for (const sourceCategory of sourceCategories) {
        const subcategories = categories.filter(cat => cat.parent_id === sourceCategory.id);
        
        if (subcategories.length > 0) {
          const { error: subcatError } = await supabase
            .from('chart_of_accounts')
            .update({ parent_id: targetCategoryId })
            .in('id', subcategories.map(sub => sub.id));

          if (subcatError) {
            throw new Error(`Failed to move subcategories: ${subcatError.message}`);
          }
        }
      }

      // Step 2: Update all transaction references
      if (sourceIds.length > 0) {
        // Update selected_category_id references
        const { error: selectedCatError } = await supabase
          .from('transactions')
          .update({ selected_category_id: targetCategoryId })
          .in('selected_category_id', sourceIds)
          .eq('company_id', companyId);

        if (selectedCatError) {
          throw new Error(`Failed to update transaction selected_category_id: ${selectedCatError.message}`);
        }

        // Update corresponding_category_id references
        const { error: correspondingCatError } = await supabase
          .from('transactions')
          .update({ corresponding_category_id: targetCategoryId })
          .in('corresponding_category_id', sourceIds)
          .eq('company_id', companyId);

        if (correspondingCatError) {
          throw new Error(`Failed to update transaction corresponding_category_id: ${correspondingCatError.message}`);
        }

        // Update imported_transactions references
        const { error: importedTxError } = await supabase
          .from('imported_transactions')
          .update({ selected_category_id: targetCategoryId })
          .in('selected_category_id', sourceIds)
          .eq('company_id', companyId);

        if (importedTxError) {
          throw new Error(`Failed to update imported_transactions: ${importedTxError.message}`);
        }

        // Update journal table references
        const { error: journalError } = await supabase
          .from('journal')
          .update({ chart_account_id: targetCategoryId })
          .in('chart_account_id', sourceIds)
          .eq('company_id', companyId);

        if (journalError) {
          throw new Error(`Failed to update journal entries: ${journalError.message}`);
        }
      }

      // Step 3: Update automations that reference source category names
      if (sourceNames.length > 0) {
        const { error: automationsError } = await supabase
          .from('automations')
          .update({ action_value: targetCategory.name })
          .eq('automation_type', 'category')
          .in('action_value', sourceNames)
          .eq('company_id', companyId);

        if (automationsError) {
          throw new Error(`Failed to update automations: ${automationsError.message}`);
        }
      }

      // Step 4: If target category was a subcategory and we're merging parent categories into it,
      // promote it to parent category
      if (targetCategory.parent_id && sourceCategories.some(cat => !cat.parent_id)) {
        const { error: promoteError } = await supabase
          .from('chart_of_accounts')
          .update({ parent_id: null })
          .eq('id', targetCategoryId);

        if (promoteError) {
          throw new Error(`Failed to promote target category to parent: ${promoteError.message}`);
        }
      }

      // Step 5: Delete source categories
      if (sourceIds.length > 0) {
        const { error: deleteError } = await supabase
          .from('chart_of_accounts')
          .delete()
          .in('id', sourceIds);

        if (deleteError) {
          throw new Error(`Failed to delete source categories: ${deleteError.message}`);
        }
      }

      // Refresh categories to get updated state
      await get().refreshCategories();
      
      // Highlight the merged category
      get().highlightCategory(targetCategoryId);

      return true;
    } catch (err) {
      console.error('Error in mergeCategories:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to merge categories';
      set({ error: errorMessage });
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

  // Real-time subscription functions
  subscribeToCategories: (companyId: string) => {
    // Clean up existing subscriptions first
    get().unsubscribeFromCategories();

    const subscriptions: ReturnType<typeof supabase.channel>[] = [];

    // Subscribe to categories changes
    const categoriesSubscription = supabase
      .channel('categories_changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'chart_of_accounts',
        filter: `company_id=eq.${companyId}`
      }, (payload) => {
        console.log('Categories changed:', payload.eventType);
        get().refreshCategories();
      })
      .subscribe();

    subscriptions.push(categoriesSubscription);
    set({ subscriptions });

    // Return cleanup function
    return () => {
      subscriptions.forEach(subscription => {
        supabase.removeChannel(subscription);
      });
      set({ subscriptions: [] });
    };
  },

  unsubscribeFromCategories: () => {
    const { subscriptions } = get();
    subscriptions.forEach(subscription => {
      supabase.removeChannel(subscription);
    });
    set({ subscriptions: [] });
  }
})); 