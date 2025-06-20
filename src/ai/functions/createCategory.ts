import { supabase } from '@/lib/supabase';

// Input type for creating a category
export interface CategoryInput {
  name: string;
  type: string;
  companyId: string | undefined;
  parentId?: string; // <-- New optional field
}

// Helper: Inserts a new category into the chart_of_accounts table
export async function createCategoryHelper(
  name: string,
  type: string,
  companyId: string | undefined,
  parentId?: string
) {
  try {
    const { error } = await supabase.from('chart_of_accounts').insert([
      {
        name,
        type,
        company_id: companyId,
        parent_id: parentId || null, // <-- Include parent_id
      }
    ]);
    if (error) {
      console.error('Supabase error creating category:', error.message);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: unknown) {
    console.error('Unexpected error creating category:', err);
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
}

// Handler: Validates input and calls the helper to create a category
export async function createCategoryHandler({ name, type, companyId, parentId }: CategoryInput) {
  if (!name || !type) {
    const errorMsg = 'Category name and type are required.';
    console.warn('Validation error:', errorMsg, { name, type });
    return { success: false, error: errorMsg };
  }
  return await createCategoryHelper(name, type, companyId, parentId);
}
