import { supabase } from '@/lib/supabaseClient';

// Category type for chart_of_accounts
export interface Category {
  id: string;
  name: string;
  type: string;
  [key: string]: any;
}

// Helper: Deletes a category by name and companyId
export async function deleteCategoryHelper(name: string, companyId: string | undefined, categories: Category[]) {
  const category = categories.find((c) => c.name === name);
  if (!category) {
    const errorMsg = `Could not find a category named "${name}".`;
    console.warn(errorMsg);
    return { success: false, error: errorMsg };
  }
  try {
    const { error } = await supabase
      .from('chart_of_accounts')
      .delete()
      .eq('id', category.id)
      .eq('company_id', companyId);
    if (error) {
      console.error('Supabase error deleting category:', error.message);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    console.error('Unexpected error deleting category:', err);
    return { success: false, error: err.message || 'Unknown error' };
  }
}

// Handler: Validates input and calls the helper to delete a category
export async function deleteCategoryHandler({ name, companyId, categories }: { name: string, companyId: string | undefined, categories: Category[] }) {
  if (!name || !companyId) {
    const errorMsg = 'Category name and companyId are required.';
    console.warn('Validation error:', errorMsg, { name, companyId });
    return { success: false, error: errorMsg };
  }
  return await deleteCategoryHelper(name, companyId, categories);
}

export async function deleteMultipleCategoriesHandler({ names, companyId, categories }: { names: string[]; companyId: string | undefined; categories: any[] }) {
  const results = [];
  for (const name of names) {
    const result = await deleteCategoryHandler({ name, companyId, categories });
    results.push({ ...result, name });
  }
  return results;
} 