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
          parent_id: { type: 'string', description: 'Optional parent category ID for subcategories' },
          parentName: { type: 'string', description: 'Optional parent category name (if ID is not known)' }
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
          categoryName: { type: 'string', description: 'The name of the category to update (if ID is not known)' }, 
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
          categoryId: { type: 'string', description: 'The ID of the category to delete' },
          categoryName: { type: 'string', description: 'The name of the category to delete (if ID is not known)' }
        },
        required: []
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
          childCategoryName: { type: 'string', description: 'The name of the subcategory (if ID is not known)' },
          parentCategoryId: { type: 'string', description: 'The ID of the parent category' },
          parentCategoryName: { type: 'string', description: 'The name of the parent category (if ID is not known)' }
        },
        required: []
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
          categoryName: { type: 'string', description: 'The name of the category to change (if ID is not known)' },
          newType: { type: 'string', description: 'The new type for the category (Asset, Liability, Equity, Revenue, COGS, Expense)' }
        },
        required: []
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_payee',
      description: 'Create a new payee using the payeesStore',
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
      description: 'Update an existing payee name using the payeesStore',
      parameters: {
        type: 'object',
        properties: {
          payeeId: { type: 'string', description: 'The ID of the payee to update' },
          payeeName: { type: 'string', description: 'The name of the payee to update (if ID is not known)' },
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
      description: 'Delete an existing payee using the payeesStore',
      parameters: {
        type: 'object',
        properties: {
          payeeId: { type: 'string', description: 'The ID of the payee to delete' },
          payeeName: { type: 'string', description: 'The name of the payee to delete (if ID is not known)' }
        },
        required: []
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'batch_execute',
      description: 'Execute multiple operations in a single batch',
      parameters: {
        type: 'object',
        properties: {
          operations: { 
            type: 'array',
            description: 'List of operations to execute in sequence',
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
                    'assign_parent_category',
                    'change_category_type',
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