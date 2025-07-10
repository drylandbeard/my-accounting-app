import { PayeeValidationContext, ValidationResult, PayeeError } from './types';

/**
 * Comprehensive payee validation utilities
 * Handles all edge cases and provides intelligent suggestions
 */

export class PayeeValidator {
  /**
   * Validates payee operations before execution
   */
  static validatePayeeOperation(
    operation: 'create' | 'update' | 'delete',
    params: Record<string, unknown>,
    context: PayeeValidationContext
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
      default:
        errors.push(`Unknown operation: ${operation}`);
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
    context: PayeeValidationContext,
    errors: string[],
    warnings: string[],
    suggestions: string[]
  ): ValidationResult {
    const name = params.name as string;

    // Check if name is provided
    if (!name || typeof name !== 'string') {
      errors.push('Payee name is required');
      suggestions.push('Please provide a valid payee name');
      return { isValid: false, errors, warnings, suggestions };
    }

    const trimmedName = name.trim();
    
    // Check if name is empty after trimming
    if (!trimmedName) {
      errors.push('Payee name cannot be empty');
      suggestions.push('Please provide a non-empty payee name');
      return { isValid: false, errors, warnings, suggestions };
    }

    // Check for exact duplicates
    const exactMatch = context.existingPayees.find(
      p => p.name.toLowerCase() === trimmedName.toLowerCase()
    );
    
    if (exactMatch) {
      errors.push(`Payee "${trimmedName}" already exists`);
      suggestions.push(
        `Use the existing payee "${exactMatch.name}"`,
        `Try "${trimmedName} Inc" or "${trimmedName} LLC"`,
        `Add a qualifier like "${trimmedName} (New)"`
      );
      return { isValid: false, errors, warnings, suggestions };
    }

    // Check for similar names (fuzzy matching)
    const similarPayees = this.findSimilarPayees(trimmedName, context.existingPayees);
    if (similarPayees.length > 0) {
      warnings.push(`Found similar payees: ${similarPayees.map(p => p.name).join(', ')}`);
      suggestions.push(
        `Did you mean one of these: ${similarPayees.map(p => p.name).join(', ')}?`,
        `Or continue with "${trimmedName}" as a new payee`
      );
    }

    // Check for potentially problematic characters
    if (this.hasProblematicCharacters(trimmedName)) {
      warnings.push('Payee name contains special characters that might cause issues');
      suggestions.push('Consider using alphanumeric characters and common punctuation');
    }

    // Check for length
    if (trimmedName.length > 255) {
      errors.push('Payee name is too long (maximum 255 characters)');
      suggestions.push('Please shorten the payee name');
    }

    return { isValid: errors.length === 0, errors, warnings, suggestions };
  }

  private static validateUpdate(
    params: Record<string, unknown>,
    context: PayeeValidationContext,
    errors: string[],
    warnings: string[],
    suggestions: string[]
  ): ValidationResult {
    const newName = params.name as string;
    const payeeId = params.payeeId as string;
    const payeeName = params.payeeName as string;

    // Check if new name is provided
    if (!newName || typeof newName !== 'string') {
      errors.push('New payee name is required');
      suggestions.push('Please provide a new name for the payee');
      return { isValid: false, errors, warnings, suggestions };
    }

    const trimmedNewName = newName.trim();
    
    // Check if new name is empty after trimming
    if (!trimmedNewName) {
      errors.push('New payee name cannot be empty');
      suggestions.push('Please provide a non-empty payee name');
      return { isValid: false, errors, warnings, suggestions };
    }

    // Find the payee to update
    let targetPayee = null;
    
    if (payeeId) {
      targetPayee = context.existingPayees.find(p => p.id === payeeId);
    } else if (payeeName) {
      targetPayee = context.existingPayees.find(
        p => p.name.toLowerCase() === payeeName.toLowerCase()
      );
      
      if (!targetPayee) {
        // Try fuzzy matching
        const similarPayees = this.findSimilarPayees(payeeName, context.existingPayees);
        if (similarPayees.length > 0) {
          errors.push(`Payee "${payeeName}" not found`);
          suggestions.push(
            `Did you mean: ${similarPayees.map(p => p.name).join(', ')}?`,
            `Available payees: ${context.existingPayees.map(p => p.name).join(', ')}`
          );
          return { isValid: false, errors, warnings, suggestions };
        }
      }
    }

    if (!targetPayee) {
      errors.push('Payee to update not found');
      suggestions.push(
        'Please specify a valid payee ID or name',
        `Available payees: ${context.existingPayees.map(p => p.name).join(', ')}`
      );
      return { isValid: false, errors, warnings, suggestions };
    }

    // Check if new name conflicts with existing payees (excluding the current one)
    const nameConflict = context.existingPayees.find(
      p => p.id !== targetPayee!.id && p.name.toLowerCase() === trimmedNewName.toLowerCase()
    );
    
    if (nameConflict) {
      errors.push(`Cannot rename to "${trimmedNewName}" - name already exists`);
      suggestions.push(
        `Choose a different name for "${targetPayee.name}"`,
        `Try "${trimmedNewName} Inc" or "${trimmedNewName} LLC"`,
        `The name "${trimmedNewName}" is already used by another payee`
      );
      return { isValid: false, errors, warnings, suggestions };
    }

    // Check for length
    if (trimmedNewName.length > 255) {
      errors.push('New payee name is too long (maximum 255 characters)');
      suggestions.push('Please shorten the payee name');
    }

    return { isValid: errors.length === 0, errors, warnings, suggestions };
  }

