import { supabase } from '@/lib/supabase';

// Category type for chart_of_accounts
export interface Category {
  id: string;
  name: string;
  type: string;
  [key: string]: unknown;
}

// Helper: Renames a category in the chart_of_accounts table by id
export async function renameCategoryHelper(oldName: string, newName: string, companyId: string | undefined, categories: Category[]) {
  const category = categories.find((c) => c.name === oldName);
  if (!category) {
    const errorMsg = `Could not find a category named "${oldName}".`;
    console.warn(errorMsg);
    return { success: false, error: errorMsg };
  }
  try {
    const { error } = await supabase
      .from('chart_of_accounts')
      .update({ name: newName })
      .eq('id', category.id)
      .eq('company_id', companyId);
    if (error) {
      console.error('Supabase error renaming category:', error.message);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: unknown) {
    console.error('Unexpected error renaming category:', err);
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
}

// Handler: Validates input and calls the helper to rename a category
export async function renameCategoryHandler({ oldName, newName, companyId, categories }: { oldName: string, newName: string, companyId: string | undefined, categories: Category[] }) {
  if (!oldName || !newName || !companyId) {
    const errorMsg = 'Old name, new name, and companyId are required.';
    console.warn('Validation error:', errorMsg, { oldName, newName, companyId });
    return { success: false, error: errorMsg };
  }
  return await renameCategoryHelper(oldName, newName, companyId, categories);
} 