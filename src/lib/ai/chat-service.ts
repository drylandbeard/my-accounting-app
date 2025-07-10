import { ChatMessage, OpenAIResponse } from './types';

/**
 * AI Chat Service
 * Handles OpenAI API interactions with proper error handling and retries
 */
export class ChatService {
  private apiKey: string;
  private baseUrl: string;
  private maxRetries: number;
  private retryDelay: number;

  constructor(apiKey: string, options?: {
    baseUrl?: string;
    maxRetries?: number;
    retryDelay?: number;
  }) {
    this.apiKey = apiKey;
    this.baseUrl = options?.baseUrl || 'https://api.openai.com/v1';
    this.maxRetries = options?.maxRetries || 3;
    this.retryDelay = options?.retryDelay || 1000;
  }

  /**
   * Sends a chat completion request with retry logic
   */
  async sendChatCompletion(
    messages: ChatMessage[],
    options?: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      tools?: unknown[];
    }
  ): Promise<OpenAIResponse> {
    const requestBody = {
      model: options?.model || 'gpt-3.5-turbo',
      messages: messages,
      max_tokens: options?.maxTokens || 512,
      temperature: options?.temperature || 0.2,
      ...(options?.tools && { tools: options.tools })
    };

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const errorText = await response.text();
          const errorData = this.parseErrorResponse(errorText);
          
          // Don't retry on certain error types
          if (this.isNonRetryableError(response.status)) {
            throw new Error(`API Error (${response.status}): ${errorData.message}`);
          }

          // Retry on server errors
          if (attempt < this.maxRetries && response.status >= 500) {
            await this.delay(this.retryDelay * attempt);
            continue;
          }

          throw new Error(`API Error (${response.status}): ${errorData.message}`);
        }

        const data = await response.json();
        return this.validateResponse(data);

      } catch (error) {
        if (attempt === this.maxRetries) {
          throw new Error(`Chat completion failed after ${this.maxRetries} attempts: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }

        // Check if it's a network error worth retrying
        if (this.isRetryableError(error)) {
          await this.delay(this.retryDelay * attempt);
          continue;
        }

        // Non-retryable error, throw immediately
        throw error;
      }
    }

    throw new Error('Unexpected error in chat completion');
  }

  /**
   * Gets the system prompt for payee operations
   */
  getPayeeSystemPrompt(payees: Array<{ name: string }>): string {
    return `You are an AI assistant that helps users manage payees for bookkeeping.

CURRENT PAYEES:
${payees.map((p) => `- ${p.name}`).join('\n')}

IMPORTANT VALIDATION RULES:
1. Payee names must be unique within a company
2. Always validate that referenced payees actually exist before acting
3. Use fuzzy matching to find payees when exact names don't match
4. Provide intelligent suggestions when operations fail

AVAILABLE TOOLS:
- create_payee: Create new payees with duplicate detection
- update_payee: Update payee names with validation
- delete_payee: Delete payees with usage validation
- batch_execute: Execute multiple payee operations efficiently

PAYEE OPERATION GUIDELINES:
1. For CREATE_PAYEE: Check for exact matches and suggest similar existing payees if found
2. For UPDATE_PAYEE: Use fuzzy matching to find the intended payee when exact names don't match
3. For DELETE_PAYEE: Check if the payee is used in transactions and warn appropriately
4. When payee operations fail, provide helpful suggestions like alternative names or existing payees
5. For unclear payee names, suggest the closest matches from the existing payee list

ERROR HANDLING:
1. NEVER hallucinate payee names - always validate they exist first
2. When names don't exist, provide helpful suggestions with similar existing names
3. For vague requests, ask for specific names with context about available options
4. Always confirm destructive actions (deletes) and explain consequences
5. Use batch_execute for multiple related operations
6. Provide intelligent error messages that guide users toward successful actions
7. When duplicate names are detected, suggest variations or alternatives

RESPONSE STYLE:
- Be conversational and helpful, not robotic
- Explain what you're doing and why
- Offer alternatives when operations can't be completed
- Use fuzzy matching to understand user intent when exact names don't match
- Prioritize user success over strict rule enforcement

Respond concisely and only take action when confident about the existence of referenced items.`;
  }

  /**
   * Gets the tools definition for OpenAI function calling
   */
  getPayeeTools(): unknown[] {
    return [
      {
        type: 'function',
        function: {
          name: 'create_payee',
          description: 'Create a new payee with intelligent duplicate detection and suggestions. Handles similar name detection and provides helpful alternatives when duplicates exist.',
          parameters: {
            type: 'object',
            properties: {
              name: { 
                type: 'string', 
                description: 'The name of the new payee. Will check for duplicates and suggest alternatives if similar names exist.' 
              }
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
              payeeId: { 
                type: 'string', 
                description: 'The ID of the payee to update' 
              },
              payeeName: { 
                type: 'string', 
                description: 'The current name of the payee to update (supports fuzzy matching if exact name not found)' 
              },
              name: { 
                type: 'string', 
                description: 'The new name for the payee. Will validate uniqueness and suggest alternatives if conflicts exist.' 
              }
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
              payeeId: { 
                type: 'string', 
                description: 'The ID of the payee to delete' 
              },
              payeeName: { 
                type: 'string', 
                description: 'The name of the payee to delete (supports fuzzy matching if exact name not found)' 
              }
            },
            required: []
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'batch_execute',
          description: 'Execute multiple payee operations in a single batch with proper dependency ordering and rollback on failure.',
          parameters: {
            type: 'object',
            properties: {
              operations: { 
                type: 'array',
                description: 'List of payee operations to execute in sequence',
                items: {
                  type: 'object',
                  properties: {
                    action: { 
                      type: 'string',
                      description: 'The type of payee operation to perform',
                      enum: ['create_payee', 'update_payee', 'delete_payee']
                    },
                    params: {
                      type: 'object',
                      description: 'Parameters for the payee operation'
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
  }

  /**
   * Validates the OpenAI response
   */
  private validateResponse(data: unknown): OpenAIResponse {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid response format');
    }

    const response = data as OpenAIResponse;
    
    if (!response.choices || !Array.isArray(response.choices)) {
      throw new Error('Invalid response: missing choices array');
    }

    if (response.choices.length === 0) {
      throw new Error('Invalid response: empty choices array');
    }

    return response;
  }

  /**
   * Parses error response from OpenAI API
   */
  private parseErrorResponse(errorText: string): { message: string; code?: string } {
    try {
      const error = JSON.parse(errorText);
      return {
        message: error.error?.message || 'Unknown API error',
        code: error.error?.code
      };
    } catch {
      return { message: errorText || 'Unknown error' };
    }
  }

  /**
   * Determines if an error is retryable
   */
  private isRetryableError(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return (
        message.includes('network') ||
        message.includes('timeout') ||
        message.includes('connection') ||
        message.includes('fetch')
      );
    }
    return false;
  }

  /**
   * Determines if an HTTP status code is non-retryable
   */
  private isNonRetryableError(status: number): boolean {
    // Don't retry on client errors (4xx) except for specific cases
    return status >= 400 && status < 500 && status !== 429; // 429 is rate limit, should retry
  }

  /**
   * Delays execution for retry logic
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
