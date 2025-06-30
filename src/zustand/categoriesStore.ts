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

// Import functionality types
export interface CategoryImportData {
  id: string;
  name: string;
  type: string;
  subtype?: string;
  parent_id?: string | null;
  company_id?: string;
  isValid: boolean;
  validationMessage?: string;
  needsParentCreation?: boolean;
  parentName?: string;
}

export interface CategoryCSVRow {
  Name: string;
  Type: string;
  Parent?: string;
}

export interface SelectOption {
  value: string;
  label: string;
}

// Constants
const ACCOUNT_TYPES = ["Asset", "Liability", "Equity", "Revenue", "COGS", "Expense"];

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
  
  // Parent options for dropdowns
  parentOptions: Category[];
  
  // Highlighting for real-time updates
  highlightedCategoryIds: Set<string>;
  lastActionCategoryId: string | null;
  
  // Actions
  refreshCategories: () => Promise<void>;
  addCategory: (category: { name: string; type: string; parent_id?: string | null }) => Promise<Category | null>;
  createCategoryForTransaction: (categoryData: { name: string; type: string; parent_id?: string }) => Promise<{ success: boolean; categoryId?: string; error?: string }>;
  updateCategory: (id: string, updates: Partial<Category>) => Promise<boolean>;
  updateCategoryWithMergeCheck: (id: string, updates: Partial<Category>, options?: { allowMergePrompt?: boolean; companyId?: string }) => Promise<{ success: boolean; needsMerge?: boolean; existingCategory?: Category; error?: string }>;
  mergeFromRename: (originalCategoryId: string, existingCategoryId: string, companyId: string) => Promise<boolean>;
  deleteCategory: (id: string) => Promise<boolean>;
  deleteCategoryWithValidation: (id: string, companyId: string) => Promise<{ success: boolean; error?: string }>;
  mergeCategories: (selectedCategoryIds: string[], targetCategoryId: string, companyId: string) => Promise<boolean>;
  highlightCategory: (categoryId: string) => void;
  clearError: () => void;
  
  // Parent options management
  fetchParentOptions: (companyId: string) => Promise<void>;
  getParentOptions: (currentId?: string, type?: string) => SelectOption[];
  
  // Import functionality
  importCategories: (categories: CategoryImportData[], companyId: string, autoCreateMissing?: boolean) => Promise<{ success: boolean; error?: string }>;
  validateCategoryCSV: (data: { data: CategoryCSVRow[] }) => string | null;
  validateParentReferences: (categories: CategoryImportData[]) => CategoryImportData[];
  validateParentDependencies: (categories: CategoryImportData[], selectedIds: Set<string>) => { isValid: boolean; missingParents: string[] };
  
  // Enhanced functionality
  findCategoryByName: (name: string, caseSensitive?: boolean) => Category | null;
  findCategoriesByName: (namePattern: string, caseSensitive?: boolean) => Category[];
  findParentByName: (childId: string, parentName: string) => Category | null;
  moveCategory: (categoryIdOrName: string, newParentIdOrName: string | null) => Promise<boolean>;
  checkBankAccountLinkage: (categoryId: string) => Promise<{ isLinked: boolean; name?: string; error?: string }>;
  syncAccountsTable: (categoryId: string, updates: { name?: string; type?: string }, companyId: string) => Promise<boolean>;
  
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
  parentOptions: [],
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
      set({ isLoading: true, error: null });

      if (!categoryData.name.trim()) {
        throw new Error('Category name is required');
      }

      // Use the existing addCategory method which properly handles API calls
      const newCategory = await get().addCategory({
        name: categoryData.name,
        type: categoryData.type,
        parent_id: categoryData.parent_id
      });

      if (!newCategory) {
        throw new Error('Failed to create category');
      }

      return { success: true, categoryId: newCategory.id };
    } catch (error) {
      console.error('Error creating category for transaction:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to create category';
      set({ error: errorMessage });
      return { success: false, error: errorMessage };
    } finally {
      set({ isLoading: false });
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
  
  // Parent options management
  fetchParentOptions: async (companyId: string) => {
    try {
      const { data, error } = await supabase
        .from("chart_of_accounts")
        .select("*")
        .eq("company_id", companyId)
        .is("parent_id", null);

      if (error) {
        console.error("Error fetching parent options:", error);
        set({ error: "Failed to fetch parent options" });
      } else if (data) {
        set({ parentOptions: data as Category[] });
      }
    } catch (err) {
      console.error('Error in fetchParentOptions:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch parent options';
      set({ error: errorMessage });
    }
  },

  getParentOptions: (currentId?: string, type?: string): SelectOption[] => {
    const { categories } = get();
    const availableParents = categories.filter((cat: Category) => 
      cat.id !== currentId && 
      (type ? cat.type === type : true)
    );
    return [
      { value: "", label: "None" },
      ...availableParents.map((cat: Category) => ({
        value: cat.id,
        label: cat.name
      }))
    ];
  },

  // Enhanced validation for category deletion
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  deleteCategoryWithValidation: async (id: string, companyId: string) => {
    try {
      // Check if category is linked to a bank account
      const linkageCheck = await get().checkBankAccountLinkage(id);
      
      if (linkageCheck.error) {
        return { success: false, error: linkageCheck.error };
      }
      
      if (linkageCheck.isLinked) {
        return { 
          success: false, 
          error: `This category "${linkageCheck.name}" cannot be deleted because it is linked to a bank account. Bank account categories are automatically managed by the system.` 
        };
      }

      // Proceed with regular deletion
      const success = await get().deleteCategory(id);
      return { success };
    } catch (err) {
      console.error('Error in deleteCategoryWithValidation:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete category';
      return { success: false, error: errorMessage };
    }
  },

  // Bank account linkage check
  checkBankAccountLinkage: async (categoryId: string) => {
    try {
      const { data: categoryData, error: categoryError } = await supabase
        .from("chart_of_accounts")
        .select("plaid_account_id, name")
        .eq("id", categoryId)
        .single();

      if (categoryError) {
        console.error("Error checking category:", categoryError);
        return { isLinked: false, error: "Error checking category details. Please try again." };
      }

      return {
        isLinked: !!categoryData?.plaid_account_id,
        name: categoryData?.name
      };
    } catch (err) {
      console.error('Error in checkBankAccountLinkage:', err);
      return { isLinked: false, error: 'Failed to check bank account linkage' };
    }
  },

  // Sync accounts table when chart of accounts is updated
  syncAccountsTable: async (categoryId: string, updates: { name?: string; type?: string }, companyId: string) => {
    try {
      // First get the category to check if it's linked to a plaid account
      const { data: currentAccount, error: fetchError } = await supabase
        .from("chart_of_accounts")
        .select("plaid_account_id")
        .eq("id", categoryId)
        .single();

      if (fetchError || !currentAccount?.plaid_account_id) {
        // No plaid linkage, nothing to sync
        return true;
      }

      // Update the accounts table
      const { error: accountsError } = await supabase
        .from("accounts")
        .update(updates)
        .eq("plaid_account_id", currentAccount.plaid_account_id)
        .eq("company_id", companyId);

      if (accountsError) {
        console.error("Error updating accounts table:", accountsError);
        return false;
      }

      return true;
    } catch (err) {
      console.error('Error in syncAccountsTable:', err);
      return false;
    }
  },

  // CSV validation
  validateCategoryCSV: (data: { data: CategoryCSVRow[] }) => {
    if (!data.data || data.data.length === 0) {
      return "CSV file is empty";
    }

    const requiredColumns = ["Name", "Type"];
    const headers = Object.keys(data.data[0]);

    const missingColumns = requiredColumns.filter((col) => !headers.includes(col));
    if (missingColumns.length > 0) {
      return `Missing required columns: ${missingColumns.join(", ")}. Expected: Name, Type, Parent (optional)`;
    }

    const nonEmptyRows = data.data.filter((row: CategoryCSVRow) => row.Name && row.Type);

    if (nonEmptyRows.length === 0) {
      return "No valid category data found. Please ensure you have at least one row with Name and Type.";
    }

    for (let i = 0; i < nonEmptyRows.length; i++) {
      const row = nonEmptyRows[i];

      if (!row.Name.trim()) {
        return `Empty name in row ${i + 1}. Please provide a name for each category.`;
      }

      if (!ACCOUNT_TYPES.includes(row.Type)) {
        return `Invalid type "${row.Type}" in row ${i + 1}. Valid types are: ${ACCOUNT_TYPES.join(", ")}`;
      }
    }

    return null;
  },

  // Validate parent references
  validateParentReferences: (categories: CategoryImportData[]): CategoryImportData[] => {
    const { categories: existingCategories } = get();
    
    return categories.map((category) => {
      let isValid = true;
      let validationMessage = "";
      let needsParentCreation = false;

      // Check for name uniqueness - must not exist in database
      const nameExistsInDb = existingCategories.some(
        (acc) => acc.name.toLowerCase() === category.name.toLowerCase()
      );
      
      if (nameExistsInDb) {
        isValid = false;
        validationMessage = `Category "${category.name}" already exists in database`;
        return {
          ...category,
          isValid,
          validationMessage,
          needsParentCreation,
        };
      }

      // Check for name uniqueness within CSV data
      const duplicatesInCsv = categories.filter(
        (cat) => cat.name.toLowerCase() === category.name.toLowerCase()
      );
      
      if (duplicatesInCsv.length > 1) {
        isValid = false;
        validationMessage = `Duplicate name "${category.name}" found in CSV`;
        return {
          ...category,
          isValid,
          validationMessage,
          needsParentCreation,
        };
      }

      // Validate parent references
      if (category.parentName) {
        // Check if parent exists in current accounts
        const parentExists = existingCategories.some(
          (acc) => acc.name.toLowerCase() === category.parentName!.toLowerCase()
        );
        
        // Check if parent exists in the import data
        const parentInImport = categories.find(
          (cat) => cat.name.toLowerCase() === category.parentName!.toLowerCase() && cat.id !== category.id
        );

        if (!parentExists && !parentInImport) {
          needsParentCreation = true;
          validationMessage = `Parent "${category.parentName}" does not exist`;
        } else if (parentExists || parentInImport) {
          // Validate that parent type matches (parents must have same type as child)
          const existingParent = existingCategories.find((acc) => acc.name.toLowerCase() === category.parentName!.toLowerCase());
          const importParent = parentInImport;
          
          const parentType = existingParent?.type || importParent?.type;
          if (parentType && parentType !== category.type) {
            isValid = false;
            validationMessage = `Parent "${category.parentName}" has type "${parentType}" but child has type "${category.type}". Parent and child must have the same type.`;
          }
        }
      }

      return {
        ...category,
        isValid,
        validationMessage,
        needsParentCreation,
      };
    });
  },

  // Validate parent dependencies in CSV selection
  validateParentDependencies: (categories: CategoryImportData[], selectedIds: Set<string>) => {
    const missingParents: string[] = [];
    
    const selectedCategories = categories.filter(cat => selectedIds.has(cat.id));
    
    for (const category of selectedCategories) {
      if (category.parentName) {
        // Find if the parent is in the CSV data
        const parentInCsv = categories.find(
          cat => cat.name.toLowerCase() === category.parentName!.toLowerCase()
        );
        
        // If parent is in CSV but not selected, add to missing parents
        if (parentInCsv && !selectedIds.has(parentInCsv.id)) {
          if (!missingParents.includes(category.parentName)) {
            missingParents.push(category.parentName);
          }
        }
      }
    }
    
    return {
      isValid: missingParents.length === 0,
      missingParents
    };
  },

  // Import categories from CSV data
  importCategories: async (categories: CategoryImportData[], companyId: string, autoCreateMissing = false) => {
    try {
      set({ isLoading: true, error: null });

      // Sort categories by dependency (parents before children)
      const sortCategoriesByDependency = (categories: CategoryImportData[]): CategoryImportData[] => {
        const sorted: CategoryImportData[] = [];
        const remaining = [...categories];
        const processing = new Set<string>();

        const addCategoryToSorted = (cat: CategoryImportData) => {
          if (processing.has(cat.id)) return; // Avoid circular dependencies
          processing.add(cat.id);

          // If category has a parent in the import list, add parent first
          if (cat.parentName) {
            const parentInImport = remaining.find(
              (c) => c.name.toLowerCase() === cat.parentName!.toLowerCase() && c.id !== cat.id
            );
            if (parentInImport && !sorted.includes(parentInImport)) {
              addCategoryToSorted(parentInImport);
            }
          }

          // Add this category if not already added
          if (!sorted.includes(cat)) {
            sorted.push(cat);
          }
          processing.delete(cat.id);
        };

        // Add all categories, respecting dependencies
        for (const cat of remaining) {
          addCategoryToSorted(cat);
        }

        return sorted;
      };

      const orderedCategories = sortCategoriesByDependency(categories);

      // If auto-create is enabled, create missing parent categories first
      if (autoCreateMissing) {
        const missingParents = new Set<string>();

        orderedCategories.forEach((cat) => {
          if (cat.needsParentCreation && cat.parentName) {
            missingParents.add(cat.parentName);
          }
        });

        // Create missing parent categories with same type as child
        if (missingParents.size > 0) {
          const parentsToCreate = Array.from(missingParents).map((parentName) => {
            // Find a child category to get the type
            const childWithThisParent = orderedCategories.find(
              (cat) => cat.parentName === parentName
            );
            return {
              name: parentName,
              type: childWithThisParent?.type || "Expense", // Default to Expense if can't determine
              parent_id: null, // These are parent categories
              company_id: companyId,
            };
          });

          const { error: parentError } = await supabase
            .from("chart_of_accounts")
            .insert(parentsToCreate);

          if (parentError) {
            throw new Error(`Failed to create parent categories: ${parentError.message}`);
          }

          // Refresh categories to get the newly created parents
          await get().refreshCategories();
        }
      }

      // Split categories into parents and children for two-phase import
      const parentCategories = orderedCategories.filter((cat) => !cat.parentName);
      const childCategories = orderedCategories.filter((cat) => cat.parentName);

      // Phase 1: Import parent categories first
      if (parentCategories.length > 0) {
        const parentCategoriesToInsert = parentCategories.map((cat) => ({
          name: cat.name,
          type: cat.type,
          parent_id: null, // Parents have no parent
          company_id: companyId,
        }));

        const { error: parentError } = await supabase
          .from("chart_of_accounts")
          .insert(parentCategoriesToInsert);
        if (parentError) {
          throw new Error(`Failed to import parent categories: ${parentError.message}`);
        }

        // Refresh categories to get newly created parents
        await get().refreshCategories();
      }

      // Phase 2: Import child categories with proper parent_id resolution
      if (childCategories.length > 0) {
        const childCategoriesToInsert = await Promise.all(
          childCategories.map(async (cat) => {
            let parent_id = cat.parent_id;

            // If we have a parentName but no parent_id, look it up (including newly created parents)
            if (cat.parentName && !parent_id) {
              // Get fresh categories list that includes newly created parents
              const { data: freshCategories } = await supabase
                .from("chart_of_accounts")
                .select("*")
                .eq("company_id", companyId);

              if (freshCategories) {
                const parentCategory = freshCategories.find(
                  (acc) => acc.name.toLowerCase() === cat.parentName!.toLowerCase()
                );
                parent_id = parentCategory?.id || null;
              }
            }

            return {
              name: cat.name,
              type: cat.type,
              parent_id,
              company_id: companyId,
            };
          })
        );

        const { error: childError } = await supabase
          .from("chart_of_accounts")
          .insert(childCategoriesToInsert);
        if (childError) {
          throw new Error(`Failed to import child categories: ${childError.message}`);
        }
      }

      // Refresh categories and parent options
      await get().refreshCategories();
      await get().fetchParentOptions(companyId);

      set({ isLoading: false });
      return { success: true };
    } catch (err) {
      console.error('Error in importCategories:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to import categories';
      set({ error: errorMessage, isLoading: false });
      return { success: false, error: errorMessage };
    }
  },

  // Helper functions for finding categories
  findCategoryByName: (name: string, caseSensitive = false) => {
    const { categories } = get();
    
    if (caseSensitive) {
      return categories.find((cat) => cat.name === name) || null;
    } else {
      return categories.find((cat) => cat.name.toLowerCase() === name.toLowerCase()) || null;
    }
  },
  
  findCategoriesByName: (namePattern: string, caseSensitive = false) => {
    const { categories } = get();
    const pattern = caseSensitive ? namePattern : namePattern.toLowerCase();
    
    return categories.filter((cat) => {
      const catName = caseSensitive ? cat.name : cat.name.toLowerCase();
      return catName.includes(pattern);
    });
  },
  
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