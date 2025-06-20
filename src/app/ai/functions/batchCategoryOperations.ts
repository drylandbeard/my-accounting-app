import { createCategoryHandler } from './createCategory';
import { assignParentCategoryHandler } from './assignParentCategory';
import { renameCategoryHandler } from './renameCategory';
import { deleteCategoryHandler } from './deleteCategory';
import { changeCategoryTypeHandler } from './changeCategoryType';
import { reassignParentCategoryHandler } from './reassignParentCategory';
import { supabase } from '@/lib/supabaseClient';

// Types
export type BatchCategoryOperation = {
  action: 'create' | 'assign_parent' | 'rename' | 'delete' | 'change_type' | 'reassign_parent';
  name: string;
  type?: string;
  parentName?: string;
  newName?: string;
  newType?: string;
  companyId?: string;
  categories?: Category[];
};

export type Category = {
  id: string;
  name: string;
  type: string;
  parent_id?: string | null;
  company_id: string;
};

// You may want to import categories from context or pass them in as an argument

export async function batchCategoryOperationsHandler(
  operations: BatchCategoryOperation[],
  categories: Category[],
  companyId: string
) {
  const results = [];
  let currentCategories = [...categories];

  for (const op of operations) {
    let result;
    switch (op.action) {
      case 'create':
        if (op.type) {
          result = await createCategoryHandler({ name: op.name, type: op.type, companyId });
          // Refresh categories after creation
          // Fetch from DB or re-query supabase
          const { data: updatedCategories } = await supabase
            .from('chart_of_accounts')
            .select('*')
            .eq('company_id', companyId);
          if (updatedCategories) currentCategories = updatedCategories;
        } else {
          result = { success: false, error: 'Missing type for create action' };
        }
        break;
      case 'assign_parent':
        if (op.parentName) {
          result = await assignParentCategoryHandler({
            childName: op.name,
            parentName: op.parentName,
            companyId,
            categories: currentCategories, // Use the latest categories
          });
        } else {
          result = { success: false, error: 'Missing parentName for assign_parent action' };
        }
        break;
      case 'rename':
        if (op.newName) {
          result = await renameCategoryHandler({ oldName: op.name, newName: op.newName, companyId, categories });
        } else {
          result = { success: false, error: 'Missing newName for rename action' };
        }
        break;
      case 'delete':
        result = await deleteCategoryHandler({ name: op.name, companyId, categories });
        break;
      case 'change_type':
        if (op.newType) {
          result = await changeCategoryTypeHandler({ name: op.name, newType: op.newType, companyId, categories });
        } else {
          result = { success: false, error: 'Missing newType for change_type action' };
        }
        break;
      case 'reassign_parent':
        // parentName can be null or string
        result = await reassignParentCategoryHandler({ childName: op.name, parentName: op.parentName ?? null, companyId, categories });
        break;
      default:
        result = { success: false, error: `Unknown action: ${op.action}` };
    }
    results.push({ action: op.action, name: op.name, result });
  }
  return results;
} 