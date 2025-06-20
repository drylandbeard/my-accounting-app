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

// Helper: Changes the type of an existing category in chart_of_accounts
export async function changeCategoryTypeHelper(
  categoryName: string,
  newType: string,
  companyId: string | undefined,
  categories: Category[]
) {
  const category = categories.find((c) => c.name === categoryName);
  if (!category) {
    const errorMsg = `Could not find the category: ${categoryName}`;
    console.warn(errorMsg);
    return { success: false, error: errorMsg };
  }

  try {
    const { error } = await supabase
      .from('chart_of_accounts')
      .update({ type: newType })
      .eq('id', category.id)
      .eq('company_id', companyId);
    
    if (error) {
      console.error('Supabase error changing category type:', error.message);
      return { success: false, error: error.message };
    }
    
    return { success: true };
  } catch (err: unknown) {
    console.error('Unexpected error changing category type:', err);
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
}

// Handler: Validates input and calls the helper to change category type
export async function changeCategoryTypeHandler({ 
  categoryName, 
  newType, 
  companyId, 
  categories 
}: {
  categoryName: string;
  newType: string;
  companyId: string | undefined;
  categories: Category[];
}) {
  if (!categoryName || !newType || !companyId) {
    const errorMsg = 'Category name, new type, and companyId are required.';
    console.warn('Validation error:', errorMsg, { categoryName, newType, companyId });
    return { success: false, error: errorMsg };
  }
  
  // Validate the new type is one of the accepted types
  const validTypes = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'];
  if (!validTypes.includes(newType)) {
    const errorMsg = `Invalid category type: ${newType}. Must be one of: ${validTypes.join(', ')}`;
    console.warn('Validation error:', errorMsg);
    return { success: false, error: errorMsg };
  }
  
  return await changeCategoryTypeHelper(categoryName, newType, companyId, categories);
} 