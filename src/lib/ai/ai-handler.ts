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
import { CategoryExecutor } from './category-executor';
import { ChatService } from './chat-service';
import { PayeeValidator } from './payee-validator';

/**
 * Main AI handler that coordinates all AI operations
 * Provides a unified interface for the AISidePanel component
 */
export class AIHandler {
  private payeeExecutor: PayeeExecutor;
  private categoryExecutor: CategoryExecutor;
  private chatService: ChatService;
  private payeesStore: {
    payees: Array<{ id: string; name: string; company_id: string }>;
    error: string | null;
    addPayee: (payee: { name: string }) => Promise<{ id: string; name: string } | null>;
    updatePayee: (id: string, updates: { name: string }) => Promise<boolean>;
    deletePayee: (id: string) => Promise<boolean>;
    refreshPayees: () => Promise<void>;
  };
  private categoriesStore: {
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
    categoriesStore: {
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
    },
    currentCompany: { id: string; name: string } | null,
    apiKey: string
  ) {
    this.payeesStore = payeesStore;
    this.categoriesStore = categoriesStore;
    this.payeeExecutor = new PayeeExecutor(payeesStore, currentCompany);
    this.categoryExecutor = new CategoryExecutor(categoriesStore, currentCompany);
    this.chatService = new ChatService(apiKey);
  }

  /**
   * Processes a user message and returns an AI response
   */
  async processUserMessage(
    userMessage: string,
    existingMessages: Message[],
    payees: Array<{ name: string }>,
    categories: Array<{ name: string; type: string; parent_id?: string | null }>
  ): Promise<{
    success: boolean;
    response?: Message;
    error?: string;
  }> {
    try {
      // Check for vague prompts - route through AI for dynamic response
      if (this.isVaguePrompt(userMessage)) {
        return await this.generateAIResponse(userMessage, existingMessages, payees, categories, 'vague_prompt');
      }

      // Detect operation type
      const operationType = this.detectOperationType(userMessage);

      // Prepare messages for OpenAI based on operation type
      let systemPrompt: string;
      let tools: unknown[];

      if (operationType === 'category' || operationType === 'mixed') {
        systemPrompt = this.chatService.getUnifiedSystemPrompt(payees, categories);
        tools = this.chatService.getUnifiedTools();
      } else {
        // Default to payee operations for backward compatibility
        systemPrompt = this.chatService.getPayeeSystemPrompt(payees);
        tools = this.chatService.getPayeeTools();
      }
      
      // For operations, limit chat history to prevent confusion from stale operations
      let recentMessages: Message[] = [];
      if (operationType !== 'general') {
        // For specific operations, only include the most recent 2 messages to minimize conflicting context
        recentMessages = existingMessages.slice(-2);
        console.log(`🎯 ${operationType} operation detected, using minimal context: ${recentMessages.length} messages`);
      } else {
        // For general operations, include more context
        recentMessages = existingMessages.slice(-6);
        console.log(`📨 General operation, using ${recentMessages.length} recent messages`);
      }
      
      const chatMessages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        ...recentMessages.map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: userMessage }
      ];

      // Get AI response
      const response = await this.chatService.sendChatCompletion(
        chatMessages,
        {
          model: 'gpt-4o-mini-2024-07-18',
          temperature: 0.2,
          maxTokens: 512,
          tools: tools
        }
      );

      const processedResponse = this.processOpenAIResponse(response);
      
      // Check if the response contains validation errors and convert to AI response
      if (processedResponse.response?.isError || !processedResponse.success) {
        // Extract validation details from error message and generate AI response
        const errorContent = processedResponse.response?.content || 'Validation failed';
        return await this.generateValidationErrorResponseFromMessage(
          userMessage,
          existingMessages,
          payees,
          categories,
          errorContent
        );
      }

