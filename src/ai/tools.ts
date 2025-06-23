export const tools = [
  {
    type: 'function',
    function: {
      name: 'create_category',
      description: 'Create a new chart of account category via API',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'The name of the new category' },
          type: { type: 'string', description: 'The type of the new category (Asset, Liability, Equity, Revenue, COGS, Expense)' },
          parent_id: { type: 'string', description: 'Optional parent category ID for subcategories' },
          apiEndpoint: { type: 'string', description: 'API endpoint to call', default: '/api/category/create' },
          method: { type: 'string', description: 'HTTP method', default: 'POST' }
        },
        required: ['name', 'type'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_category',
      description: 'Update an existing chart of account category via API',
      parameters: {
        type: 'object',
        properties: {
          categoryId: { type: 'string', description: 'The ID of the category to update' },
          name: { type: 'string', description: 'The new name for the category (optional)' },
          type: { type: 'string', description: 'The new type for the category (optional)' },
          parent_id: { type: 'string', description: 'The new parent category ID (optional, null to remove parent)' },
          apiEndpoint: { type: 'string', description: 'API endpoint to call', default: '/api/category/update' },
          method: { type: 'string', description: 'HTTP method', default: 'PUT' }
        },
        required: ['categoryId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_category',
      description: 'Delete an existing chart of account category via API (requires direct Supabase delete until API endpoint is created)',
      parameters: {
        type: 'object',
        properties: {
          categoryId: { type: 'string', description: 'The ID of the category to delete' },
          method: { type: 'string', description: 'Delete method', default: 'SUPABASE_DELETE' }
        },
        required: ['categoryId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'assign_parent_category',
      description: 'Assign or reassign an existing category as a subcategory under another by setting the parent_id field via API',
      parameters: {
        type: 'object',
        properties: {
          childCategoryId: { type: 'string', description: 'The ID of the subcategory (child)' },
          parentCategoryId: { type: 'string', description: 'The ID of the parent category' },
          method: { type: 'string', description: 'Update method', default: 'SUPABASE_UPDATE' }
        },
        required: ['childCategoryId', 'parentCategoryId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'change_category_type',
      description: 'Change the type of an existing chart of account category via API',
      parameters: {
        type: 'object',
        properties: {  
          categoryId: { type: 'string', description: 'The ID of the category to change' },
          newType: { type: 'string', description: 'The new type for the category (Asset, Liability, Equity, Revenue, COGS, Expense)' },
          method: { type: 'string', description: 'Update method', default: 'SUPABASE_UPDATE' }
        },
        required: ['categoryId', 'newType'],
      },
    },
  },
]; 