  private static validateDelete(
    params: Record<string, unknown>,
    context: PayeeValidationContext,
    errors: string[],
    warnings: string[],
    suggestions: string[]
  ): ValidationResult {
    const payeeId = params.payeeId as string;
    const payeeName = params.payeeName as string;

    // Find the payee to delete
    let targetPayee = null;
    
    if (payeeId) {
      targetPayee = context.existingPayees.find(p => p.id === payeeId);
    } else if (payeeName) {
      targetPayee = context.existingPayees.find(
        p => p.name.toLowerCase() === payeeName.toLowerCase()
      );
      
      if (!targetPayee) {
        // Try fuzzy matching
        const similarPayees = this.findSimilarPayees(payeeName, context.existingPayees);
        if (similarPayees.length > 0) {
          errors.push(`Payee "${payeeName}" not found`);
          suggestions.push(
            `Did you mean: ${similarPayees.map(p => p.name).join(', ')}?`,
            `Available payees: ${context.existingPayees.map(p => p.name).join(', ')}`
          );
          return { isValid: false, errors, warnings, suggestions };
        }
      }
    }

    if (!targetPayee) {
      errors.push('Payee to delete not found');
      suggestions.push(
        'Please specify a valid payee ID or name',
        `Available payees: ${context.existingPayees.map(p => p.name).join(', ')}`
      );
      return { isValid: false, errors, warnings, suggestions };
    }

    // Add warning about deletion consequences
    warnings.push(`This will permanently delete the payee "${targetPayee.name}"`);
    suggestions.push(
      'Make sure this payee is not used in any transactions',
      'Consider archiving instead of deleting if it has transaction history'
    );

    return { isValid: errors.length === 0, errors, warnings, suggestions };
  }

  /**
   * Finds payees with similar names using fuzzy matching
   */
  private static findSimilarPayees(
    targetName: string,
    existingPayees: Array<{ id: string; name: string }>
  ): Array<{ id: string; name: string }> {
    const target = targetName.toLowerCase();
    
    return existingPayees.filter(payee => {
      const name = payee.name.toLowerCase();
      
      // Check if one contains the other
      if (name.includes(target) || target.includes(name)) {
        return true;
      }
      
      // Check for similar words
      const targetWords = target.split(/\s+/);
      const nameWords = name.split(/\s+/);
      
      for (const targetWord of targetWords) {
        for (const nameWord of nameWords) {
          if (targetWord.length > 2 && nameWord.length > 2) {
            // Check if words are similar (simple substring check)
            if (targetWord.includes(nameWord) || nameWord.includes(targetWord)) {
              return true;
            }
          }
        }
      }
      
      return false;
    });
  }

  /**
   * Checks for potentially problematic characters in payee names
   */
  private static hasProblematicCharacters(name: string): boolean {
    // Check for characters that might cause issues in databases or exports
    const problematicChars = /[<>\"'`\r\n\t\f\v]/;
    return problematicChars.test(name);
  }

  /**
   * Creates a user-friendly error from validation results
   */
  static createErrorFromValidation(
    validation: ValidationResult,
    operation: string,
    params: Record<string, unknown>
  ): PayeeError {
    const errorMessage = validation.errors.join('; ');
    const suggestions = [...validation.suggestions, ...validation.warnings.map(w => `Note: ${w}`)];

    return {
      type: 'validation',
      message: errorMessage,
      details: `Operation: ${operation}`,
      suggestions,
      recoverable: true,
      payeeName: params.name as string || params.payeeName as string,
      payeeId: params.payeeId as string,
    };
  }

  /**
   * Validates batch operations
   */
  static validateBatchOperations(
    operations: Array<{ action: string; params: Record<string, unknown> }>,
    context: PayeeValidationContext
  ): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    // Track names that will be created in this batch to avoid duplicates
    const namesInBatch = new Set<string>();

    for (let i = 0; i < operations.length; i++) {
      const operation = operations[i];
      
      // Validate individual operation
      const validation = this.validatePayeeOperation(
        operation.action as 'create' | 'update' | 'delete',
        operation.params,
        context
      );

      if (!validation.isValid) {
        errors.push(`Operation ${i + 1}: ${validation.errors.join('; ')}`);
        suggestions.push(...validation.suggestions.map(s => `Operation ${i + 1}: ${s}`));
      }

      // Check for duplicates within the batch
      if (operation.action === 'create') {
        const name = (operation.params.name as string)?.trim()?.toLowerCase();
        if (name) {
          if (namesInBatch.has(name)) {
            errors.push(`Operation ${i + 1}: Duplicate name "${name}" within batch`);
          } else {
            namesInBatch.add(name);
          }
        }
      }

      warnings.push(...validation.warnings.map(w => `Operation ${i + 1}: ${w}`));
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      suggestions,
    };
  }
}
