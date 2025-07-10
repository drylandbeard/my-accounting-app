import { 
  Message, 
  OperationResult, 
  BatchOperationResult,
  PayeeOperation,
  ChatMessage,
  OpenAIResponse,
  PayeeValidationContext
} from './types';
import { PayeeExecutor } from './payee-executor';
import { ChatService } from './chat-service';
import { PayeeValidator } from './payee-validator';

/**
 * Main AI handler that coordinates all AI operations
 * Provides a unified interface for the AISidePanel component
 */
export class AIHandler {
  private payeeExecutor: PayeeExecutor;
  private chatService: ChatService;
  private payeesStore: {
    payees: Array<{ id: string; name: string; company_id: string }>;
    error: string | null;
    addPayee: (payee: { name: string }) => Promise<{ id: string; name: string } | null>;
    updatePayee: (id: string, updates: { name: string }) => Promise<boolean>;
    deletePayee: (id: string) => Promise<boolean>;
    refreshPayees: () => Promise<void>;
  };

  constructor(
    payeesStore: {
      payees: Array<{ id: string; name: string; company_id: string }>;
      error: string | null;
      addPayee: (payee: { name: string }) => Promise<{ id: string; name: string } | null>;
      updatePayee: (id: string, updates: { name: string }) => Promise<boolean>;
      deletePayee: (id: string) => Promise<boolean>;
      refreshPayees: () => Promise<void>;
    },
    currentCompany: { id: string; name: string } | null,
    apiKey: string
  ) {
    this.payeesStore = payeesStore;
    this.payeeExecutor = new PayeeExecutor(payeesStore, currentCompany);
    this.chatService = new ChatService(apiKey);
  }

  /**
   * Processes a user message and returns an AI response
   */
  async processUserMessage(
    userMessage: string,
    existingMessages: Message[],
    payees: Array<{ name: string }>
  ): Promise<{
    success: boolean;
    response?: Message;
    error?: string;
  }> {
    try {
      // Check for vague prompts
      if (this.isVaguePrompt(userMessage)) {
        return {
          success: true,
          response: {
            role: 'assistant',
            content: this.handleVaguePrompt(userMessage)
          }
        };
      }

      // Prepare messages for OpenAI
      const systemPrompt = this.chatService.getPayeeSystemPrompt(payees);
      const chatMessages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        ...existingMessages.map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: userMessage }
      ];

      // Get AI response
      const response = await this.chatService.sendChatCompletion(
        chatMessages,
        {
          model: 'gpt-4o-mini-2024-07-18',
          temperature: 0.2,
          maxTokens: 512,
          tools: this.chatService.getPayeeTools()
        }
      );

