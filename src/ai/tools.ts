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
]; 