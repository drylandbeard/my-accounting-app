import { supabase } from '@/lib/supabase';

// Category type for chart_of_accounts
export interface Category {
  id: string;
  name: string;
  type: string;
  parent_id?: string | null;
  company_id: string;
  [key: string]: unknown;
}

// Helper: Assigns a parent category by updating the parent_id of the child category in chart_of_accounts
export async function assignParentCategoryHelper(
  childName: string,
  parentName: string,
  companyId: string | undefined,
  categories: Category[]
) {
  const child = categories.find((c) => c.name === childName);
  if (!child) {
    const errorMsg = `Could not find the category: ${childName}`;
    console.warn(errorMsg);
    return { success: false, error: errorMsg };
  }
  const parent = categories.find((c) => c.name === parentName);
  if (!parent) {
    const errorMsg = `Could not find the category: ${parentName}`;
    console.warn(errorMsg);
    return { success: false, error: errorMsg };
  }
  try {
    const { error } = await supabase
      .from('chart_of_accounts')
      .update({ parent_id: parent.id })
      .eq('id', child.id)
      .eq('company_id', companyId);
    if (error) {
      console.error('Supabase error assigning parent category:', error.message);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: unknown) {
    console.error('Unexpected error assigning parent category:', err);
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
}

// Handler: Validates input and calls the helper to assign a parent category
export async function assignParentCategoryHandler({ childName, parentName, companyId, categories }: {
  childName: string;
  parentName: string;
  companyId: string | undefined;
  categories: Category[];
}) {
  if (!childName || !parentName || !companyId) {
    const errorMsg = 'Child name, parent name, and companyId are required.';
    console.warn('Validation error:', errorMsg, { childName, parentName, companyId });
    return { success: false, error: errorMsg };
  }
  return await assignParentCategoryHelper(childName, parentName, companyId, categories);
} 