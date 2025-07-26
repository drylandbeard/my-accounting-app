import { 
  OperationResult, 
  BatchOperationResult, 
  CategoryOperation, 
  CategoryValidationContext 
} from './types';
import { CategoryValidator } from './category-validator';

// Define categories store interface
interface CategoriesStore {
  categories: Array<{ 
    id: string; 
    name: string; 
    type: string; 
    company_id: string;
    parent_id?: string | null;
    subtype?: string;
    plaid_account_id?: string | null;
  }>;
  error: string | null;
  addCategory: (category: { name: string; type: string; parent_id?: string | null }) => Promise<{ id: string; name: string; type: string } | null>;
  updateCategory: (idOrName: string, updates: { name?: string; type?: string; parent_id?: string | null }) => Promise<boolean>;
  deleteCategory: (idOrName: string) => Promise<boolean>;
  moveCategory: (categoryIdOrName: string, newParentIdOrName: string | null) => Promise<boolean>;
  refreshCategories: () => Promise<void>;
  findCategoryByName: (name: string, caseSensitive?: boolean) => { id: string; name: string; type: string; parent_id?: string | null } | null;
}

// Define company interface
interface Company {
  id: string;
  name: string;
}

/**
 * Failproof category operation executor
 * Handles all category operations with comprehensive error handling and validation
 */
export class CategoryExecutor {
  private categoriesStore: CategoriesStore;
  private currentCompany: Company | null;

  constructor(categoriesStore: CategoriesStore, currentCompany: Company | null) {
    this.categoriesStore = categoriesStore;
    this.currentCompany = currentCompany;
  }

  /**
   * Executes a single category operation with full validation and error handling
   */
  async executeCategoryOperation(
    operation: string,
    params: Record<string, unknown>
  ): Promise<OperationResult> {
    try {
      // Validate company context
      if (!this.currentCompany) {
        return {
          success: false,
          message: 'No company context available',
          error: 'missing_company',
          suggestions: ['Please ensure you are logged in and have a company selected']
        };
      }

      // Get fresh categories from database for validation to prevent stale data issues
      const existingCategories = await this.ensureFreshCategoryData();
      
      // Map operation names to validator-expected names
      const operationMapping: Record<string, 'create' | 'update' | 'delete' | 'move'> = {
        'create_category': 'create',
        'update_category': 'update',
        'delete_category': 'delete',
        'move_category': 'move'
      };
      
      const mappedOperation = operationMapping[operation];
      if (!mappedOperation) {
        return {
          success: false,
          message: `Unknown operation: ${operation}`,
          error: 'invalid_operation',
          suggestions: ['Supported operations: create_category, update_category, delete_category, move_category']
        };
      }

      // Create validation context
      const context: CategoryValidationContext = {
        existingCategories: existingCategories.map(c => ({
          id: c.id,
          name: c.name,
          type: c.type,
          parent_id: c.parent_id
        })),
        operation: mappedOperation
      };

      // Validate the operation
      const validation = CategoryValidator.validateCategoryOperation(mappedOperation, params, context);
      
      if (!validation.isValid) {
        return {
          success: false,
          message: validation.errors.join('. '),
          error: 'validation_failed',
          suggestions: validation.suggestions
        };
      }

      // Execute the operation
      switch (mappedOperation) {
        case 'create':
          return await this.executeCreateCategory(params, validation.suggestions);
        case 'update':
          return await this.executeUpdateCategory(params, validation.suggestions);
        case 'delete':
          return await this.executeDeleteCategory(params, validation.suggestions);
        case 'move':
          return await this.executeMoveCategory(params, validation.suggestions);
        default:
          return {
            success: false,
            message: `Unhandled operation: ${mappedOperation}`,
            error: 'unhandled_operation'
          };
      }
    } catch (error) {
      console.error('Error in executeCategoryOperation:', error);
      return this.handleUnexpectedError(error, operation, params);
    }
  }

