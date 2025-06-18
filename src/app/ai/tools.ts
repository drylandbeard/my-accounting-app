export const tools = [
  {
    type: 'function',
    function: {
      name: 'create_category',
      description: 'Create a new chart of account category',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'The name of the new category' },
          type: { type: 'string', description: 'The type of the new category (e.g. Expense, Income, Asset, Liability, Equity)' },
        },
        required: ['name', 'type'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'rename_category',
      description: 'Rename an existing chart of account category',
      parameters: {
        type: 'object',
        properties: {
          oldName: { type: 'string', description: 'The current name of the category' },
          newName: { type: 'string', description: 'The new name for the category' },
        },
        required: ['oldName', 'newName'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'assign_parent_category',
      description: 'Assign an existing category as a subcategory under another by setting the parent_id field.',
      parameters: {
        type: 'object',
        properties: {
          childName: { type: 'string', description: 'The name of the subcategory (child)' },
          parentName: { type: 'string', description: 'The name of the parent category' },
          companyId: { type: 'string', description: 'The company ID' },
        },
        required: ['childName', 'parentName', 'companyId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_category',
      description: 'Delete an existing chart of account category',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'The name of the category to delete' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'change_category_type',
      description: 'Change the type of an existing chart of account category (e.g. from Revenue to Expense)',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'The name of the category to change' },
          newType: { type: 'string', description: 'The new type for the category (Asset, Liability, Equity, Revenue, COGS, Expense)' },
        },
        required: ['name', 'newType'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'reassign_parent_category',
      description: 'Reassign the parent of an existing category. Set parentName to null to make it a root category.',
      parameters: {
        type: 'object',
        properties: {
          childName: { type: 'string', description: 'The name of the subcategory (child)' },
          parentName: { type: ['string', 'null'], description: 'The name of the new parent category, or null to remove parent' },
          companyId: { type: 'string', description: 'The company ID' },
        },
        required: ['childName', 'parentName', 'companyId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_multiple_categories',
      description: 'Create multiple chart of account categories at once. Each category must have a name, type, and companyId. Optionally, parentId can be provided to set a parent category.',
      parameters: {
        type: 'object',
        properties: {
          categories: {
            type: 'array',
            description: 'Array of categories to create',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'The name of the category' },
                type: { type: 'string', description: 'The type of the category (e.g. Expense, Income, Asset, Liability, Equity)' },
                companyId: { type: 'string', description: 'The company ID' },
                parentId: { type: 'string', description: 'The parent category ID (optional)' },
              },
              required: ['name', 'type', 'companyId'],
            },
          },
        },
        required: ['categories'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_multiple_categories',
      description: 'Delete multiple chart of account categories at once by their names. Requires companyId and the list of category names.',
      parameters: {
        type: 'object',
        properties: {
          names: {
            type: 'array',
            description: 'Array of category names to delete',
            items: { type: 'string' },
          },
          companyId: { type: 'string', description: 'The company ID' },
          categories: {
            type: 'array',
            description: 'Array of all categories for context (optional)',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                type: { type: 'string' },
                parent_id: { type: ['string', 'null'] },
                company_id: { type: 'string' },
              },
              required: ['id', 'name', 'type', 'company_id'],
            },
          },
        },
        required: ['names', 'companyId'],
      },
    },
  },
]; 