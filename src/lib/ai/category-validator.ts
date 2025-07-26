import { 
  ValidationResult, 
  CategoryValidationContext, 
  CategoryError 
} from './types';

/**
 * Comprehensive category validation utilities
 * Handles all edge cases and provides intelligent suggestions for chart of accounts operations
 * 
 * MULTI-LAYER VALIDATION APPROACH:
 * 1. Client-side validation (this class) - Uses fresh data from ensureFreshCategoryData()
 * 2. Server-side validation (API routes) - Final check against live database
 * 3. Database constraints - Ultimate safeguard with unique constraints
 * 
 * This approach prevents validation loopholes by:
 * - Refreshing data before validation to minimize stale data issues
 * - Providing immediate feedback to users with client-side checks
 * - Ensuring data integrity with server-side validation
 * - Handling race conditions gracefully with proper error messages
 */

// Account type constants
const ACCOUNT_TYPES = ["Asset", "Liability", "Equity", "Revenue", "COGS", "Expense", "Bank Account", "Credit Card"];

export class CategoryValidator {
  /**
   * Validates category operations before execution
   */
  static validateCategoryOperation(
    operation: 'create' | 'update' | 'delete' | 'move',
    params: Record<string, unknown>,
    context: CategoryValidationContext
  ): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    switch (operation) {
      case 'create':
        return this.validateCreate(params, context, errors, warnings, suggestions);
      case 'update':
        return this.validateUpdate(params, context, errors, warnings, suggestions);
      case 'delete':
        return this.validateDelete(params, context, errors, warnings, suggestions);
      case 'move':
        return this.validateMove(params, context, errors, warnings, suggestions);
      default:
        errors.push(`Unknown operation: ${operation}`);
        suggestions.push('Supported operations: create, update, delete, move');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      suggestions,
    };
  }

  private static validateCreate(
    params: Record<string, unknown>,
    context: CategoryValidationContext,
    errors: string[],
    warnings: string[],
    suggestions: string[]
  ): ValidationResult {
    const name = params.name as string;
    const type = params.type as string;
    const parentId = params.parent_id as string | null;
    const parentName = params.parent_name as string;

    // Check if name is provided
    if (!name || typeof name !== 'string') {
      errors.push('Category name is required');
      suggestions.push('Please provide a category name');
      return { isValid: false, errors, warnings, suggestions };
    }

    const trimmedName = name.trim();
    
    // Check if name is empty after trimming
    if (!trimmedName) {
      errors.push('Category name cannot be empty');
      suggestions.push('Please provide a non-empty category name');
      return { isValid: false, errors, warnings, suggestions };
    }

    // Check if type is provided and valid
    if (!type || typeof type !== 'string') {
      errors.push('Category type is required');
      suggestions.push(`Valid types: ${ACCOUNT_TYPES.join(', ')}`);
      return { isValid: false, errors, warnings, suggestions };
    }

    const trimmedType = type.trim();
    if (!ACCOUNT_TYPES.includes(trimmedType)) {
      errors.push(`Invalid category type: "${trimmedType}"`);
      suggestions.push(`Valid types: ${ACCOUNT_TYPES.join(', ')}`);
      return { isValid: false, errors, warnings, suggestions };
    }

    // Resolve parent if parent_name is provided
    let resolvedParentId = parentId;
    if (parentName && !parentId) {
      const parentCategory = context.existingCategories.find(
        c => c.name.toLowerCase() === parentName.toLowerCase() && c.type === trimmedType
      );
      if (parentCategory) {
        resolvedParentId = parentCategory.id;
        suggestions.push(`Found parent category: "${parentCategory.name}"`);
      } else {
        warnings.push(`Parent category "${parentName}" not found`);
        suggestions.push(`Create parent category "${parentName}" first, or leave as top-level category`);
      }
    }

    // Check for exact duplicates within the same type and parent scope
    const scopedCategories = context.existingCategories.filter(
      c => c.type === trimmedType && c.parent_id === resolvedParentId
    );
    
    const exactMatch = scopedCategories.find(
      c => c.name.toLowerCase() === trimmedName.toLowerCase()
    );
    
    if (exactMatch) {
      errors.push(`Category "${trimmedName}" already exists in ${trimmedType}${resolvedParentId ? ` under parent` : ''}`);
      suggestions.push(`Use a different name like "${trimmedName} - New" or update the existing category`);
      return { isValid: false, errors, warnings, suggestions };
    }

    // Check for similar names within the same scope (fuzzy matching)
    const similarCategories = this.findSimilarCategories(trimmedName, scopedCategories);
    if (similarCategories.length > 0) {
      warnings.push(`Similar categories found: ${similarCategories.map(c => `"${c.name}"`).join(', ')}`);
      suggestions.push('Consider if you meant to reference an existing category');
    }

    // Check for potentially problematic characters
    if (this.hasProblematicCharacters(trimmedName)) {
      warnings.push('Category name contains potentially problematic characters');
      suggestions.push('Consider using only letters, numbers, spaces, and common punctuation');
    }

    // Check for length
    if (trimmedName.length > 255) {
      errors.push('Category name is too long (maximum 255 characters)');
      suggestions.push('Please shorten the category name');
    }

    // Validate parent relationship
    if (resolvedParentId) {
      const parentCategory = context.existingCategories.find(c => c.id === resolvedParentId);
      if (!parentCategory) {
        errors.push('Specified parent category does not exist');
        suggestions.push('Create the parent category first or select a different parent');
      } else if (parentCategory.type !== trimmedType) {
        errors.push(`Parent category type "${parentCategory.type}" does not match child type "${trimmedType}"`);
        suggestions.push('Parent and child categories must have the same type');
      }
    }

    return { isValid: errors.length === 0, errors, warnings, suggestions };
  }

  private static validateUpdate(
    params: Record<string, unknown>,
    context: CategoryValidationContext,
    errors: string[],
    warnings: string[],
    suggestions: string[]
  ): ValidationResult {
    const name = params.name as string;
    const type = params.type as string;
    const categoryId = params.categoryId as string;
    const categoryName = params.categoryName as string;

    // Resolve category ID if name is provided instead
    let resolvedCategoryId = categoryId;
    if (!categoryId && categoryName) {
      const category = context.existingCategories.find(
        c => c.name.toLowerCase() === categoryName.toLowerCase()
      );
      if (category) {
        resolvedCategoryId = category.id;
      } else {
        errors.push(`Category "${categoryName}" not found`);
        suggestions.push('Check the category name spelling or create a new category');
        return { isValid: false, errors, warnings, suggestions };
      }
    }

    if (!resolvedCategoryId) {
      errors.push('Category ID or name is required for update');
      suggestions.push('Specify either categoryId or categoryName');
      return { isValid: false, errors, warnings, suggestions };
    }

    // Find the existing category
    const existingCategory = context.existingCategories.find(c => c.id === resolvedCategoryId);
    if (!existingCategory) {
      errors.push('Category not found');
      suggestions.push('Check that the category exists and try again');
      return { isValid: false, errors, warnings, suggestions };
    }

    // Validate new name if provided
    if (name) {
      const trimmedName = name.trim();
      if (!trimmedName) {
        errors.push('Category name cannot be empty');
        suggestions.push('Provide a non-empty name or omit to keep current name');
        return { isValid: false, errors, warnings, suggestions };
      }

      // Check for duplicates (excluding the current category)
      const newType = type || existingCategory.type;
      const scopedCategories = context.existingCategories.filter(
        c => c.type === newType && c.parent_id === existingCategory.parent_id && c.id !== resolvedCategoryId
      );

      const exactMatch = scopedCategories.find(
        c => c.name.toLowerCase() === trimmedName.toLowerCase()
      );

      if (exactMatch) {
        errors.push(`Category "${trimmedName}" already exists in ${newType}`);
        suggestions.push(`Use a different name or merge with existing category "${exactMatch.name}"`);
        return { isValid: false, errors, warnings, suggestions };
      }

      // Check for similar names
      const similarCategories = this.findSimilarCategories(trimmedName, scopedCategories);
      if (similarCategories.length > 0) {
        warnings.push(`Similar categories found: ${similarCategories.map(c => `"${c.name}"`).join(', ')}`);
        suggestions.push('Consider if you meant to reference an existing category');
      }

      // Length validation
      if (trimmedName.length > 255) {
        errors.push('Category name is too long (maximum 255 characters)');
        suggestions.push('Please shorten the category name');
      }
    }

    // Validate type if provided
    if (type && !ACCOUNT_TYPES.includes(type)) {
      errors.push(`Invalid category type: "${type}"`);
      suggestions.push(`Valid types: ${ACCOUNT_TYPES.join(', ')}`);
    }

    return { isValid: errors.length === 0, errors, warnings, suggestions };
  }

  private static validateDelete(
    params: Record<string, unknown>,
    context: CategoryValidationContext,
    errors: string[],
    warnings: string[],
    suggestions: string[]
  ): ValidationResult {
    const categoryId = params.categoryId as string;
    const categoryName = params.categoryName as string;

    // Resolve category ID if name is provided instead
    let resolvedCategoryId = categoryId;
    if (!categoryId && categoryName) {
      const category = context.existingCategories.find(
        c => c.name.toLowerCase() === categoryName.toLowerCase()
      );
      if (category) {
        resolvedCategoryId = category.id;
      } else {
        errors.push(`Category "${categoryName}" not found`);
        suggestions.push('Check the category name spelling');
        return { isValid: false, errors, warnings, suggestions };
      }
    }

    if (!resolvedCategoryId) {
      errors.push('Category ID or name is required for deletion');
      suggestions.push('Specify either categoryId or categoryName');
      return { isValid: false, errors, warnings, suggestions };
    }

    // Find the existing category
    const existingCategory = context.existingCategories.find(c => c.id === resolvedCategoryId);
    if (!existingCategory) {
      errors.push('Category not found');
      suggestions.push('Category may have already been deleted');
      return { isValid: false, errors, warnings, suggestions };
    }

    // Check for child categories
    const childCategories = context.existingCategories.filter(c => c.parent_id === resolvedCategoryId);
    if (childCategories.length > 0) {
      errors.push(`Cannot delete category "${existingCategory.name}" because it has ${childCategories.length} child categories`);
      suggestions.push('Delete or move child categories first');
      suggestions.push(`Child categories: ${childCategories.map(c => `"${c.name}"`).join(', ')}`);
      return { isValid: false, errors, warnings, suggestions };
    }

    // Warning about potential impact
    warnings.push(`Deleting category "${existingCategory.name}" will affect any transactions using this category`);
    suggestions.push('Consider archiving instead of deleting if the category has transaction history');

    return { isValid: errors.length === 0, errors, warnings, suggestions };
  }

  private static validateMove(
    params: Record<string, unknown>,
    context: CategoryValidationContext,
    errors: string[],
    warnings: string[],
    suggestions: string[]
  ): ValidationResult {
    const categoryId = params.categoryId as string;
    const categoryName = params.categoryName as string;
    const newParentId = params.newParentId as string | null;
    const newParentName = params.newParentName as string;

    // Resolve category ID if name is provided instead
    let resolvedCategoryId = categoryId;
    if (!categoryId && categoryName) {
      const category = context.existingCategories.find(
        c => c.name.toLowerCase() === categoryName.toLowerCase()
      );
      if (category) {
        resolvedCategoryId = category.id;
      } else {
        errors.push(`Category "${categoryName}" not found`);
        suggestions.push('Check the category name spelling');
        return { isValid: false, errors, warnings, suggestions };
      }
    }

    if (!resolvedCategoryId) {
      errors.push('Category ID or name is required for move operation');
      suggestions.push('Specify either categoryId or categoryName');
      return { isValid: false, errors, warnings, suggestions };
    }

    // Find the existing category
    const existingCategory = context.existingCategories.find(c => c.id === resolvedCategoryId);
    if (!existingCategory) {
      errors.push('Category not found');
      suggestions.push('Check that the category exists and try again');
      return { isValid: false, errors, warnings, suggestions };
    }

    // Resolve new parent ID if name is provided
    let resolvedNewParentId = newParentId;
    if (newParentName && !newParentId) {
      const parentCategory = context.existingCategories.find(
        c => c.name.toLowerCase() === newParentName.toLowerCase() && c.type === existingCategory.type
      );
      if (parentCategory) {
        resolvedNewParentId = parentCategory.id;
      } else {
        errors.push(`Parent category "${newParentName}" not found`);
        suggestions.push('Check the parent category name or create it first');
        return { isValid: false, errors, warnings, suggestions };
      }
    }

    // Validate new parent if specified
    if (resolvedNewParentId) {
      const newParentCategory = context.existingCategories.find(c => c.id === resolvedNewParentId);
      if (!newParentCategory) {
        errors.push('New parent category does not exist');
        suggestions.push('Create the parent category first or select a different parent');
        return { isValid: false, errors, warnings, suggestions };
      }

      // Check type compatibility
      if (newParentCategory.type !== existingCategory.type) {
        errors.push(`Cannot move "${existingCategory.name}" (${existingCategory.type}) under "${newParentCategory.name}" (${newParentCategory.type})`);
        suggestions.push('Parent and child categories must have the same type');
        return { isValid: false, errors, warnings, suggestions };
      }

      // Check for circular dependency
      if (this.wouldCreateCircularDependency(resolvedCategoryId, resolvedNewParentId, context.existingCategories)) {
        errors.push('Cannot move category: this would create a circular dependency');
        suggestions.push('Choose a different parent that is not a descendant of the category being moved');
        return { isValid: false, errors, warnings, suggestions };
      }

      // Check for name conflicts in the new location
      const siblingCategories = context.existingCategories.filter(
        c => c.parent_id === resolvedNewParentId && c.id !== resolvedCategoryId
      );

      const nameConflict = siblingCategories.find(
        c => c.name.toLowerCase() === existingCategory.name.toLowerCase()
      );

      if (nameConflict) {
        errors.push(`Category "${existingCategory.name}" already exists under "${newParentCategory.name}"`);
        suggestions.push('Rename one of the categories or choose a different parent');
        return { isValid: false, errors, warnings, suggestions };
      }
    }

    return { isValid: errors.length === 0, errors, warnings, suggestions };
  }

  /**
   * Finds categories with similar names using fuzzy matching
   */
  private static findSimilarCategories(
    targetName: string,
    existingCategories: Array<{ id: string; name: string }>
  ): Array<{ id: string; name: string }> {
    const normalizedTarget = targetName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const similarCategories: Array<{ id: string; name: string }> = [];

    for (const category of existingCategories) {
      const normalizedExisting = category.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      
      // Check for partial matches or similar patterns
      if (normalizedExisting.includes(normalizedTarget) || 
          normalizedTarget.includes(normalizedExisting) ||
          this.calculateSimilarity(normalizedTarget, normalizedExisting) > 0.7) {
        similarCategories.push(category);
      }
    }

    return similarCategories.slice(0, 3); // Limit to top 3 matches
  }

  /**
   * Calculates similarity between two strings (0-1, where 1 is identical)
   */
  private static calculateSimilarity(str1: string, str2: string): number {
    if (str1 === str2) return 1;
    if (str1.length === 0 || str2.length === 0) return 0;

    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1;
    
    return (longer.length - this.levenshteinDistance(longer, shorter)) / longer.length;
  }

  /**
   * Calculates Levenshtein distance between two strings
   */
  private static levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1, // deletion
          matrix[j - 1][i] + 1, // insertion
          matrix[j - 1][i - 1] + indicator // substitution
        );
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Checks for potentially problematic characters in category names
   */
  private static hasProblematicCharacters(name: string): boolean {
    // Check for characters that might cause issues in accounting systems
    const problematicChars = /[<>"/\\|?*\x00-\x1f]/;
    return problematicChars.test(name);
  }

  /**
   * Checks if moving a category would create a circular dependency
   */
  private static wouldCreateCircularDependency(
    categoryId: string,
    newParentId: string,
    existingCategories: Array<{ id: string; parent_id?: string | null }>
  ): boolean {
    // Check if the new parent is a descendant of the category being moved
    let currentParentId: string | null = newParentId;
    const visited = new Set<string>();

    while (currentParentId && !visited.has(currentParentId)) {
      if (currentParentId === categoryId) {
        return true; // Circular dependency detected
      }
      
      visited.add(currentParentId);
      const parent = existingCategories.find(c => c.id === currentParentId);
      currentParentId = parent?.parent_id || null;
    }

    return false;
  }

  /**
   * Creates a user-friendly error from validation results
   */
  static createErrorFromValidation(
    validation: ValidationResult,
    operation: string,
    params: Record<string, unknown>
  ): CategoryError {
    const categoryName = params.name as string || params.categoryName as string;
    const categoryType = params.type as string;
    
    return {
      type: 'validation',
      message: validation.errors.join('. '),
      details: validation.warnings.length > 0 ? validation.warnings.join('. ') : undefined,
      suggestions: validation.suggestions,
      recoverable: true,
      categoryName,
      categoryId: params.categoryId as string,
      categoryType,
      parentName: params.parent_name as string,
      parentId: params.parent_id as string
    };
  }

  /**
   * Validates batch operations
   */
  static validateBatchOperations(
    operations: Array<{ action: string; params: Record<string, unknown> }>,
    context: CategoryValidationContext
  ): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    if (operations.length === 0) {
      errors.push('No operations provided');
      suggestions.push('Provide at least one operation to execute');
      return { isValid: false, errors, warnings, suggestions };
    }

    if (operations.length > 10) {
      errors.push('Too many operations in batch (maximum 10)');
      suggestions.push('Split into smaller batches or execute operations individually');
      return { isValid: false, errors, warnings, suggestions };
    }

    // Validate each operation
    for (let i = 0; i < operations.length; i++) {
      const operation = operations[i];
      const operationType = operation.action.replace('_category', '') as 'create' | 'update' | 'delete' | 'move';
      
      if (!['create', 'update', 'delete', 'move'].includes(operationType)) {
        errors.push(`Invalid operation type at index ${i}: ${operation.action}`);
        continue;
      }

      const validation = this.validateCategoryOperation(operationType, operation.params, context);
      if (!validation.isValid) {
        errors.push(`Operation ${i + 1} (${operation.action}): ${validation.errors.join(', ')}`);
        if (validation.suggestions.length > 0) {
          suggestions.push(`Operation ${i + 1}: ${validation.suggestions.join(', ')}`);
        }
      } else if (validation.warnings.length > 0) {
        warnings.push(`Operation ${i + 1}: ${validation.warnings.join(', ')}`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      suggestions
    };
  }
}
