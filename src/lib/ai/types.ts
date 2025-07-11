// AI Chat Types
export interface Message {
  id?: string;
  role: "user" | "assistant" | "system";
  content: string;
  showConfirmation?: boolean;
  pendingAction?: PendingAction;
  isError?: boolean;
  errorDetails?: string;
  createdAt?: Date;
  messageOrder?: number;
}

export interface PendingAction {
  action: string;
  [key: string]: unknown;
}

export interface ChatSession {
  id: string;
  companyId: string;
  userId: string;
  title?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Payee operation types
export interface PayeeOperation {
  action: 'create_payee' | 'update_payee' | 'delete_payee';
  params: PayeeOperationParams;
}

export interface PayeeOperationParams {
  name?: string;
  payeeId?: string;
  payeeName?: string;
  [key: string]: unknown;
}

export interface BatchOperation {
  action: 'batch_execute';
  operations: PayeeOperation[];
}

// Operation results
export interface OperationResult {
  success: boolean;
  message: string;
  data?: unknown;
  error?: string;
  suggestions?: string[];
}

export interface BatchOperationResult {
  success: boolean;
  message: string;
  results: OperationResult[];
  completedOperations: number;
  failedAt?: number;
}

// Validation types
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
}

export interface PayeeValidationContext {
  existingPayees: Array<{ id: string; name: string }>;
  targetName?: string;
  targetId?: string;
  operation: 'create' | 'update' | 'delete';
}

// AI Panel props
export interface AISidePanelProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

// Chat service types
export interface ChatMessage {
  role: string;
  content: string;
}

export interface OpenAIResponse {
  choices: Array<{
    message: {
      content?: string;
      tool_calls?: Array<{
        function: {
          name: string;
          arguments: string;
        };
      }>;
    };
  }>;
}

// Error types
export interface AIError {
  type: 'validation' | 'execution' | 'network' | 'permission' | 'unknown';
  message: string;
  details?: string;
  suggestions?: string[];
  recoverable: boolean;
}

export interface PayeeError extends AIError {
  payeeName?: string;
  payeeId?: string;
  conflictingPayees?: string[];
}
