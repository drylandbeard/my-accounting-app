import { 
  OperationResult, 
  BatchOperationResult, 
  PayeeOperation, 
  PayeeValidationContext 
} from './types';
import { PayeeValidator } from './payee-validator';

// Define payee store interface
interface PayeesStore {
  payees: Array<{ id: string; name: string; company_id: string }>;
  error: string | null;
  addPayee: (payee: { name: string }) => Promise<{ id: string; name: string } | null>;
  updatePayee: (id: string, updates: { name: string }) => Promise<boolean>;
  deletePayee: (id: string) => Promise<boolean>;
  refreshPayees: () => Promise<void>;
}

// Define company interface
interface Company {
  id: string;
  name: string;
}

/**
 * Failproof payee operation executor
 * Handles all payee operations with comprehensive error handling and validation
 */
export class PayeeExecutor {
  private payeesStore: PayeesStore;
  private currentCompany: Company | null;

  constructor(payeesStore: PayeesStore, currentCompany: Company | null) {
    this.payeesStore = payeesStore;
    this.currentCompany = currentCompany;
  }

  /**
   * Executes a single payee operation with full validation and error handling
   */
  async executePayeeOperation(
    operation: string,
    params: Record<string, unknown>
  ): Promise<OperationResult> {
    try {
      // Validate company context
      if (!this.currentCompany) {
        return {
          success: false,
          message: 'No company selected. Please select a company first.',
          error: 'missing_company',
          suggestions: ['Please select a company from the dropdown menu']
        };
      }

      // Get fresh payees from database for validation to prevent stale data issues
      const existingPayees = await this.ensureFreshPayeeData();
      
      // Map operation names to validator-expected names
      const operationMapping: Record<string, 'create' | 'update' | 'delete'> = {
        'create_payee': 'create',
        'update_payee': 'update',
        'delete_payee': 'delete'
      };
      
      const mappedOperation = operationMapping[operation];
      if (!mappedOperation) {
        return {
          success: false,
          message: `Unknown operation: ${operation}`,
          error: 'unknown_operation',
          suggestions: ['Available operations: create_payee, update_payee, delete_payee']
        };
      }
      
      // Create validation context
      const validationContext: PayeeValidationContext = {
        existingPayees,
        operation: mappedOperation
      };

      // Validate operation
      const validation = PayeeValidator.validatePayeeOperation(
        mappedOperation,
        params,
        validationContext
      );

      if (!validation.isValid) {
        return {
          success: false,
          message: validation.errors.join('; '),
          error: 'validation_failed',
          suggestions: validation.suggestions
        };
      }

      // Execute the operation
      switch (operation) {
        case 'create_payee':
          return await this.executeCreatePayee(params, validation.suggestions);
        case 'update_payee':
          return await this.executeUpdatePayee(params, validation.suggestions);
        case 'delete_payee':
          return await this.executeDeletePayee(params, validation.suggestions);
        default:
          return {
            success: false,
            message: `Unknown operation: ${operation}`,
            error: 'unknown_operation',
            suggestions: ['Available operations: create_payee, update_payee, delete_payee']
          };
      }
    } catch (error) {
      return this.handleUnexpectedError(error, operation, params);
    }
  }

  /**
   * Executes batch operations with transaction-like behavior
   */
  async executeBatchOperations(operations: PayeeOperation[]): Promise<BatchOperationResult> {
    try {
      console.log(`🚀 Executing batch operations: ${operations.length} operations`);
      operations.forEach((op, index) => {
        console.log(`  ${index + 1}. ${op.action} with params:`, op.params);
      });

      // Get fresh payees from database for validation to prevent stale data issues
      const existingPayees = await this.ensureFreshPayeeData();
      
      // Create validation context
      const validationContext: PayeeValidationContext = {
        existingPayees,
        operation: 'create' // Default, will be overridden per operation
      };

      // Validate all operations first
      const batchValidation = PayeeValidator.validateBatchOperations(
        operations.map(op => ({ action: op.action, params: op.params })),
        validationContext
      );

      if (!batchValidation.isValid) {
        return {
          success: false,
          message: 'Batch validation failed: ' + batchValidation.errors.join('; '),
          results: [],
          completedOperations: 0
        };
      }

      // Execute operations one by one
      const results: OperationResult[] = [];
      let completedOperations = 0;
      
      for (let i = 0; i < operations.length; i++) {
        const operation = operations[i];
        
        try {
          const result = await this.executePayeeOperation(operation.action, operation.params);
          results.push(result);
          
          if (result.success) {
            completedOperations++;
          } else {
            // If any operation fails, stop the batch
            return {
              success: false,
              message: `Batch operation failed at step ${i + 1}: ${result.message}`,
              results,
              completedOperations,
              failedAt: i
            };
          }
        } catch (error) {
          const errorResult = this.handleUnexpectedError(error, operation.action, operation.params);
          results.push(errorResult);
          
          return {
            success: false,
            message: `Batch operation failed at step ${i + 1}: ${errorResult.message}`,
            results,
            completedOperations,
            failedAt: i
          };
        }
      }

      // Refresh payees after successful batch
      await this.payeesStore.refreshPayees();

      return {
        success: true,
        message: `Successfully completed ${completedOperations} operations`,
        results,
        completedOperations
      };
    } catch (error) {
      return {
        success: false,
        message: 'Batch execution failed: ' + (error instanceof Error ? error.message : 'Unknown error'),
        results: [],
        completedOperations: 0
      };
    }
  }

