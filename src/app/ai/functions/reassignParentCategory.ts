import { supabase } from '@/lib/supabaseClient';

export interface Category {
  id: string;
  name: string;
  type: string;
  parent_id?: string | null;
  company_id: string;
  [key: string]: any;
}

export async function assignParentCategoryHelper(
  childName: string,
  parentName: string | null,
  companyId: string | undefined,
  categories: Category[]
) {
  const child = categories.find((c) => c.name === childName);
  if (!child) {
    const errorMsg = `Could not find the category: ${childName}`;
    console.warn(errorMsg);
    return { success: false, error: errorMsg };
  }

  let parentId: string | null = null;
  if (parentName) {
    const parent = categories.find((c) => c.name === parentName);
    if (!parent) {
      const errorMsg = `Could not find the category: ${parentName}`;
      console.warn(errorMsg);
      return { success: false, error: errorMsg };
    }
    parentId = parent.id;
  }

  try {
    const { error } = await supabase
      .from('chart_of_accounts')
      .update({ parent_id: parentId })
      .eq('id', child.id)
      .eq('company_id', companyId);
    if (error) {
      console.error('Supabase error assigning parent category:', error.message);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    console.error('Unexpected error assigning parent category:', err);
    return { success: false, error: err.message || 'Unknown error' };
  }
}

export async function reassignParentCategoryHandler({ childName, parentName, companyId, categories }: {
  childName: string;
  parentName: string | null;
  companyId: string | undefined;
  categories: Category[];
}) {
  if (!childName || !companyId) {
    const errorMsg = 'Child name and companyId are required.';
    console.warn('Validation error:', errorMsg, { childName, parentName, companyId });
    return { success: false, error: errorMsg };
  }
  return await assignParentCategoryHelper(childName, parentName, companyId, categories);
} 