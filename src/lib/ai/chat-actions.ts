'use server';

import { supabase } from '@/lib/supabase';
import { Message, ChatSession } from '@/lib/ai/types';

/**
 * Server actions for AI chat history management
 */

export interface ChatHistoryResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

/**
 * Creates a new chat session for the user
 */
export async function createChatSession(
  companyId: string,
  userId: string,
  title?: string
): Promise<ChatHistoryResult> {
  try {
    // Deactivate all existing sessions for this user/company
    await supabase
      .from('ai_chat_sessions')
      .update({ is_active: false })
      .eq('company_id', companyId)
      .eq('user_id', userId);

    // Create new session
    const { data, error } = await supabase
      .from('ai_chat_sessions')
      .insert({
        company_id: companyId,
        user_id: userId,
        title: title || 'New Chat',
        is_active: true
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating chat session:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (error) {
    console.error('Error in createChatSession:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Gets the active chat session for the user
 */
export async function getActiveChatSession(
  companyId: string,
  userId: string
): Promise<ChatHistoryResult> {
  try {
    const { data, error } = await supabase
      .from('ai_chat_sessions')
      .select('*')
      .eq('company_id', companyId)
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Error getting active chat session:', error);
      return { success: false, error: error.message };
    }

    // If no active session exists, create one
    if (!data) {
      return await createChatSession(companyId, userId);
    }

    return { success: true, data };
  } catch (error) {
    console.error('Error in getActiveChatSession:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Gets all messages for a chat session
 */
export async function getChatMessages(sessionId: string): Promise<ChatHistoryResult> {
  try {
    const { data, error } = await supabase
      .from('ai_chat_messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('message_order', { ascending: true });

    if (error) {
      console.error('Error getting chat messages:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (error) {
    console.error('Error in getChatMessages:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Adds a message to a chat session
 */
export async function addChatMessage(
  sessionId: string,
  role: 'user' | 'assistant' | 'system',
  content: string,
  options?: {
    hasConfirmation?: boolean;
    pendingAction?: unknown;
    isError?: boolean;
    errorDetails?: string;
    metadata?: Record<string, unknown>;
    messageOrder?: number;
  }
): Promise<ChatHistoryResult> {
  try {
    // Get the next message order if not provided
    let messageOrder = options?.messageOrder;
    if (messageOrder === undefined) {
      const { data: maxOrderResult } = await supabase
        .from('ai_chat_messages')
        .select('message_order')
        .eq('session_id', sessionId)
        .order('message_order', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      messageOrder = (maxOrderResult?.message_order || 0) + 1;
    }

    const { data, error } = await supabase
      .from('ai_chat_messages')
      .insert({
        session_id: sessionId,
        role,
        content,
        has_confirmation: options?.hasConfirmation || false,
        pending_action: options?.pendingAction || null,
        is_error: options?.isError || false,
        error_details: options?.errorDetails || null,
        metadata: options?.metadata || {},
        message_order: messageOrder
      })
      .select()
      .single();

    if (error) {
      console.error('Error adding chat message:', error);
      return { success: false, error: error.message };
    }

    // Update session timestamp
    await supabase
      .from('ai_chat_sessions')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', sessionId);

    return { success: true, data };
  } catch (error) {
    console.error('Error in addChatMessage:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Updates a message in a chat session
 */
export async function updateChatMessage(
  messageId: string,
  updates: {
    content?: string;
    hasConfirmation?: boolean;
    pendingAction?: unknown;
    isError?: boolean;
    errorDetails?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<ChatHistoryResult> {
  try {
    const updateData: Record<string, unknown> = {};
    
    if (updates.content !== undefined) updateData.content = updates.content;
    if (updates.hasConfirmation !== undefined) updateData.has_confirmation = updates.hasConfirmation;
    if (updates.pendingAction !== undefined) updateData.pending_action = updates.pendingAction;
    if (updates.isError !== undefined) updateData.is_error = updates.isError;
    if (updates.errorDetails !== undefined) updateData.error_details = updates.errorDetails;
    if (updates.metadata !== undefined) updateData.metadata = updates.metadata;

    const { data, error } = await supabase
      .from('ai_chat_messages')
      .update(updateData)
      .eq('id', messageId)
      .select()
      .single();

    if (error) {
      console.error('Error updating chat message:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (error) {
    console.error('Error in updateChatMessage:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Clears all messages from a chat session
 */
export async function clearChatSession(sessionId: string): Promise<ChatHistoryResult> {
  try {
    // Delete all messages for this session
    const { error } = await supabase
      .from('ai_chat_messages')
      .delete()
      .eq('session_id', sessionId);

    if (error) {
      console.error('Error clearing chat session:', error);
      return { success: false, error: error.message };
    }

    // Update session timestamp
    await supabase
      .from('ai_chat_sessions')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', sessionId);

    return { success: true };
  } catch (error) {
    console.error('Error in clearChatSession:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Deletes a chat session and all its messages
 */
export async function deleteChatSession(sessionId: string): Promise<ChatHistoryResult> {
  try {
    // Delete the session (messages will be deleted by cascade)
    const { error } = await supabase
      .from('ai_chat_sessions')
      .delete()
      .eq('id', sessionId);

    if (error) {
      console.error('Error deleting chat session:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Error in deleteChatSession:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Gets all chat sessions for a user in a company
 */
export async function getChatSessions(
  companyId: string,
  userId: string
): Promise<ChatHistoryResult> {
  try {
    const { data, error } = await supabase
      .from('ai_chat_sessions')
      .select('*')
      .eq('company_id', companyId)
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Error getting chat sessions:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (error) {
    console.error('Error in getChatSessions:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Loads chat history for the current user and company
 */
export async function loadChatHistory(
  companyId: string,
  userId: string
): Promise<ChatHistoryResult> {
  try {
    // Get active session
    const sessionResult = await getActiveChatSession(companyId, userId);
    if (!sessionResult.success) {
      return sessionResult;
    }

    const session = sessionResult.data as ChatSession;
    
    // Get messages for the session
    const messagesResult = await getChatMessages(session.id);
    if (!messagesResult.success) {
      return messagesResult;
    }

    const messages = messagesResult.data as Message[];

    return {
      success: true,
      data: {
        session,
        messages
      }
    };
  } catch (error) {
    console.error('Error in loadChatHistory:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Saves the current chat state
 */
export async function saveChatState(
  companyId: string,
  userId: string,
  messages: Message[]
): Promise<ChatHistoryResult> {
  try {
    // Get or create active session
    const sessionResult = await getActiveChatSession(companyId, userId);
    if (!sessionResult.success) {
      return sessionResult;
    }

    const session = sessionResult.data as ChatSession;
    
    // Clear existing messages
    await clearChatSession(session.id);

    // Add all messages with proper ordering
    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      await addChatMessage(
        session.id,
        message.role,
        message.content,
        {
          hasConfirmation: message.showConfirmation,
          pendingAction: message.pendingAction,
          isError: message.isError,
          errorDetails: message.errorDetails,
          metadata: {},
          messageOrder: i + 1 // Ensure proper ordering starting from 1
        }
      );
    }

    return { success: true };
  } catch (error) {
    console.error('Error in saveChatState:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}
