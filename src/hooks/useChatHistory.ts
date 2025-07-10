import { useState, useEffect, useCallback } from 'react';
import { Message } from '@/lib/ai/types';
import { 
  loadChatHistory, 
  saveChatState, 
  clearChatSession 
} from '@/lib/ai/chat-actions';

/**
 * Custom hook for managing AI chat history
 * Handles localStorage fallback and database persistence
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
        setMessages([{
          role: 'assistant',
          content: 'How can I help?'
        }]);
      }
    } catch (error) {
      console.error('Error loading from localStorage:', error);
      localStorage.removeItem('aiChatMessages');
      setMessages([{
        role: 'assistant',
        content: 'How can I help?'
      }]);
    }
  }, []);

  /**
   * Saves chat history to localStorage
   */
  const saveToLocalStorage = useCallback(() => {
    try {
      localStorage.setItem('aiChatMessages', JSON.stringify(messages));
    } catch (error) {
      console.error('Error saving to localStorage:', error);
    }
  }, [messages]);

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
          messages: Message[];
        };
        
        setSessionId(session.id);
        
        if (dbMessages.length > 0) {
          // Convert database messages to component format
          const formattedMessages = dbMessages.map(msg => ({
            id: msg.id,
            role: msg.role,
            content: msg.content,
            showConfirmation: msg.showConfirmation,
            pendingAction: msg.pendingAction,
            isError: msg.isError,
            errorDetails: msg.errorDetails,
            createdAt: msg.createdAt,
            messageOrder: msg.messageOrder
          }));
          setMessages(formattedMessages);
        } else {
          // Initialize with welcome message
          setMessages([{
            role: 'assistant',
            content: 'How can I help?'
          }]);
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
  }, [companyId, userId, loadFromLocalStorage]);

  /**
   * Saves chat history to database
   */
  const saveToDatabase = useCallback(async () => {
    if (!companyId || !userId || messages.length === 0) return;

    try {
      await saveChatState(companyId, userId, messages);
    } catch (error) {
      console.error('Error saving chat state:', error);
      // Fallback to localStorage
      saveToLocalStorage();
    }
  }, [companyId, userId, messages, saveToLocalStorage]);

  // Load initial messages
  useEffect(() => {
    if (!companyId || !userId) {
      // No company/user context, load from localStorage
      loadFromLocalStorage();
      return;
    }

    loadFromDatabase();
  }, [companyId, userId, loadFromDatabase, loadFromLocalStorage]);

  // Save messages to database when they change
  useEffect(() => {
    if (messages.length === 0) return;
    
    const saveTimer = setTimeout(() => {
      if (companyId && userId) {
        saveToDatabase();
      } else {
        saveToLocalStorage();
      }
    }, 1000); // Debounce saves

    return () => clearTimeout(saveTimer);
  }, [messages, companyId, userId, saveToDatabase, saveToLocalStorage]);

  /**
   * Adds a new message to the chat
   */
  const addMessage = useCallback((message: Message) => {
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
    setMessages([{
      role: 'assistant',
      content: 'How can I help?'
    }]);
  }, [companyId, userId, sessionId]);

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
