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
      model: options?.model || 'gpt-4o-mini-2024-07-18',
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
    console.log(`🤖 AI System prompt using ${payees.length} current payees:`, payees.map(p => p.name));
    
    return `You are an AI assistant that helps users manage payees for bookkeeping.

CURRENT PAYEES IN DATABASE (SINGLE SOURCE OF TRUTH):
Total count: ${payees.length} payees
${payees.length > 0 ? payees.map((p) => `- ${p.name}`).join('\n') : '(No payees exist yet)'}

CRITICAL VALIDATION RULES:
1. **COMPLETELY IGNORE CHAT HISTORY** - Previous messages about deletions/creations are irrelevant
2. **THE ABOVE LIST IS THE ONLY TRUTH** - This shows the ACTUAL database state RIGHT NOW (${payees.length} total payees)
3. If a payee appears in this list above, it EXISTS and can be updated/deleted
4. If a payee does not appear in this list above, it DOES NOT EXIST and cannot be operated on
5. **IGNORE ALL PREVIOUS STATEMENTS** about payees existing or not existing
6. **ONLY CHECK THE CURRENT LIST ABOVE** - Previous operations in chat are irrelevant
7. Use fuzzy matching to find payees when exact names don't match

REFRESH CONTEXT: The database has been refreshed. Any previous statements about payee existence are now obsolete. Only use the current list above.

AVAILABLE TOOLS:
- create_payee: Create new payees with duplicate detection
- update_payee: Update payee names with validation  
- delete_payee: Delete payees with usage validation
- batch_execute: Execute multiple payee operations efficiently

OPERATION GUIDELINES:
1. For CREATE_PAYEE: Check if name exists in CURRENT PAYEES list above
2. For UPDATE_PAYEE: Find target payee in CURRENT PAYEES list above using fuzzy matching
3. For DELETE_PAYEE: Verify payee exists in CURRENT PAYEES list above before attempting deletion
4. When operations fail, provide suggestions based on CURRENT PAYEES list above

REMEMBER: Chat history is unreliable and outdated. Only trust the CURRENT PAYEES list above.

FINAL OVERRIDE: If there is ANY conflict between chat history and the current payees list above, ALWAYS trust the current payees list. The list above is the absolute truth.`;
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
