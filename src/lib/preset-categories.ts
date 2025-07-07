import { supabase } from "./supabase";

/**
 * Preset categories structure for new companies
 */
export interface PresetCategory {
  name: string;
  type: "Asset" | "Liability" | "Equity" | "Revenue" | "COGS" | "Expense" | "Bank Account" | "Credit Card";
  parent_name?: string;
}

/**
 * Preset payees structure for new companies
 */
export interface PresetPayee {
  name: string;
}

export const PRESET_CATEGORIES: PresetCategory[] = [
  // Revenue - Parent Categories
  { name: "Sales", type: "Revenue" },

  // Revenue - Child Categories
  { name: "Discounts", type: "Revenue", parent_name: "Sales" },

  // COGS
  { name: "Merchandise", type: "COGS" },

  // Expense - Parent Categories
  { name: "Travel", type: "Expense" },
  { name: "Operating Expenses", type: "Expense" },
  { name: "Payroll Expenses", type: "Expense" },

  // Expense - Child Categories
  { name: "Airfare", type: "Expense", parent_name: "Travel" },
  { name: "Lodging", type: "Expense", parent_name: "Travel" },
  { name: "Meals & Entertainment", type: "Expense" },
  { name: "Software", type: "Expense", parent_name: "Operating Expenses" },
  { name: "Supplies", type: "Expense", parent_name: "Operating Expenses" },
  { name: "Bank Charges", type: "Expense", parent_name: "Operating Expenses" },
  { name: "Payroll Wages", type: "Expense", parent_name: "Payroll Expenses" },
  { name: "Payroll Taxes", type: "Expense", parent_name: "Payroll Expenses" },

  // Asset - Parent Categories
  { name: "Current Assets", type: "Asset" },
  { name: "Fixed Assets", type: "Asset" },

  // Asset - Child Categories
  { name: "Equipment", type: "Asset", parent_name: "Fixed Assets" },

  // Liability - Parent Categories
  { name: "Current Liabilities", type: "Liability" },

  // Equity - Parent Categories
  { name: "Owner's Equity", type: "Equity" },

  // Equity - Child Categories
  { name: "Owner's Investment", type: "Equity", parent_name: "Owner's Equity" },
  { name: "Owner's Distribution", type: "Equity", parent_name: "Owner's Equity" },
];

export const PRESET_PAYEES: PresetPayee[] = [
  { name: "Amazon" },
  { name: "Tesla" },
  { name: "Costco" },
  { name: "Home Depot" },
  { name: "Lowe's" },
  { name: "Apple" },
  { name: "Microsoft" },
  { name: "Zoom" },
  { name: "Adobe" },
  { name: "Stripe" },
  { name: "Square" },
  { name: "PayPal" },
  { name: "Gusto" },
  { name: "ADP" },
  { name: "Uber" },
  { name: "Delta Airlines" },
  { name: "Switch" },
  { name: "Starbucks" },
];

/**
 * Creates preset categories for a new company
 */
export const createPresetCategories = async (companyId: string) => {
  try {
    // First, create parent categories
    const parentCategories = PRESET_CATEGORIES.filter(cat => !cat.parent_name);

    if (parentCategories.length > 0) {
      const { error: parentError } = await supabase
        .from("chart_of_accounts")
        .insert(
          parentCategories.map(category => ({
          name: category.name,
          type: category.type,
          parent_id: null,
          company_id: companyId,
        }))
      );

      if (parentError) {
        console.error("Error creating parent categories:", parentError);
        return { error: parentError.message };
      }
    }

    // Get the created parent categories to map children
    const { data: createdParents, error: fetchError } = await supabase
      .from("chart_of_accounts")
      .select("id, name")
      .eq("company_id", companyId)
      .is("parent_id", null);

    if (fetchError) {
      console.error("Error fetching created parent categories:", fetchError);
      return { error: fetchError.message };
    }

    // Create child categories
    const childCategories = PRESET_CATEGORIES.filter(cat => cat.parent_name);

    if (childCategories.length > 0) {
      const childCategoriesWithParentIds = childCategories.map(category => {
        const parent = createdParents?.find(p => p.name === category.parent_name);
        return {
          name: category.name,
          type: category.type,
          parent_id: parent?.id || null,
          company_id: companyId,
        };
      });

      const { error: childError } = await supabase
        .from("chart_of_accounts")
        .insert(childCategoriesWithParentIds);

      if (childError) {
        console.error("Error creating child categories:", childError);
        return { error: childError.message };
      }
    }

    return { success: true };
  } catch (error) {
    console.error("Unexpected error creating preset categories:", error);
    return { error: "Failed to create preset categories" };
  }
};

/**
 * Creates preset payees for a new company
 */
export const createPresetPayees = async (companyId: string) => {
  try {
    const { error } = await supabase
      .from("payees")
      .insert(
        PRESET_PAYEES.map(payee => ({
        name: payee.name,
        company_id: companyId,
      }))
    );

    if (error) {
      console.error("Error creating preset payees:", error);
      return { error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error("Unexpected error creating preset payees:", error);
    return { error: "Failed to create preset payees" };
  }
};