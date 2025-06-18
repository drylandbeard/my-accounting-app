import { createCategoryHelper } from './createCategory';

export interface CategoryInput {
  name: string;
  type: string;
  companyId: string | undefined;
  parentId?: string;
}

export async function createMultipleCategoriesHandler(categories: CategoryInput[]) {
  const results = [];
  for (const cat of categories) {
    if (!cat.name || !cat.type) {
      results.push({ success: false, error: 'Category name and type are required.', name: cat.name });
      continue;
    }
    const result = await createCategoryHelper(cat.name, cat.type, cat.companyId, cat.parentId);
    results.push({ ...result, name: cat.name });
  }
  return results;
}
