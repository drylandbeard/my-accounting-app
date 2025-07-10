import { 
  Message, 
  OperationResult, 
  BatchOperationResult,
  PayeeOperation,
  ChatMessage,
  OpenAIResponse 
} from './types';
import { PayeeExecutor } from './payee-executor';
import { ChatService } from './chat-service';

/**
 * Main AI handler that coordinates all AI operations
 * Provides a unified interface for the AISidePanel component
 */
export class AIHandler {
  private payeeExecutor: PayeeExecutor;
  private chatService: ChatService;

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
          model: 'gpt-3.5-turbo',
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

    toolCalls.forEach((toolCall, index) => {
      const functionName = toolCall.function?.name;
      const args = JSON.parse(toolCall.function?.arguments || '{}');

      switch (functionName) {
        case 'create_payee':
          confirmationMessage += `${index + 1}. Create payee "${args.name}"\n`;
          operations.push({ action: 'create_payee', params: args });
          break;
        case 'update_payee':
          confirmationMessage += `${index + 1}. Update payee "${args.payeeName || args.payeeId}" to "${args.name}"\n`;
          operations.push({ action: 'update_payee', params: args });
          break;
        case 'delete_payee':
          confirmationMessage += `${index + 1}. Delete payee "${args.payeeName || args.payeeId}"\n`;
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

    let confirmationMessage = '';
    let pendingAction: Record<string, unknown> = { action: functionName, ...args };

    switch (functionName) {
      case 'create_payee':
        confirmationMessage = `I'll create a new payee named "${args.name}". Would you like to proceed?`;
        break;
      case 'update_payee':
        confirmationMessage = `I'll update the payee "${args.payeeName || args.payeeId}" to "${args.name}". Would you like to proceed?`;
        break;
      case 'delete_payee':
        confirmationMessage = `I'll delete the payee "${args.payeeName || args.payeeId}". Would you like to proceed?`;
        break;
      case 'batch_execute':
        const operations = args.operations || [];
        let batchMessage = "I'll perform the following operations:\n\n";
        
        operations.forEach((op: PayeeOperation, index: number) => {
          const params = op.params;
          
          switch (op.action) {
            case 'create_payee':
              batchMessage += `${index + 1}. Create payee "${params.name || 'Unknown Payee'}"\n`;
              break;
            case 'update_payee':
              batchMessage += `${index + 1}. Update payee "${params.payeeName || params.payeeId || 'Unknown Payee'}" to "${params.name || 'Unknown Name'}"\n`;
              break;
            case 'delete_payee':
              batchMessage += `${index + 1}. Delete payee "${params.payeeName || params.payeeId || 'Unknown Payee'}"\n`;
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
      return PayeeExecutor.getSuccessMessage(
        operationName,
        result.data as Record<string, unknown> || {}
      );
    } else {
      return PayeeExecutor.getErrorMessage(result);
    }
  }

  /**
   * Formats batch operation result for user display
   */
  private formatBatchResult(result: BatchOperationResult): string {
    if (result.success) {
      return `✅ Successfully completed all ${result.completedOperations} operations!`;
    } else {
      let message = `❌ Batch operation failed: ${result.message}`;
      
      if (result.completedOperations > 0) {
        message += `\n\n✅ Completed: ${result.completedOperations} operations`;
      }
      
      if (result.failedAt !== undefined) {
        message += `\n❌ Failed at operation ${result.failedAt + 1}`;
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
}
