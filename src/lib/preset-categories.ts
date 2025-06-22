import { supabase } from "./supabase";

/**
 * Preset categories structure for new companies
 */
export interface PresetCategory {
  name: string;
  type: "Asset" | "Liability" | "Equity" | "Revenue" | "COGS" | "Expense";
  parent_name?: string;
}

export const PRESET_CATEGORIES: PresetCategory[] = [
  // Assets - Parent Categories
  { name: "Current Assets", type: "Asset" },
  { name: "Fixed Assets", type: "Asset" },
  
  // Assets - Child Categories
  { name: "Cash", type: "Asset", parent_name: "Current Assets" },
  { name: "Accounts Receivable", type: "Asset", parent_name: "Current Assets" },
  { name: "Inventory", type: "Asset", parent_name: "Current Assets" },
  { name: "Equipment", type: "Asset", parent_name: "Fixed Assets" },
  { name: "Accumulated Depreciation - Equipment", type: "Asset", parent_name: "Fixed Assets" },
  
  // Liabilities - Parent Categories
  { name: "Current Liabilities", type: "Liability" },
  { name: "Long Term Liabilities", type: "Liability" },
  
  // Liabilities - Child Categories
  { name: "Accounts Payable", type: "Liability", parent_name: "Current Liabilities" },
  { name: "Accrued Expenses", type: "Liability", parent_name: "Current Liabilities" },
  { name: "Notes Payable", type: "Liability", parent_name: "Long Term Liabilities" },
  
  // Equity
  { name: "Owner's Equity", type: "Equity" },
  { name: "Retained Earnings", type: "Equity" },
  
  // Revenue
  { name: "Sales Revenue", type: "Revenue" },
  { name: "Service Revenue", type: "Revenue" },
  { name: "Other Income", type: "Revenue" },
  
  // COGS
  { name: "Cost of Goods Sold", type: "COGS" },
  { name: "Materials", type: "COGS" },
  { name: "Labor", type: "COGS" },
  
  // Expenses - Parent Categories
  { name: "Operating Expenses", type: "Expense" },
  { name: "Marketing Expenses", type: "Expense" },
  
  // Expenses - Child Categories
  { name: "Office Supplies", type: "Expense", parent_name: "Operating Expenses" },
  { name: "Utilities", type: "Expense", parent_name: "Operating Expenses" },
  { name: "Rent Expense", type: "Expense", parent_name: "Operating Expenses" },
  { name: "Insurance Expense", type: "Expense", parent_name: "Operating Expenses" },
  { name: "Professional Fees", type: "Expense", parent_name: "Operating Expenses" },
  { name: "Advertising", type: "Expense", parent_name: "Marketing Expenses" },
  { name: "Marketing Materials", type: "Expense", parent_name: "Marketing Expenses" },
];

/**
 * Create preset categories for a new company
 */
export async function createPresetCategories(companyId: string) {
  try {
    // Separate parent and child categories
    const parentCategories = PRESET_CATEGORIES.filter(cat => !cat.parent_name);
    const childCategories = PRESET_CATEGORIES.filter(cat => cat.parent_name);
    
    // First, insert parent categories
    const parentData = parentCategories.map(cat => ({
      name: cat.name,
      type: cat.type,
      company_id: companyId,
      parent_id: null
    }));
    
    const { data: insertedParents, error: parentError } = await supabase
      .from("chart_of_accounts")
      .insert(parentData)
      .select("id, name");
    
    if (parentError) {
      console.error("Error creating parent categories:", parentError);
      return { error: parentError.message };
    }
    
    // Create a mapping of parent names to IDs
    const parentIdMap = new Map<string, string>();
    if (insertedParents) {
      for (const parent of insertedParents) {
        parentIdMap.set(parent.name, parent.id);
      }
    }
    
    // Then, insert child categories with proper parent_id references
    const childData = childCategories.map(cat => ({
      name: cat.name,
      type: cat.type,
      company_id: companyId,
      parent_id: cat.parent_name ? parentIdMap.get(cat.parent_name) || null : null
    }));
    
    const { error: childError } = await supabase
      .from("chart_of_accounts")
      .insert(childData);
    
    if (childError) {
      console.error("Error creating child categories:", childError);
      return { error: childError.message };
    }
    
    console.log(`Successfully created ${PRESET_CATEGORIES.length} preset categories for company ${companyId}`);
    return { success: true };
  } catch (error) {
    console.error("Unexpected error creating preset categories:", error);
    return { error: "Failed to create preset categories" };
  }
} 