  /**
   * Create payee operation
   */
  private async executeCreatePayee(
    params: Record<string, unknown>,
    suggestions: string[]
  ): Promise<OperationResult> {
    try {
      const name = (params.name as string).trim();
      
      const result = await this.payeesStore.addPayee({ name });
      
      if (!result) {
        const errorMsg = this.payeesStore.error || 'Unknown error occurred';
        
        // Handle specific error cases with more robust duplicate detection
        if (errorMsg.toLowerCase().includes('duplicate') || 
            errorMsg.toLowerCase().includes('already exists') ||
            errorMsg.toLowerCase().includes('unique constraint')) {
          return {
            success: false,
            message: `Payee "${name}" already exists`,
            error: 'duplicate_payee',
            suggestions: [
              `Use the existing payee "${name}"`,
              `Try "${name} Inc" or "${name} LLC"`,
              `Add a qualifier like "${name} (New)"`,
              'Check spelling - the payee might exist with slight variations'
            ]
          };
        }
        
        // Handle validation errors
        if (errorMsg.toLowerCase().includes('validation') ||
            errorMsg.toLowerCase().includes('invalid')) {
          return {
            success: false,
            message: `Invalid payee name "${name}": ${errorMsg}`,
            error: 'validation_error',
            suggestions: [
              'Use only alphanumeric characters and common punctuation',
              'Ensure the name is not empty and under 255 characters',
              ...suggestions
            ]
          };
        }
        
        return {
          success: false,
          message: `Failed to create payee "${name}": ${errorMsg}`,
          error: 'create_failed',
          suggestions: ['Please try again with a different name', ...suggestions]
        };
      }
      
      return {
        success: true,
        message: `Successfully created payee "${name}"`,
        data: result,
        suggestions: suggestions.length > 0 ? suggestions : undefined
      };
    } catch (error) {
      return this.handleUnexpectedError(error, 'create_payee', params);
    }
  }

  /**
   * Update payee operation
   */
  private async executeUpdatePayee(
    params: Record<string, unknown>,
    suggestions: string[]
  ): Promise<OperationResult> {
    try {
      const newName = (params.name as string).trim();
      const payeeId = params.payeeId as string;
      const payeeName = params.payeeName as string;
      
      // Find the payee to update
      let targetPayeeId = payeeId;
      let currentPayeeName = payeeName;
      
      if (!targetPayeeId && payeeName) {
        const payee = this.payeesStore.payees.find(
          (p) => p.name.toLowerCase() === payeeName.toLowerCase()
        );
        if (payee) {
          targetPayeeId = payee.id;
          currentPayeeName = payee.name;
        }
      }
      
      const result = await this.payeesStore.updatePayee(targetPayeeId, { name: newName });
      
      if (!result) {
        const errorMsg = this.payeesStore.error || 'Unknown error occurred';
        
        // Handle specific error cases
        if (errorMsg.toLowerCase().includes('not found')) {
          return {
            success: false,
            message: `Payee "${currentPayeeName}" not found`,
            error: 'payee_not_found',
            suggestions: [
              `Available payees: ${this.payeesStore.payees.map((p) => p.name).join(', ')}`,
              ...suggestions
            ]
          };
        }
        
        if (errorMsg.toLowerCase().includes('duplicate') || 
            errorMsg.toLowerCase().includes('already exists')) {
          return {
            success: false,
            message: `Cannot rename to "${newName}" - name already exists`,
            error: 'duplicate_name',
            suggestions: [
              `Try "${newName} Inc" or "${newName} LLC"`,
              `Choose a different name for "${currentPayeeName}"`,
              ...suggestions
            ]
          };
        }
        
        return {
          success: false,
          message: `Failed to update payee "${currentPayeeName}": ${errorMsg}`,
          error: 'update_failed',
          suggestions: ['Please try again', ...suggestions]
        };
      }
      
      return {
        success: true,
        message: `Successfully updated payee "${currentPayeeName}" to "${newName}"`,
        data: result,
        suggestions: suggestions.length > 0 ? suggestions : undefined
      };
    } catch (error) {
      return this.handleUnexpectedError(error, 'update_payee', params);
    }
  }