  /**
   * Executes batch operations with transaction-like behavior
   */
  async executeBatchOperations(operations: CategoryOperation[]): Promise<BatchOperationResult> {
    try {
      if (!this.currentCompany) {
        return {
          success: false,
          message: 'No company context available for batch operations',
          results: [],
          completedOperations: 0
        };
      }

      // Get fresh data for validation
      const existingCategories = await this.ensureFreshCategoryData();
      
      // Create validation context
      const context: CategoryValidationContext = {
        existingCategories: existingCategories.map(c => ({
          id: c.id,
          name: c.name,
          type: c.type,
          parent_id: c.parent_id
        })),
        operation: 'create' // Default, will be overridden per operation
      };

      // Validate batch
      const batchValidation = CategoryValidator.validateBatchOperations(
        operations.map(op => ({ action: op.action, params: op.params })),
        context
      );

      if (!batchValidation.isValid) {
        return {
          success: false,
          message: `Batch validation failed: ${batchValidation.errors.join('. ')}`,
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
          const result = await this.executeCategoryOperation(operation.action, operation.params);
          results.push(result);
          
          if (result.success) {
            completedOperations++;
          } else {
            // Stop on first failure to prevent cascading issues
            return {
              success: false,
              message: `Batch failed at operation ${i + 1}: ${result.message}`,
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
            message: `Batch failed at operation ${i + 1}: ${errorResult.message}`,
            results,
            completedOperations,
            failedAt: i
          };
        }
      }

      return {
        success: true,
        message: `Successfully completed ${completedOperations} category operations`,
        results,
        completedOperations
      };
    } catch (error) {
      console.error('Error in executeBatchOperations:', error);
      return {
        success: false,
        message: `Batch execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        results: [],
        completedOperations: 0
      };
    }
  }

  /**
   * Create category operation
   */
  private async executeCreateCategory(
    params: Record<string, unknown>,
    suggestions: string[]
  ): Promise<OperationResult> {
    try {
      const name = params.name as string;
      const type = params.type as string;
      const parentId = params.parent_id as string | null;
      const parentName = params.parent_name as string;

      // Resolve parent ID if parent name is provided
      let resolvedParentId = parentId;
      if (parentName && !parentId) {
        const parentCategory = this.categoriesStore.findCategoryByName(parentName);
        if (parentCategory && parentCategory.type === type) {
          resolvedParentId = parentCategory.id;
        }
      }

      const result = await this.categoriesStore.addCategory({
        name: name.trim(),
        type: type.trim(),
        parent_id: resolvedParentId
      });

      if (result) {
        return {
          success: true,
          message: `Successfully created category "${result.name}" in ${result.type}`,
          data: result,
          suggestions: suggestions.length > 0 ? suggestions : undefined
        };
      } else {
        return {
          success: false,
          message: `Failed to create category "${name}"`,
          error: 'creation_failed',
          suggestions: [
            'Check that the category name is unique within its type and parent scope',
            'Verify that the parent category exists',
            'Try again or contact support if the problem persists'
          ]
        };
      }
    } catch (error) {
      console.error('Error in executeCreateCategory:', error);
      return {
        success: false,
        message: `Failed to create category: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error: 'creation_error',
        suggestions: [
          'Check your internet connection',
          'Verify the category details are correct',
          'Try again or contact support if the problem persists'
        ]
      };
    }
  }

  /**
   * Update category operation
   */
  private async executeUpdateCategory(
    params: Record<string, unknown>,
    suggestions: string[]
  ): Promise<OperationResult> {
    try {
      const categoryId = params.categoryId as string;
      const categoryName = params.categoryName as string;
      const name = params.name as string;
      const type = params.type as string;
      
      // Determine identifier to use
      const identifier = categoryId || categoryName;
      if (!identifier) {
        return {
          success: false,
          message: 'Category ID or name is required for update',
          error: 'missing_identifier',
          suggestions: ['Provide either categoryId or categoryName']
        };
      }

      // Build updates object
      const updates: { name?: string; type?: string; parent_id?: string | null } = {};
      if (name) updates.name = name.trim();
      if (type) updates.type = type.trim();

      const success = await this.categoriesStore.updateCategory(identifier, updates);

      if (success) {
        const updatedFields = Object.keys(updates).join(', ');
        return {
          success: true,
          message: `Successfully updated category "${identifier}" (${updatedFields})`,
          data: { identifier, updates },
          suggestions: suggestions.length > 0 ? suggestions : undefined
        };
      } else {
        return {
          success: false,
          message: `Failed to update category "${identifier}"`,
          error: 'update_failed',
          suggestions: [
            'Check that the category exists',
            'Verify the new values are valid',
            'Try again or contact support if the problem persists'
          ]
        };
      }
    } catch (error) {
      console.error('Error in executeUpdateCategory:', error);
      return {
        success: false,
        message: `Failed to update category: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error: 'update_error',
        suggestions: [
          'Check your internet connection',
          'Verify the category exists',
          'Try again or contact support if the problem persists'
        ]
      };
    }
  }

  /**
   * Delete category operation
   */
  private async executeDeleteCategory(
    params: Record<string, unknown>,
    suggestions: string[]
  ): Promise<OperationResult> {
    try {
      const categoryId = params.categoryId as string;
      const categoryName = params.categoryName as string;
      
      // Determine identifier to use
      const identifier = categoryId || categoryName;
      if (!identifier) {
        return {
          success: false,
          message: 'Category ID or name is required for deletion',
          error: 'missing_identifier',
          suggestions: ['Provide either categoryId or categoryName']
        };
      }

      const success = await this.categoriesStore.deleteCategory(identifier);

      if (success) {
        return {
          success: true,
          message: `Successfully deleted category "${identifier}"`,
          data: { identifier },
          suggestions: suggestions.length > 0 ? suggestions : undefined
        };
      } else {
        return {
          success: false,
          message: `Failed to delete category "${identifier}"`,
          error: 'deletion_failed',
          suggestions: [
            'Check that the category exists',
            'Ensure the category has no child categories',
            'Verify you have permission to delete categories',
            'Try again or contact support if the problem persists'
          ]
        };
      }
    } catch (error) {
      console.error('Error in executeDeleteCategory:', error);
      return {
        success: false,
        message: `Failed to delete category: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error: 'deletion_error',
        suggestions: [
          'Check your internet connection',
          'Verify the category exists and has no dependencies',
          'Try again or contact support if the problem persists'
        ]
      };
    }
  }

  /**
   * Move category operation
   */
  private async executeMoveCategory(
    params: Record<string, unknown>,
    suggestions: string[]
  ): Promise<OperationResult> {
    try {
      const categoryId = params.categoryId as string;
      const categoryName = params.categoryName as string;
      const newParentId = params.newParentId as string | null;
      const newParentName = params.newParentName as string;
      
      // Determine category identifier to use
      const categoryIdentifier = categoryId || categoryName;
      if (!categoryIdentifier) {
        return {
          success: false,
          message: 'Category ID or name is required for move operation',
          error: 'missing_identifier',
          suggestions: ['Provide either categoryId or categoryName']
        };
      }

      // Determine parent identifier to use
      let parentIdentifier = newParentId;
      if (newParentName && !newParentId) {
        parentIdentifier = newParentName;
      }

      const success = await this.categoriesStore.moveCategory(categoryIdentifier, parentIdentifier);

      if (success) {
        const moveDescription = parentIdentifier 
          ? `under "${parentIdentifier}"` 
          : 'to top level';
          
        return {
          success: true,
          message: `Successfully moved category "${categoryIdentifier}" ${moveDescription}`,
          data: { categoryIdentifier, parentIdentifier },
          suggestions: suggestions.length > 0 ? suggestions : undefined
        };
      } else {
        return {
          success: false,
          message: `Failed to move category "${categoryIdentifier}"`,
          error: 'move_failed',
          suggestions: [
            'Check that both the category and new parent exist',
            'Verify the move would not create a circular dependency',
            'Ensure there are no name conflicts in the new location',
            'Try again or contact support if the problem persists'
          ]
        };
      }
    } catch (error) {
      console.error('Error in executeMoveCategory:', error);
      return {
        success: false,
        message: `Failed to move category: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error: 'move_error',
        suggestions: [
          'Check your internet connection',
          'Verify both category and parent exist',
          'Try again or contact support if the problem persists'
        ]
      };
    }
  }

  /**
   * Ensures fresh category data by refreshing from database
   * This prevents validation loopholes with stale store data
   */
  private async ensureFreshCategoryData(): Promise<Array<{ 
    id: string; 
    name: string; 
    type: string; 
    company_id: string;
    parent_id?: string | null;
  }>> {
    try {
      await this.categoriesStore.refreshCategories();
      return this.categoriesStore.categories;
    } catch (error) {
      console.error('Error refreshing category data:', error);
      // Return current data as fallback, but log the issue
      console.warn('Using potentially stale category data due to refresh failure');
      return this.categoriesStore.categories;
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
    const categoryName = params.name as string || params.categoryName as string;
    
    return {
      success: false,
      message: `Unexpected error during ${operation}: ${errorMessage}`,
      error: 'unexpected_error',
      suggestions: [
        'Please try again',
        'Check your internet connection',
        'If the problem persists, contact support',
        ...(categoryName ? [`Category affected: "${categoryName}"`] : [])
      ]
    };
  }

  /**
   * Gets a user-friendly success message
   */
  static getSuccessMessage(operation: string, details: Record<string, unknown>): string {
    switch (operation) {
      case 'create_category':
        return `✅ Created category "${details.name}" in ${details.type}`;
      case 'update_category':
        return `✅ Updated category "${details.identifier}"`;
      case 'delete_category':
        return `✅ Deleted category "${details.identifier}"`;
      case 'move_category':
        return `✅ Moved category "${details.categoryIdentifier}" ${details.parentIdentifier ? `under "${details.parentIdentifier}"` : 'to top level'}`;
      default:
        return `✅ Category operation "${operation}" completed successfully`;
    }
  }

  /**
   * Gets a user-friendly error message with suggestions
   */
  static getErrorMessage(result: OperationResult): string {
    let message = `❌ ${result.message}`;
    
    if (result.suggestions && result.suggestions.length > 0) {
      message += `\n\nSuggestions:\n${result.suggestions.map(s => `• ${s}`).join('\n')}`;
    }
    
    return message;
  }
}
