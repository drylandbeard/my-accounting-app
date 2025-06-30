export const tools = [
  {
    type: 'function',
    function: {
      name: 'create_category',
      description: 'Create a new chart of account category using the categoriesStore with built-in validation and error handling. Automatically handles parent lookups by name.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'The name of the new category' },
          type: { type: 'string', enum: ['Asset', 'Liability', 'Equity', 'Revenue', 'COGS', 'Expense'], description: 'The type of the new category' },
          parent_id: { type: 'string', description: 'Optional parent category ID for subcategories' },
          parentName: { type: 'string', description: 'Optional parent category name (will be looked up automatically)' }
        },
        required: ['name', 'type'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_category',
      description: 'Update an existing chart of account category using the categoriesStore with validation, merge detection, and optimistic updates. Automatically resolves category names to IDs.',
      parameters: {
        type: 'object',
        properties: {
          categoryId: { type: 'string', description: 'The ID of the category to update' },
          categoryName: { type: 'string', description: 'The name of the category to update (will be looked up automatically if ID is not provided)' }, 
          name: { type: 'string', description: 'The new name for the category (optional)' },
          type: { type: 'string', enum: ['Asset', 'Liability', 'Equity', 'Revenue', 'COGS', 'Expense'], description: 'The new type for the category (optional)' },
          parent_id: { type: 'string', description: 'The new parent category ID (optional, null to remove parent)' },
          parentName: { type: 'string', description: 'The new parent category name (will be looked up automatically)' }
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_category',
      description: 'Delete an existing chart of account category using the categoriesStore with comprehensive validation (checks for subcategories, transaction usage, and bank account linkage). Supports both ID and name lookups.',
      parameters: {
        type: 'object',
        properties: {
          categoryId: { type: 'string', description: 'The ID of the category to delete' },
          categoryName: { type: 'string', description: 'The name of the category to delete (will be looked up automatically if ID is not provided)' }
        },
        required: []
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'move_category',
      description: 'Move an existing category to a new parent or to root level using the categoriesStore with circular dependency validation and automatic name resolution.',
      parameters: {
        type: 'object',
        properties: {
          categoryId: { type: 'string', description: 'The ID of the category to move' },
          categoryName: { type: 'string', description: 'The name of the category to move (will be looked up automatically if ID is not provided)' },
          parentId: { type: 'string', description: 'The ID of the new parent category (null to move to root)' },
          parentName: { type: 'string', description: 'The name of the new parent category (will be looked up automatically, null to move to root)' }
        },
        required: []
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'change_category_type',
      description: 'Change the type of an existing chart of account category using the categoriesStore with parent-child type consistency validation and automatic name resolution.',
      parameters: {
        type: 'object',
        properties: {  
          categoryId: { type: 'string', description: 'The ID of the category to change' },
          categoryName: { type: 'string', description: 'The name of the category to change (will be looked up automatically if ID is not provided)' },
          newType: { type: 'string', enum: ['Asset', 'Liability', 'Equity', 'Revenue', 'COGS', 'Expense'], description: 'The new type for the category' }
        },
        required: ['newType']
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'merge_categories',
      description: 'Merge multiple categories into a target category using the categoriesStore with comprehensive validation and transaction preservation.',
      parameters: {
        type: 'object',
        properties: {
          sourceCategoryIds: { type: 'array', items: { type: 'string' }, description: 'Array of source category IDs to merge' },
          sourceCategoryNames: { type: 'array', items: { type: 'string' }, description: 'Array of source category names to merge (will be looked up automatically)' },
          targetCategoryId: { type: 'string', description: 'The ID of the target category to merge into' },
          targetCategoryName: { type: 'string', description: 'The name of the target category to merge into (will be looked up automatically)' }
        },
        required: []
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_categories',
      description: 'Search for categories by name pattern using the categoriesStore with flexible matching options.',
      parameters: {
        type: 'object',
        properties: {
          namePattern: { type: 'string', description: 'The name pattern to search for (supports partial matches)' },
          caseSensitive: { type: 'boolean', description: 'Whether the search should be case sensitive (default: false)' },
          exactMatch: { type: 'boolean', description: 'Whether to find exact matches only (default: false)' }
        },
        required: ['namePattern']
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'check_category_usage',
      description: 'Check if a category has bank account linkages or transaction usage before performing destructive operations.',
      parameters: {
        type: 'object',
        properties: {
          categoryId: { type: 'string', description: 'The ID of the category to check' },
          categoryName: { type: 'string', description: 'The name of the category to check (will be looked up automatically if ID is not provided)' }
        },
        required: []
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_payee',
      description: 'Create a new payee using the payeesStore with validation and duplicate detection.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'The name of the new payee' }
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_payee',
      description: 'Update an existing payee name using the payeesStore with automatic name resolution.',
      parameters: {
        type: 'object',
        properties: {
          payeeId: { type: 'string', description: 'The ID of the payee to update' },
          payeeName: { type: 'string', description: 'The name of the payee to update (will be looked up automatically if ID is not provided)' },
          name: { type: 'string', description: 'The new name for the payee' }
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_payee',
      description: 'Delete an existing payee using the payeesStore with usage validation.',
      parameters: {
        type: 'object',
        properties: {
          payeeId: { type: 'string', description: 'The ID of the payee to delete' },
          payeeName: { type: 'string', description: 'The name of the payee to delete (will be looked up automatically if ID is not provided)' }
        },
        required: []
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'batch_execute',
      description: 'Execute multiple operations in a single batch with proper dependency ordering and rollback on failure.',
      parameters: {
        type: 'object',
        properties: {
          operations: { 
            type: 'array',
            description: 'List of operations to execute in sequence with automatic dependency resolution',
            items: {
              type: 'object',
              properties: {
                action: { 
                  type: 'string',
                  description: 'The type of operation to perform',
                  enum: [
                    'create_category', 
                    'update_category', 
                    'delete_category',
                    'move_category',
                    'change_category_type',
                    'merge_categories',
                    'create_payee',
                    'update_payee',
                    'delete_payee'
                  ]
                },
                params: {
                  type: 'object',
                  description: 'Parameters for the operation, matching the required params for that action'
                }
              },
              required: ['action', 'params']
            }
          }
        },
        required: ['operations'],
      },
    },
  }
]; 