  /**
   * Delete payee operation
   */
  private async executeDeletePayee(
    params: Record<string, unknown>,
    suggestions: string[]
  ): Promise<OperationResult> {
    try {
      const payeeId = params.payeeId as string;
      const payeeName = params.payeeName as string;
      
      // Find the payee to delete
      let targetPayeeId = payeeId;
      let currentPayeeName = payeeName;
      
      if (!targetPayeeId && payeeName) {
        const payee = this.payeesStore.payees.find(
          (p) => p.name.toLowerCase() === payeeName.toLowerCase()
        );
        if (payee) {
          targetPayeeId = payee.id;
          currentPayeeName = payee.name;
        }
      }
      
      const result = await this.payeesStore.deletePayee(targetPayeeId);
      
      if (!result) {
        const errorMsg = this.payeesStore.error || 'Unknown error occurred';
        
        // Handle specific error cases
        if (errorMsg.toLowerCase().includes('not found')) {
          return {
            success: false,
            message: `Payee "${currentPayeeName}" not found`,
            error: 'payee_not_found',
            suggestions: [
              `Available payees: ${this.payeesStore.payees.map((p) => p.name).join(', ')}`,
              ...suggestions
            ]
          };
        }
        
        if (errorMsg.toLowerCase().includes('in use') || 
            errorMsg.toLowerCase().includes('transactions')) {
          return {
            success: false,
            message: `Cannot delete "${currentPayeeName}" - it's being used in transactions`,
            error: 'payee_in_use',
            suggestions: [
              'Update the transactions that use this payee first',
              'Consider keeping the payee for historical records',
              'Archive the payee instead of deleting it',
              ...suggestions
            ]
          };
        }
        
        return {
          success: false,
          message: `Failed to delete payee "${currentPayeeName}": ${errorMsg}`,
          error: 'delete_failed',
          suggestions: ['The payee might be in use by transactions', ...suggestions]
        };
      }
      
      return {
        success: true,
        message: `Successfully deleted payee "${currentPayeeName}"`,
        data: result,
        suggestions: suggestions.length > 0 ? suggestions : undefined
      };
    } catch (error) {
      return this.handleUnexpectedError(error, 'delete_payee', params);
    }
  }

  /**
   * Ensures fresh payee data by refreshing from database
   * This prevents validation loopholes with stale store data
   */
  private async ensureFreshPayeeData(): Promise<Array<{ id: string; name: string; company_id: string }>> {
    try {
      console.log('🔄 Refreshing payees from database for validation');
      // Always refresh payees from database to ensure latest data
      await this.payeesStore.refreshPayees();
      console.log(`✅ Fresh payee data loaded: ${this.payeesStore.payees?.length || 0} payees`);
      return this.payeesStore.payees || [];
    } catch (error) {
      console.warn('⚠️ Failed to refresh payees, using cached data:', error);
      // Fallback to cached data if refresh fails
      return this.payeesStore.payees || [];
    }
  }

  /**
   * Handles unexpected errors with helpful messages
   */
  private handleUnexpectedError(
    error: unknown,
    operation: string,
    params: Record<string, unknown>
  ): OperationResult {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const payeeName = params.name as string || params.payeeName as string;
    
    return {
      success: false,
      message: `Unexpected error during ${operation}: ${errorMessage}`,
      error: 'unexpected_error',
      suggestions: [
        'Please try again',
        'Check your internet connection',
        'If the problem persists, contact support',
        ...(payeeName ? [`Payee affected: "${payeeName}"`] : [])
      ]
    };
  }

  /**
   * Gets a user-friendly success message
   */
  static getSuccessMessage(operation: string, details: Record<string, unknown>): string {
    switch (operation) {
      case 'create_payee':
        return `✅ Created payee "${details.name}"`;
      case 'update_payee':
        return `✅ Updated payee to "${details.name}"`;
      case 'delete_payee':
        return `✅ Deleted payee "${details.name}"`;
      case 'batch_execute':
        return `✅ Completed ${details.count} operations successfully`;
      default:
        return '✅ Operation completed successfully';
    }
  }

  /**
   * Gets a user-friendly error message with suggestions
   */
  static getErrorMessage(result: OperationResult): string {
    let message = `❌ ${result.message}`;
    
    if (result.suggestions && result.suggestions.length > 0) {
      message += '\n\n💡 Suggestions:';
      result.suggestions.forEach((suggestion, index) => {
        message += `\n${index + 1}. ${suggestion}`;
      });
    }
    
    return message;
  }
}