      return this.processOpenAIResponse(response);
    } catch (error) {
      console.error('Error processing user message:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Executes a confirmed action
   */
  async executeAction(action: Record<string, unknown>): Promise<string> {
    try {
      // Handle text confirmations that were converted to actual actions
      if (action.action === 'text_confirmation') {
        return '✅ Confirmed! Please try your request again with the specific action.';
      }
      
      if (action.action === 'batch_execute') {
        const operations = action.operations as PayeeOperation[];
        const result = await this.payeeExecutor.executeBatchOperations(operations);
        return this.formatBatchResult(result);
      }

      // Single operation
      const operationName = action.action as string;
      const result = await this.payeeExecutor.executePayeeOperation(
        operationName,
        action
      );

      return this.formatOperationResult(result, operationName);
    } catch (error) {
      console.error('Error executing action:', error);
      return `❌ Failed to execute action: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  /**
   * Processes OpenAI response and creates appropriate message
   */
  private processOpenAIResponse(response: OpenAIResponse): {
    success: boolean;
    response?: Message;
    error?: string;
  } {
    try {
      const choice = response.choices?.[0];
      const toolCalls = choice?.message?.tool_calls;
      let aiResponse = choice?.message?.content?.trim() || '';

      // Handle tool calls (function calling)
      if (toolCalls && toolCalls.length > 0) {
        if (toolCalls.length > 1) {
          // Multiple tool calls - create batch operation
          return this.createBatchConfirmationMessage(toolCalls);
        } else {
          // Single tool call
          return this.createSingleConfirmationMessage(toolCalls[0]);
        }
      }

      // Handle regular text response
      if (!aiResponse) {
        aiResponse = "Sorry, I could not generate a response.";
      }

      // Check if the response needs confirmation buttons
      const { needsConfirmation, pendingAction } = this.needsConfirmationButtons(aiResponse);
      if (needsConfirmation) {
        return {
          success: true,
          response: {
            role: 'assistant',
            content: aiResponse,
            showConfirmation: true,
            pendingAction: pendingAction as { action: string; [key: string]: unknown }
          }
        };
      }

      return {
        success: true,
        response: {
          role: 'assistant',
          content: aiResponse
        }
      };
    } catch (error) {
      console.error('Error processing OpenAI response:', error);
      return {
        success: false,
        error: 'Failed to process AI response'
      };
    }
  }

  /**
   * Creates a confirmation message for multiple operations
   */
  private createBatchConfirmationMessage(toolCalls: Array<{
    function?: { name: string; arguments: string };
  }>): {
    success: boolean;
    response: Message;
  } {
    let confirmationMessage = "I will perform the following actions:\n\n";
    const operations: PayeeOperation[] = [];
    const validationErrors: string[] = [];

    // First pass: validate all operations
    toolCalls.forEach((toolCall, index) => {
      const functionName = toolCall.function?.name;
      const args = JSON.parse(toolCall.function?.arguments || '{}');

      if (functionName) {
        const validation = this.validateOperationArgs(functionName, args);
        if (!validation.isValid) {
          validationErrors.push(`Operation ${index + 1}: ${validation.errorMessage}`);
        }
      }
    });

    // If there are validation errors, return them immediately
    if (validationErrors.length > 0) {
      return {
        success: true,
        response: {
          role: 'assistant',
          content: `I found some issues with your request:\n\n${validationErrors.join('\n')}\n\nPlease correct these issues and try again.`,
          isError: true
        }
      };
    }

    // Second pass: build confirmation message
    toolCalls.forEach((toolCall, index) => {
      const functionName = toolCall.function?.name;
      const args = JSON.parse(toolCall.function?.arguments || '{}');

      switch (functionName) {
        case 'create_payee':
          const createName = this.sanitizeDisplayValue(args.name);
          confirmationMessage += `${index + 1}. Create payee${createName ? ` "${createName}"` : ''}\n`;
          operations.push({ action: 'create_payee', params: args });
          break;
        case 'update_payee':
          const currentName = this.sanitizeDisplayValue(args.payeeName || args.payeeId);
          const newName = this.sanitizeDisplayValue(args.name);
          confirmationMessage += `${index + 1}. Update payee${currentName ? ` "${currentName}"` : ''}${newName ? ` to "${newName}"` : ''}\n`;
          operations.push({ action: 'update_payee', params: args });
          break;
        case 'delete_payee':
          const deleteName = this.sanitizeDisplayValue(args.payeeName || args.payeeId);
          confirmationMessage += `${index + 1}. Delete payee${deleteName ? ` "${deleteName}"` : ''}\n`;
          operations.push({ action: 'delete_payee', params: args });
          break;
        default:
          confirmationMessage += `${index + 1}. ${functionName || 'Unknown operation'}\n`;
          break;
      }
    });

    confirmationMessage += "\nPress Confirm to execute all actions, or Cancel to abort.";

    return {
      success: true,
      response: {
        role: 'assistant',
        content: confirmationMessage,
        showConfirmation: true,
        pendingAction: { action: 'batch_execute', operations }
      }
    };
  }

  /**
   * Creates a confirmation message for a single operation
   */
  private createSingleConfirmationMessage(toolCall: {
    function?: { name: string; arguments: string };
  }): {
    success: boolean;
    response: Message;
  } {
    const functionName = toolCall.function?.name;
    const args = JSON.parse(toolCall.function?.arguments || '{}');

    // Validate operation arguments
    if (functionName) {
      const validation = this.validateOperationArgs(functionName, args);
      if (!validation.isValid) {
        return {
          success: true,
          response: {
            role: 'assistant',
            content: validation.errorMessage || 'Operation is invalid',
            isError: true
          }
        };
      }
    }

    let confirmationMessage = '';
    let pendingAction: Record<string, unknown> = { action: functionName, ...args };

    switch (functionName) {
      case 'create_payee':
        const payeeName = this.sanitizeDisplayValue(args.name);
        confirmationMessage = `I'll create a new payee${payeeName ? ` named "${payeeName}"` : ''}. Would you like to proceed?`;
        break;
      case 'update_payee':
        const currentPayee = this.sanitizeDisplayValue(args.payeeName || args.payeeId);
        const newPayeeName = this.sanitizeDisplayValue(args.name);
        confirmationMessage = `I'll update the payee${currentPayee ? ` "${currentPayee}"` : ''}${newPayeeName ? ` to "${newPayeeName}"` : ''}. Would you like to proceed?`;
        break;
      case 'delete_payee':
        const payeeToDelete = this.sanitizeDisplayValue(args.payeeName || args.payeeId);
        confirmationMessage = `I'll delete the payee${payeeToDelete ? ` "${payeeToDelete}"` : ''}. Would you like to proceed?`;
        break;
      case 'batch_execute':
        const operations = args.operations || [];
        let batchMessage = "I'll perform the following operations:\n\n";
        
        operations.forEach((op: PayeeOperation, index: number) => {
          const params = op.params;
          
          switch (op.action) {
            case 'create_payee':
              const createName = this.sanitizeDisplayValue(params.name);
              batchMessage += `${index + 1}. Create payee${createName ? ` "${createName}"` : ''}\n`;
              break;
            case 'update_payee':
              const currentName = this.sanitizeDisplayValue(params.payeeName || params.payeeId);
              const newName = this.sanitizeDisplayValue(params.name);
              batchMessage += `${index + 1}. Update payee${currentName ? ` "${currentName}"` : ''}${newName ? ` to "${newName}"` : ''}\n`;
              break;
            case 'delete_payee':
              const deleteName = this.sanitizeDisplayValue(params.payeeName || params.payeeId);
              batchMessage += `${index + 1}. Delete payee${deleteName ? ` "${deleteName}"` : ''}\n`;
              break;
            default:
              batchMessage += `${index + 1}. ${op.action} operation\n`;
          }
        });
        
        batchMessage += "\nWould you like to proceed with all these operations?";
        confirmationMessage = batchMessage;
        pendingAction = { action: 'batch_execute', operations };
        break;
      default:
        confirmationMessage = `I'll ${functionName?.replace('_', ' ') || 'perform the operation'} based on your request. Would you like to proceed?`;
        break;
    }

    return {
      success: true,
      response: {
        role: 'assistant',
        content: confirmationMessage,
        showConfirmation: true,
        pendingAction: pendingAction as { action: string; [key: string]: unknown }
      }
    };
  }

  /**
   * Formats operation result for user display
   */
  private formatOperationResult(result: OperationResult, operationName: string): string {
    if (result.success) {
      // Create a better success message that doesn't show null/undefined
      return this.createSuccessMessage(operationName, result);
    } else {
      return PayeeExecutor.getErrorMessage(result);
    }
  }

  /**
   * Creates a user-friendly success message without null/undefined values
   */
  private createSuccessMessage(operationName: string, result: OperationResult): string {
    const data = result.data as Record<string, unknown> || {};
    
    switch (operationName) {
      case 'create_payee':
        const createdName = this.sanitizeDisplayValue(data.name);
        return `✅ Successfully created payee${createdName ? ` "${createdName}"` : ''}`;
        
      case 'update_payee':
        const updatedName = this.sanitizeDisplayValue(data.name);
        return `✅ Successfully updated payee${updatedName ? ` to "${updatedName}"` : ''}`;
        
      case 'delete_payee':
        const deletedName = this.sanitizeDisplayValue(data.name);
        return `✅ Successfully deleted payee${deletedName ? ` "${deletedName}"` : ''}`;
        
      default:
        return '✅ Operation completed successfully';
    }
  }

  /**
   * Sanitizes display values to avoid showing null, undefined, or empty strings
   */
  private sanitizeDisplayValue(value: unknown): string | null {
    if (value === null || value === undefined || value === '' || value === 'null' || value === 'undefined') {
      return null;
    }
    
    const stringValue = String(value).trim();
    if (stringValue === '' || stringValue === 'null' || stringValue === 'undefined') {
      return null;
    }
    
    return stringValue;
  }

  /**
   * Formats batch operation result for user display
   */
  private formatBatchResult(result: BatchOperationResult): string {
    if (result.success) {
      const operationCount = this.sanitizeDisplayValue(result.completedOperations) || '0';
      return `✅ Successfully completed ${operationCount} operation${result.completedOperations === 1 ? '' : 's'}!`;
    } else {
      let message = `❌ Batch operation failed: ${result.message || 'Unknown error'}`;
      
      if (result.completedOperations > 0) {
        const completedCount = this.sanitizeDisplayValue(result.completedOperations) || '0';
        message += `\n\n✅ Completed: ${completedCount} operation${result.completedOperations === 1 ? '' : 's'}`;
      }
      
      if (result.failedAt !== undefined && result.failedAt !== null) {
        const failedAt = this.sanitizeDisplayValue(result.failedAt + 1) || 'unknown';
        message += `\n❌ Failed at operation ${failedAt}`;
      }
      
      return message;
    }
  }

  /**
   * Checks if a prompt is vague and needs clarification
   */
  private isVaguePrompt(message: string): boolean {
    const vaguePatterns = [
      /^add\s+payee$/i,
      /^new\s+payee$/i,
      /^create\s+payee$/i,
      /^delete\s+(\w+)$/i,
      /^update\s+(\w+)$/i,
      /^rename\s+(\w+)$/i,
    ];
    
    return vaguePatterns.some(pattern => pattern.test(message.trim()));
  }

  /**
   * Handles vague prompts with helpful clarifications
   */
  private handleVaguePrompt(userMessage: string): string {
    if (/add|create|new/i.test(userMessage) && /payee/i.test(userMessage)) {
      return "I'd be happy to create a new payee for you. Could you please provide:\n\n" +
        "1. The complete name for the payee\n" +
        "2. Any additional details about the payee if relevant";
    } else if (/delete|remove/i.test(userMessage)) {
      return "I'd be happy to delete that payee for you, but I need to know:\n\n" +
        "1. The complete name of the payee you want to delete\n" +
        "2. Are you sure you want to permanently remove it?";
    } else if (/update|change|modify|rename/i.test(userMessage)) {
      return "I'd be happy to make that change, but I need more specifics:\n\n" +
        "1. The exact name of the payee you want to change\n" +
        "2. What would you like to rename it to?";
    }
    
    return "I'd be happy to help with that, but I need a bit more information. " +
      "Could you please be more specific about what you'd like me to do?";
  }

  /**
   * Validates operation arguments before creating confirmation message
   */
  private validateOperationArgs(
    functionName: string,
    args: Record<string, unknown>
  ): { isValid: boolean; errorMessage?: string } {
    const existingPayees = this.payeesStore.payees || [];
    
    // Create validation context
    const context: PayeeValidationContext = {
      existingPayees,
      operation: functionName as 'create' | 'update' | 'delete'
    };
    
    // Map function names to operation types
    const operationMap: Record<string, 'create' | 'update' | 'delete'> = {
      'create_payee': 'create',
      'update_payee': 'update',
      'delete_payee': 'delete'
    };
    
    const operation = operationMap[functionName];
    if (!operation) {
      return { isValid: false, errorMessage: `Unknown operation: ${functionName}` };
    }
    
    // Use the comprehensive PayeeValidator
    const validation = PayeeValidator.validatePayeeOperation(operation, args, context);
    
    if (!validation.isValid) {
      // Combine errors and suggestions into a user-friendly message
      let errorMessage = validation.errors.join('; ');
      
      if (validation.suggestions.length > 0) {
        errorMessage += '\n\nSuggestions:\n' + validation.suggestions.map(s => `• ${s}`).join('\n');
      }
      
      return { isValid: false, errorMessage };
    }
    
    return { isValid: true };
  }

  /**
   * Detects if a text response needs confirmation buttons
   */
  private needsConfirmationButtons(content: string): { needsConfirmation: boolean; pendingAction?: Record<string, unknown> } {
    // Check for confirmation questions
    const confirmationPatterns = [
      /would you like to proceed/i,
      /would you like to continue/i,
      /shall I proceed/i,
      /do you want to proceed/i,
      /proceed with those/i,
      /proceed with these/i,
      /proceed with that/i,
      /proceed with this/i,
      /would you like me to/i,
      /should I proceed/i,
      /continue with/i,
    ];
    
    const hasConfirmationQuestion = confirmationPatterns.some(pattern => pattern.test(content));
    
    if (!hasConfirmationQuestion) {
      return { needsConfirmation: false };
    }
    
    // Try to extract the intended action from the content
    let pendingAction: Record<string, unknown> = { action: 'text_confirmation' };
    
    // Look for batch operations (multiple payees)
    const batchMatches = content.match(/add\s+"([^"]+)",?\s*"([^"]+)",?\s*(?:and\s+)?"([^"]+)"/i) ||
                        content.match(/help you add\s+"([^"]+)",?\s*"([^"]+)",?\s*(?:and\s+)?"([^"]+)"/i);
    if (batchMatches) {
      const payeeNames = batchMatches.slice(1)
        .filter(name => name && name.trim())
        .map(name => name.trim().replace(/[,.]$/, '')); // Remove trailing commas and periods
      
      pendingAction = {
        action: 'batch_execute',
        operations: payeeNames.map(name => ({
          action: 'create_payee',
          params: { name: name.trim() }
        }))
      };
      return { needsConfirmation: true, pendingAction };
    }
    
    // Look for single create operations
    const createMatch = content.match(/create.*payee.*"([^"]+)"/i) || 
                       content.match(/add.*payee.*"([^"]+)"/i);
    if (createMatch) {
      pendingAction = {
        action: 'create_payee',
        name: createMatch[1]
      };
      return { needsConfirmation: true, pendingAction };
    }
    
    // Look for update operations
    const updateMatch = content.match(/update.*payee.*"([^"]+)".*to.*"([^"]+)"/i) ||
                       content.match(/rename.*"([^"]+)".*to.*"([^"]+)"/i);
    if (updateMatch) {
      pendingAction = {
        action: 'update_payee',
        payeeName: updateMatch[1],
        name: updateMatch[2]
      };
      return { needsConfirmation: true, pendingAction };
    }
    
    // Look for delete operations
    const deleteMatch = content.match(/delete.*payee.*"([^"]+)"/i) ||
                       content.match(/remove.*payee.*"([^"]+)"/i);
    if (deleteMatch) {
      pendingAction = {
        action: 'delete_payee',
        payeeName: deleteMatch[1]
      };
      return { needsConfirmation: true, pendingAction };
    }
    
    // Default to generic confirmation if we can't extract specific action
    return { needsConfirmation: true, pendingAction };
  }
}