      return processedResponse;
    } catch (error) {
      console.error('Error processing user message:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Detects the type of operation from user message
   */
  private detectOperationType(userMessage: string): 'payee' | 'category' | 'mixed' | 'general' {
    const lowerMessage = userMessage.toLowerCase();
    
    // Category operation keywords
    const categoryKeywords = [
      'category', 'categories', 'account', 'accounts', 'chart of accounts',
      'asset', 'liability', 'equity', 'revenue', 'expense', 'cogs',
      'bank account', 'credit card'
    ];
    
    // Payee operation keywords
    const payeeKeywords = ['payee', 'payees'];
    
    const hasCategoryKeywords = categoryKeywords.some(keyword => lowerMessage.includes(keyword));
    const hasPayeeKeywords = payeeKeywords.some(keyword => lowerMessage.includes(keyword));
    
    if (hasCategoryKeywords && hasPayeeKeywords) {
      return 'mixed';
    } else if (hasCategoryKeywords) {
      return 'category';
    } else if (hasPayeeKeywords) {
      return 'payee';
    } else {
      return 'general';
    }
  }

  /**
   * Executes a confirmed action and generates AI response
   */
  async executeAction(action: Record<string, unknown>): Promise<string> {
    try {
      // Handle text confirmations that were converted to actual actions
      if (action.action === 'text_confirmation') {
        return await this.generateActionResponseWithAI('Confirmed! Please try your request again with the specific action.', 'confirmation');
      }
      
      if (action.action === 'batch_execute') {
        const operations = action.operations as PayeeOperation[];
        const result = await this.payeeExecutor.executeBatchOperations(operations);
        return await this.generateActionResponseWithAI(
          this.formatBatchResult(result), 
          result.success ? 'batch_success' : 'batch_failure',
          { result, operations }
        );
      }

      // Single operation
      const operationName = action.action as string;
      
      // Determine if this is a payee or category operation
      if (operationName.includes('_payee')) {
        const result = await this.payeeExecutor.executePayeeOperation(
          operationName,
          action
        );

        return await this.generateActionResponseWithAI(
          this.formatOperationResult(result, operationName),
          result.success ? 'operation_success' : 'operation_failure',
          { result, operation: operationName, action }
        );
      } else if (operationName.includes('_category')) {
        const result = await this.categoryExecutor.executeCategoryOperation(
          operationName,
          action
        );

        return await this.generateActionResponseWithAI(
          this.formatOperationResult(result, operationName),
          result.success ? 'operation_success' : 'operation_failure',
          { result, operation: operationName, action }
        );
      } else {
        // Default to payee operation for backward compatibility
        const result = await this.payeeExecutor.executePayeeOperation(
          operationName,
          action
        );

        return await this.generateActionResponseWithAI(
          this.formatOperationResult(result, operationName),
          result.success ? 'operation_success' : 'operation_failure',
          { result, operation: operationName, action }
        );
      }
    } catch (error) {
      console.error('Error executing action:', error);
      return await this.generateActionResponseWithAI(
        `Failed to execute action: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'execution_error',
        { error }
      );
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

    // If there are validation errors, return them with error flag
    if (validationErrors.length > 0) {
      return {
        success: false,
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
        // Return validation error marker - will be handled by caller with AI response
        return {
          success: false,
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
      /press confirm/i,
      /confirm the action/i,
      /do you want to confirm/i,
      /do you want to continue/i,
      /would you like to proceed/i,
      /would you like to continue/i,
      /shall I proceed/i,
      /do you want to proceed/i,
      /do you want to/i,
      /proceed with those/i,
      /proceed with these/i,
      /proceed with that/i,
      /proceed with this/i,
      /would you like to/i,
      /would you like me to/i,
      /should I proceed/i,
      /continue with/i,
      /are you sure you want to/i,
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

  /**
   * Generates an AI response for special cases (vague prompts, validation errors, etc.)
   */
  private async generateAIResponse(
    userMessage: string,
    existingMessages: Message[],
    payees: Array<{ name: string }>,
    categories: Array<{ name: string; type: string; parent_id?: string | null }>,
    responseType: 'vague_prompt' | 'validation_error',
    validationDetails?: {
      operation: string;
      errors: string[];
      warnings: string[];
      suggestions: string[];
    }
  ): Promise<{
    success: boolean;
    response?: Message;
    error?: string;
  }> {
    try {
      // Prepare enhanced system prompt for different response types
      // For now, use payee prompt but we can enhance this later to support categories
      const systemPrompt = this.chatService.getEnhancedSystemPrompt(payees, responseType, validationDetails);
      
      // For special responses, include minimal context to avoid confusion
      const recentMessages = existingMessages.slice(-2);
      
      const chatMessages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        ...recentMessages.map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: userMessage }
      ];

      // Get AI response without tools for clarification/validation responses
      const response = await this.chatService.sendChatCompletion(
        chatMessages,
        {
          model: 'gpt-4o-mini-2024-07-18',
          temperature: 0.3,
          maxTokens: 256
          // No tools for clarification responses
        }
      );

      const aiMessage = response.choices?.[0]?.message?.content;
      if (!aiMessage) {
        throw new Error('No response content received from AI');
      }

      return {
        success: true,
        response: {
          role: 'assistant',
          content: aiMessage
        }
      };
    } catch (error) {
      console.error('Error generating AI response:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Generates an AI response for validation errors
   */
  private async generateValidationErrorResponse(
    userMessage: string,
    existingMessages: Message[],
    payees: Array<{ name: string }>,
    categories: Array<{ name: string; type: string; parent_id?: string | null }>,
    operation: string,
    validationDetails: {
      operation: string;
      errors: string[];
      warnings: string[];
      suggestions: string[];
    }
  ): Promise<{
    success: boolean;
    response?: Message;
    error?: string;
  }> {
    return await this.generateAIResponse(
      userMessage, 
      existingMessages, 
      payees, 
      categories,
      'validation_error', 
      validationDetails
    );
  }

  /**
   * Generates an AI response for validation errors from error messages
   */
  private async generateValidationErrorResponseFromMessage(
    userMessage: string,
    existingMessages: Message[],
    payees: Array<{ name: string }>,
    categories: Array<{ name: string; type: string; parent_id?: string | null }>,
    errorMessage: string
  ): Promise<{
    success: boolean;
    response?: Message;
    error?: string;
  }> {
    // Parse the error message to extract validation details
    const validationDetails = {
      operation: 'operation',
      errors: [errorMessage],
      warnings: [],
      suggestions: this.extractSuggestionsFromErrorMessage(errorMessage)
    };

    return await this.generateAIResponse(
      userMessage, 
      existingMessages, 
      payees, 
      categories,
      'validation_error', 
      validationDetails
    );
  }

  /**
   * Extracts suggestions from error messages
   */
  private extractSuggestionsFromErrorMessage(errorMessage: string): string[] {
    const suggestions: string[] = [];
    
    // Look for common patterns in error messages to provide helpful suggestions
    if (errorMessage.includes('already exists')) {
      suggestions.push('Try a different name or use the existing payee');
      suggestions.push('Add a qualifier like "Inc", "LLC", or "(New)" to make it unique');
    }
    
    if (errorMessage.includes('not found')) {
      suggestions.push('Check the spelling of the payee name');
      suggestions.push('Make sure the payee exists in your current list');
    }
    
    if (errorMessage.includes('name is required')) {
      suggestions.push('Please provide a complete payee name');
    }
    
    if (errorMessage.includes('name cannot be empty')) {
      suggestions.push('Please provide a non-empty payee name');
    }
    
    return suggestions.length > 0 ? suggestions : ['Please check your input and try again'];
  }

  /**
   * Generates AI response for action results
   */
  private async generateActionResponseWithAI(
    staticMessage: string,
    responseType: 'confirmation' | 'operation_success' | 'operation_failure' | 'batch_success' | 'batch_failure' | 'execution_error',
    context?: Record<string, unknown>
  ): Promise<string> {
    try {
      // Get current payees for context
      const payees = this.payeesStore.payees || [];

      // Create enhanced system prompt for action responses
      const systemPrompt = this.chatService.getActionResponsePrompt(payees, responseType, staticMessage, context);
      
      const chatMessages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'Generate a conversational response for this action result.' }
      ];

      // Get AI response
      const response = await this.chatService.sendChatCompletion(
        chatMessages,
        {
          model: 'gpt-4o-mini-2024-07-18',
          temperature: 0.4,
          maxTokens: 128
          // No tools for action responses
        }
      );

      const aiMessage = response.choices?.[0]?.message?.content?.trim();
      if (aiMessage) {
        return aiMessage;
      }
      
      // Fallback to static message if AI fails
      return staticMessage;
    } catch (error) {
      console.error('Error generating AI action response:', error);
      // Fallback to static message if AI fails
      return staticMessage;
    }
  }
}
