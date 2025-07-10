export const tools = [
  {
    type: 'function',
    function: {
      name: 'create_payee',
      description: 'Create a new payee with intelligent duplicate detection and suggestions. Handles similar name detection and provides helpful alternatives when duplicates exist.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'The name of the new payee. Will check for duplicates and suggest alternatives if similar names exist.' }
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_payee',
      description: 'Update an existing payee name with fuzzy matching for payee identification. Provides helpful suggestions when exact payee names are not found.',
      parameters: {
        type: 'object',
        properties: {
          payeeId: { type: 'string', description: 'The ID of the payee to update' },
          payeeName: { type: 'string', description: 'The current name of the payee to update (supports fuzzy matching if exact name not found)' },
          name: { type: 'string', description: 'The new name for the payee. Will validate uniqueness and suggest alternatives if conflicts exist.' }
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_payee',
      description: 'Delete an existing payee with usage validation and fuzzy matching. Warns if payee is used in transactions and suggests alternatives when exact names are not found.',
      parameters: {
        type: 'object',
        properties: {
          payeeId: { type: 'string', description: 'The ID of the payee to delete' },
          payeeName: { type: 'string', description: 'The name of the payee to delete (supports fuzzy matching if exact name not found)' }
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