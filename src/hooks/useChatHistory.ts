import { useState, useEffect, useCallback } from 'react';
import { Message } from '@/lib/ai/types';
import { 
  loadChatHistory, 
  saveChatState, 
  clearChatSession 
} from '@/lib/ai/chat-actions';

// Database message type with snake_case field names
interface DatabaseMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  has_confirmation: boolean;
  pending_action: unknown;
  is_error: boolean;
  error_details: string | null;
  created_at: string;
  message_order: number;
}

/**
 * Custom hook for managing AI chat history
 * Handles real-time synchronization between localStorage and database
 */
export function useChatHistory(companyId: string | null, userId: string | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  /**
   * Loads chat history from localStorage
   */
  const loadFromLocalStorage = useCallback(() => {
    try {
      const saved = localStorage.getItem('aiChatMessages');
      if (saved) {
        const parsedMessages = JSON.parse(saved) as Message[];
        setMessages(parsedMessages);
      } else {
        // Initialize with welcome message
        const welcomeMessage = {
          role: 'assistant' as const,
          content: 'How can I help?'
        };
        setMessages([welcomeMessage]);
        localStorage.setItem('aiChatMessages', JSON.stringify([welcomeMessage]));
      }
    } catch (error) {
      console.error('Error loading from localStorage:', error);
      localStorage.removeItem('aiChatMessages');
      const welcomeMessage = {
        role: 'assistant' as const,
        content: 'How can I help?'
      };
      setMessages([welcomeMessage]);
      localStorage.setItem('aiChatMessages', JSON.stringify([welcomeMessage]));
    }
  }, []);

  /**
   * Saves chat history to localStorage immediately
   */
  const saveToLocalStorage = useCallback((messagesToSave: Message[]) => {
    try {
      localStorage.setItem('aiChatMessages', JSON.stringify(messagesToSave));
    } catch (error) {
      console.error('Error saving to localStorage:', error);
    }
  }, []);

  /**
   * Loads chat history from database
   */
  const loadFromDatabase = useCallback(async () => {
    if (!companyId || !userId) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await loadChatHistory(companyId, userId);
      
      if (result.success && result.data) {
        const { session, messages: dbMessages } = result.data as {
          session: { id: string };
          messages: DatabaseMessage[];
        };
        
        setSessionId(session.id);
        
        if (dbMessages.length > 0) {
          // Convert database messages to component format and sort by message_order
          const formattedMessages: Message[] = dbMessages
            .map((msg: DatabaseMessage) => ({
              id: msg.id,
              role: msg.role,
              content: msg.content,
              showConfirmation: msg.has_confirmation,
              pendingAction: msg.pending_action as Message['pendingAction'],
              isError: msg.is_error,
              errorDetails: msg.error_details || undefined,
              createdAt: new Date(msg.created_at),
              messageOrder: msg.message_order
            }))
            .sort((a, b) => (a.messageOrder || 0) - (b.messageOrder || 0));
          
          setMessages(formattedMessages);
          // Sync to localStorage immediately
          saveToLocalStorage(formattedMessages);
        } else {
          // Initialize with welcome message
          const welcomeMessage = {
            role: 'assistant' as const,
            content: 'How can I help?'
          };
          setMessages([welcomeMessage]);
          saveToLocalStorage([welcomeMessage]);
        }
      } else {
        throw new Error(result.error || 'Failed to load chat history');
      }
    } catch (err) {
      console.error('Error loading chat history:', err);
      setError(err instanceof Error ? err.message : 'Failed to load chat history');
      
      // Fallback to localStorage
      loadFromLocalStorage();
    } finally {
      setIsLoading(false);
    }
  }, [companyId, userId, loadFromLocalStorage, saveToLocalStorage]);

  /**
   * Saves chat history to database
   */
  const saveToDatabase = useCallback(async (messagesToSave: Message[]) => {
    if (!companyId || !userId || messagesToSave.length === 0) return;

    try {
      await saveChatState(companyId, userId, messagesToSave);
    } catch (error) {
      console.error('Error saving chat state:', error);
      // Fallback to localStorage
      saveToLocalStorage(messagesToSave);
    }
  }, [companyId, userId, saveToLocalStorage]);

  // Load initial messages
  useEffect(() => {
    if (!companyId || !userId) {
      // No company/user context, load from localStorage
      loadFromLocalStorage();
      return;
    }

    loadFromDatabase();
  }, [companyId, userId, loadFromDatabase, loadFromLocalStorage]);

  // Save messages to both localStorage and database immediately when they change
  useEffect(() => {
    if (messages.length === 0) return;
    
    // Save to localStorage immediately for instant sync
    saveToLocalStorage(messages);
    
    // Save to database with debounce
    const saveTimer = setTimeout(() => {
      if (companyId && userId) {
        saveToDatabase(messages);
      }
    }, 1000); // Debounce database saves

    return () => clearTimeout(saveTimer);
  }, [messages, companyId, userId, saveToDatabase, saveToLocalStorage]);

  // Log chat history to console for debugging
  useEffect(() => {
    console.log('chat_history:', messages);
  }, [messages]);

  /**
   * Adds a new message to the chat
   */
  const addMessage = useCallback((message: Message) => {
    // Log user inputs and AI responses with confirmation details
    if (message.role === 'user' || message.role === 'assistant') {
      console.log('chat:', { 
        role: message.role, 
        content: message.content,
        showConfirmation: message.showConfirmation,
        pendingAction: message.pendingAction
      });
    }
    
    setMessages(prev => [...prev, message]);
  }, []);

  /**
   * Updates a message at a specific index
   */
  const updateMessage = useCallback((index: number, updates: Partial<Message>) => {
    setMessages(prev => prev.map((msg, i) => 
      i === index ? { ...msg, ...updates } : msg
    ));
  }, []);

  /**
   * Clears all chat messages
   */
  const clearMessages = useCallback(async () => {
    if (companyId && userId && sessionId) {
      // Clear from database
      try {
        await clearChatSession(sessionId);
      } catch (error) {
        console.error('Error clearing chat session:', error);
      }
    } else {
      // Clear from localStorage
      localStorage.removeItem('aiChatMessages');
    }

    // Reset to welcome message
    const welcomeMessage = {
      role: 'assistant' as const,
      content: 'How can I help?'
    };
    setMessages([welcomeMessage]);
    saveToLocalStorage([welcomeMessage]);
  }, [companyId, userId, sessionId, saveToLocalStorage]);

  /**
   * Forces a refresh from the database
   */
  const refreshFromDatabase = useCallback(async () => {
    if (companyId && userId) {
      await loadFromDatabase();
    }
  }, [companyId, userId, loadFromDatabase]);

  return {
    messages,
    isLoading,
    error,
    sessionId,
    addMessage,
    updateMessage,
    clearMessages,
    refreshFromDatabase,
    setMessages
  };
}
