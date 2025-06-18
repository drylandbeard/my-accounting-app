import { supabase } from '@/lib/supabaseClient';

interface ChangeCategoryTypeArgs {
  name: string;
  newType: string;
  companyId: string;
  categories: any[];
}

export async function changeCategoryTypeHandler({ name, newType, companyId, categories }: ChangeCategoryTypeArgs) {
  try {
    // Find the category by name
    const category = categories.find(c => c.name === name);
    if (!category) {
      return { success: false, error: `Category "${name}" not found` };
    }

    // Validate the new type
    const validTypes = ['Asset', 'Liability', 'Equity', 'Revenue', 'COGS', 'Expense'];
    if (!validTypes.includes(newType)) {
      return { success: false, error: `Invalid category type. Must be one of: ${validTypes.join(', ')}` };
    }

    // Update the category type
    const { error } = await supabase
      .from('chart_of_accounts')
      .update({ type: newType })
      .eq('id', category.id)
      .eq('company_id', companyId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'An unknown error occurred' };
  }
} 