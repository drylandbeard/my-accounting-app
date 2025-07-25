/**
 * OpenAI function calling tools for category operations
 * Defines the tools that the AI can use to interact with the chart of accounts
 */

export const getCategoryTools = (): unknown[] => {
  return [
    {
      type: "function",
      function: {
        name: "create_category",
        description: "Creates a new category (account) in the chart of accounts. Categories organize financial transactions by type and can have parent-child relationships.",
        parameters: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "The name of the category (e.g., 'Office Supplies', 'Marketing Expenses', 'Cash'). Should be descriptive and unique within its type and parent scope."
            },
            type: {
              type: "string",
              description: "The account type for the category. Must be one of: Asset, Liability, Equity, Revenue, COGS, Expense, Bank Account, Credit Card",
              enum: ["Asset", "Liability", "Equity", "Revenue", "COGS", "Expense", "Bank Account", "Credit Card"]
            },
            parent_name: {
              type: "string",
              description: "Optional. The name of the parent category to create this category under. Parent and child must have the same type. If not provided, category will be created at the top level."
            },
            parent_id: {
              type: "string", 
              description: "Optional. The ID of the parent category. Use this if you know the exact parent ID, otherwise use parent_name."
            }
          },
          required: ["name", "type"],
          additionalProperties: false
        }
      }
    },
    {
      type: "function",
      function: {
        name: "update_category",
        description: "Updates an existing category's name, type, or other properties. Use this to rename categories or change their account type.",
        parameters: {
          type: "object",
          properties: {
            categoryId: {
              type: "string",
              description: "The ID of the category to update. Use this if you know the exact category ID."
            },
            categoryName: {
              type: "string", 
              description: "The current name of the category to update. Use this if you don't know the ID but know the name."
            },
            name: {
              type: "string",
              description: "Optional. The new name for the category. Only provide if the user wants to rename it."
            },
            type: {
              type: "string",
              description: "Optional. The new account type for the category. Only provide if the user wants to change the type.",
              enum: ["Asset", "Liability", "Equity", "Revenue", "COGS", "Expense", "Bank Account", "Credit Card"]
            }
          },
          required: [],
          additionalProperties: false,
          anyOf: [
            { required: ["categoryId"] },
            { required: ["categoryName"] }
          ]
        }
      }
    },
    {
      type: "function", 
      function: {
        name: "delete_category",
        description: "Deletes a category from the chart of accounts. Categories with child categories or transaction history cannot be deleted without first handling dependencies.",
        parameters: {
          type: "object",
          properties: {
            categoryId: {
              type: "string",
              description: "The ID of the category to delete. Use this if you know the exact category ID."
            },
            categoryName: {
              type: "string",
              description: "The name of the category to delete. Use this if you don't know the ID but know the name."
            }
          },
          required: [],
          additionalProperties: false,
          anyOf: [
            { required: ["categoryId"] },
            { required: ["categoryName"] }
          ]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "move_category", 
        description: "Moves a category to a different parent category or to the top level. This changes the hierarchical structure of the chart of accounts.",
        parameters: {
          type: "object",
          properties: {
            categoryId: {
              type: "string",
              description: "The ID of the category to move. Use this if you know the exact category ID."
            },
            categoryName: {
              type: "string",
              description: "The name of the category to move. Use this if you don't know the ID but know the name."
            },
            newParentId: {
              type: "string",
              description: "The ID of the new parent category. Use null to move to top level."
            },
            newParentName: {
              type: "string", 
              description: "The name of the new parent category. Use this if you don't know the parent ID but know the name. Use null or empty string to move to top level."
            }
          },
          required: [],
          additionalProperties: false,
          anyOf: [
            { required: ["categoryId"] },
            { required: ["categoryName"] }
          ]
        }
      }
    }
  ];
};

/**
 * Gets the system prompt section for category operations
 */
export const getCategorySystemPrompt = (categories: Array<{ name: string; type: string; parent_id?: string | null }>): string => {
  const categoryCount = categories.length;
  const categoryTypes = [...new Set(categories.map(c => c.type))].sort();
  const topLevelCategories = categories.filter(c => !c.parent_id);
  const childCategories = categories.filter(c => c.parent_id);

  return `
CHART OF ACCOUNTS CONTEXT:
You have access to ${categoryCount} categories across ${categoryTypes.length} account types: ${categoryTypes.join(', ')}.
- Top-level categories: ${topLevelCategories.length}
- Child categories: ${childCategories.length}

CATEGORY OPERATIONS AVAILABLE:
1. create_category - Create new categories with proper type and hierarchy
2. update_category - Rename categories or change their account type  
3. delete_category - Remove categories (only if no dependencies)
4. move_category - Change category hierarchy (move under different parent)

CATEGORY HIERARCHY RULES:
- Parent and child categories must have the same account type
- Categories can be nested but circular dependencies are not allowed
- Category names must be unique within their type and parent scope
- Moving categories preserves all transaction associations

ACCOUNT TYPES EXPLAINED:
- Asset: Things the company owns (Cash, Equipment, Inventory)
- Liability: Things the company owes (Accounts Payable, Loans)
- Equity: Owner's investment and retained earnings
- Revenue: Income from business operations
- COGS: Cost of Goods Sold - direct costs of producing goods/services
- Expense: Operating expenses (Rent, Utilities, Marketing)
- Bank Account: Specific bank accounts for cash management
- Credit Card: Credit card accounts for expense tracking

BEST PRACTICES:
- Use descriptive names that clearly indicate the category's purpose
- Organize related categories under common parents (e.g., all marketing expenses under "Marketing")
- Follow accounting standards for category types
- Consider the impact on financial reporting when making changes

When users ask about categories, provide clear explanations of the hierarchy and suggest appropriate account types based on the category's intended use.`;
};

/**
 * Enhanced system prompt for different response types involving categories
 */
export const getEnhancedCategorySystemPrompt = (
  categories: Array<{ name: string; type: string; parent_id?: string | null }>,
  responseType: 'vague_prompt' | 'validation_error',
  validationDetails?: {
    operation: string;
    errors: string[];
    warnings: string[];
    suggestions: string[];
  }
): string => {
  const basePrompt = getCategorySystemPrompt(categories);
  
  if (responseType === 'vague_prompt') {
    return basePrompt + `

HANDLING VAGUE REQUESTS:
The user's request about categories is not specific enough to execute. Provide a helpful response that:
1. Acknowledges their intent to work with the chart of accounts
2. Asks clarifying questions about what they want to do
3. Provides examples of specific category operations you can help with
4. Suggests common category management tasks

Examples of clarifying questions:
- "Would you like to create a new expense category?"
- "Are you looking to organize categories under a parent category?"
- "Do you want to rename an existing category?"
- "Should I help you set up standard account types?"

Be conversational and helpful, guiding them toward a specific action.`;
  }

  if (responseType === 'validation_error' && validationDetails) {
    return basePrompt + `

VALIDATION ERROR RESPONSE:
The user attempted a category operation that failed validation. Provide a helpful response that:
1. Clearly explains what went wrong with their request
2. Suggests specific corrections or alternatives
3. Provides context about chart of accounts rules and constraints
4. Offers to help them achieve their goal in a different way

Operation attempted: ${validationDetails.operation}
Errors: ${validationDetails.errors.join(', ')}
Warnings: ${validationDetails.warnings.join(', ')}
Suggestions: ${validationDetails.suggestions.join(', ')}

Focus on education and guidance to help them understand chart of accounts best practices.`;
  }

  return basePrompt;
};
