export const tools = [
  {
    type: 'function',
    function: {
      name: 'create_category',
      description: 'Create a new chart of account category using the categoriesStore with built-in validation and error handling',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'The name of the new category' },
          type: { type: 'string', description: 'The type of the new category (Asset, Liability, Equity, Revenue, COGS, Expense)' },
          parent_id: { type: 'string', description: 'Optional parent category ID for subcategories' }
        },
        required: ['name', 'type'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_category',
      description: 'Update an existing chart of account category using the categoriesStore with validation and optimistic updates',
      parameters: {
        type: 'object',
        properties: {
          categoryId: { type: 'string', description: 'The ID of the category to update' },
          name: { type: 'string', description: 'The new name for the category (optional)' },
          type: { type: 'string', description: 'The new type for the category (optional)' },
          parent_id: { type: 'string', description: 'The new parent category ID (optional, null to remove parent)' }
        },
        required: ['categoryId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_category',
      description: 'Delete an existing chart of account category using the categoriesStore with comprehensive validation (checks for subcategories and transaction usage)',
      parameters: {
        type: 'object',
        properties: {
          categoryId: { type: 'string', description: 'The ID of the category to delete' }
        },
        required: ['categoryId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'assign_parent_category',
      description: 'Assign or reassign an existing category as a subcategory under another using the categoriesStore with circular dependency validation',
      parameters: {
        type: 'object',
        properties: {
          childCategoryId: { type: 'string', description: 'The ID of the subcategory (child)' },
          parentCategoryId: { type: 'string', description: 'The ID of the parent category' }
        },
        required: ['childCategoryId', 'parentCategoryId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'change_category_type',
      description: 'Change the type of an existing chart of account category using the categoriesStore with parent-child type consistency validation',
      parameters: {
        type: 'object',
        properties: {  
          categoryId: { type: 'string', description: 'The ID of the category to change' },
          newType: { type: 'string', description: 'The new type for the category (Asset, Liability, Equity, Revenue, COGS, Expense)' }
        },
        required: ['categoryId', 'newType'],
      },
    },
  },
]; 