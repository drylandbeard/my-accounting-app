'use client';

import { useState, useEffect, useRef, useContext } from 'react';
import { XMarkIcon, ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline';
import { supabase } from '@/lib/supabaseClient';
import { useSelectedToAdd } from './SelectedToAddContext';
import { AIContext } from './AIContextProvider';
import { useApiWithCompany } from '@/hooks/useApiWithCompany';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  showConfirmation?: boolean;
  pendingAction?: any;
}

interface AISidePanelProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

const DEFAULT_PANEL_WIDTH = 400;
const MIN_PANEL_WIDTH = 300;
const MAX_PANEL_WIDTH = 800;
const SYSTEM_PROMPT = `You are an expert accounting assistant for a small business accounting app. You help users understand how to categorize transactions, use accounting categories, and manage their finances within the app. Answer questions about accounting best practices, transaction categorization, and how to use the app's features. If a user asks for legal or tax advice, remind them to consult a professional. Be concise, friendly, and clear in your responses. Keep replies short and to the point for easy back and forth.

When referring to transactions or categories, use their date, amount, description, and category name, not internal IDs. 

Available actions:
1. To categorize a transaction, respond with:
{"action": "categorize", "date": "4/9/2025", "amount": 10, "description": "Lunch", "categoryName": "Wages"}

2. To assign a category under a parent category, respond with:
{"action": "assign_parent_category", "categoryName": "Facebook Ads", "parentCategoryName": "Advertising"}

For assign_parent_category actions, you should ask for confirmation before executing. Say something like: "I will assign the category 'Facebook Ads' under 'Advertising'. Press Confirm to proceed."

Always explain your reasoning before or after the JSON, but make sure the JSON is on its own line.`;

export default function AISidePanel({ isOpen, setIsOpen }: AISidePanelProps) {
  const { postWithCompany } = useApiWithCompany();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [panelWidth, setPanelWidth] = useState(DEFAULT_PANEL_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const resizeRef = useRef<HTMLDivElement>(null);
  const { selectedToAdd } = useSelectedToAdd();
  const { transactions, categories, accounts, currentAccount } = useContext(AIContext);

  // Load saved panel width from localStorage
  useEffect(() => {
    const savedWidth = localStorage.getItem('aiPanelWidth');
    if (savedWidth) {
      setPanelWidth(parseInt(savedWidth, 10));
    }
  }, []);

  // Save panel width to localStorage
  useEffect(() => {
    localStorage.setItem('aiPanelWidth', panelWidth.toString());
  }, [panelWidth]);

  const handleResizeStart = (e: React.MouseEvent) => {
    setIsResizing(true);
    e.preventDefault();
    // Prevent text selection during resize
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'ew-resize';
  };

  const handleResizeMove = (e: MouseEvent) => {
    if (!isResizing) return;

    const newWidth = window.innerWidth - e.clientX;
    if (newWidth >= MIN_PANEL_WIDTH && newWidth <= MAX_PANEL_WIDTH) {
      setPanelWidth(newWidth);
    }
  };

  const handleResizeEnd = () => {
    setIsResizing(false);
    // Restore text selection and cursor
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  };

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', handleResizeMove);
      window.addEventListener('mouseup', handleResizeEnd);
    }
    return () => {
      window.removeEventListener('mousemove', handleResizeMove);
      window.removeEventListener('mouseup', handleResizeEnd);
    };
  }, [isResizing]);

  // Function to execute confirmed actions
  async function executeAction(action: { action: string; date?: string; amount?: number; description?: string; categoryName?: string; parentCategoryName?: string }): Promise<string> {
    if (action.action === 'categorize') {
      // Find the transaction and category by human-friendly fields
      const { date, amount, description, categoryName } = action;
      // Try to match transaction (allow for string/number for amount)
      const tx = transactions.find((t) =>
        t.date === date &&
        (t.amount === amount || t.spent === amount || t.received === amount || t.amount === Number(amount) || t.spent === Number(amount) || t.received === Number(amount)) &&
        (description ? t.description === description : true)
      );
      const category = categories.find((c) => c.name.toLowerCase() === categoryName?.toLowerCase());
      if (!tx) return `Could not find transaction with date ${date}, amount ${amount}${description ? ", description '" + description + "'" : ''}`;
      if (!category) return `Could not find category with name '${categoryName}'`;

      // Find the account for this transaction
      const account = accounts.find((a) => a.plaid_account_id === tx.plaid_account_id);
      if (!account) return `Could not find account for transaction`;
      // Find the account in chart_of_accounts
      const selectedAccount = categories.find((c) => c.plaid_account_id === tx.plaid_account_id);
      if (!selectedAccount) return `Could not find chart of account for transaction`;
      const selectedAccountIdInCOA = selectedAccount.id;

      // Insert into transactions
      await supabase.from('transactions').insert([{
        date: tx.date,
        description: tx.description,
        spent: tx.spent ?? 0,
        received: tx.received ?? 0,
        selected_category_id: category.id,
        corresponding_category_id: selectedAccountIdInCOA,
        plaid_account_id: tx.plaid_account_id,
        plaid_account_name: tx.plaid_account_name,
      }]);
      // Remove from imported_transactions
      await supabase.from('imported_transactions').delete().eq('id', tx.id);
      await postWithCompany('/api/sync-journal', {});
      // For now, reload the page to refresh context
      if (typeof window !== 'undefined') {
        setTimeout(() => window.location.reload(), 1000);
      }
      return `Transaction "${tx.description}" categorized as "${category.name}".`;
    }
    
    if (action.action === 'assign_parent_category') {
      return await assign_parent_category(action.categoryName!, action.parentCategoryName!);
    }
    
    return `Action executed: ${JSON.stringify(action)}`;
  }

  // Function to assign a category under a parent category
  async function assign_parent_category(categoryName: string, parentCategoryName: string): Promise<string> {
    // Find the category to be assigned
    const category = categories.find((c) => c.name.toLowerCase() === categoryName.toLowerCase());
    if (!category) {
      return `Could not find category with name '${categoryName}'. Available categories: ${categories.map(c => c.name).join(', ')}`;
    }

    // Find the parent category
    const parentCategory = categories.find((c) => c.name.toLowerCase() === parentCategoryName.toLowerCase());
    if (!parentCategory) {
      return `Could not find parent category with name '${parentCategoryName}'. Available categories: ${categories.map(c => c.name).join(', ')}`;
    }

    // Check if the category is already assigned to this parent
    if (category.parent_id === parentCategory.id) {
      return `Category '${categoryName}' is already assigned under '${parentCategoryName}'.`;
    }

    try {
      // Update the category with the new parent_id
      const { error } = await supabase
        .from('chart_of_accounts')
        .update({ parent_id: parentCategory.id })
        .eq('id', category.id);

      if (error) {
        console.error('Error updating category:', error);
        return `Error assigning category: ${error.message}`;
      }

      // Refresh the page to update the context
      if (typeof window !== 'undefined') {
        setTimeout(() => window.location.reload(), 1000);
      }

      return `Successfully assigned category '${categoryName}' under parent category '${parentCategoryName}'.`;
    } catch (error) {
      console.error('Error in assign_parent_category:', error);
      return `An error occurred while assigning the category.`;
    }
  }

  // Handle confirmation
  const handleConfirm = async (messageIndex: number) => {
    const message = messages[messageIndex];
    if (message.pendingAction) {
      // Execute the action
      const result = await executeAction(message.pendingAction);
      
      // Update the message to show the result
      setMessages(prev => prev.map((msg, idx) => 
        idx === messageIndex 
          ? { ...msg, content: msg.content + `\n\n✅ **Confirmed and executed:** ${result}`, showConfirmation: false, pendingAction: undefined }
          : msg
      ));
    }
  };

  // Handle cancellation
  const handleCancel = (messageIndex: number) => {
    setMessages(prev => prev.map((msg, idx) => 
      idx === messageIndex 
        ? { ...msg, content: msg.content + '\n\n❌ **Cancelled:** Action was not executed.', showConfirmation: false, pendingAction: undefined }
        : msg
    ));
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim()) return;
    const newMessage: Message = {
      role: 'user',
      content: inputMessage,
    };
    setMessages((prev) => [...prev, newMessage]);
    setInputMessage('');

    // Prepare context for the AI
    const contextMessages: { role: string; content: string }[] = [];
    
    // Add current account context
    if (currentAccount) {
      contextMessages.push({
        role: 'system',
        content: `Current account: ${currentAccount.plaid_account_name} (Balance: $${currentAccount.current_balance?.toFixed(2) || '0.00'})`
      });
    }

    // Add selected transactions context
    if (selectedToAdd.size === 1) {
      const selectedId = Array.from(selectedToAdd)[0];
      const tx = transactions.find(t => t.id === selectedId);
      if (tx) {
        contextMessages.push({
          role: 'system',
          content: `Selected transaction: Description: ${tx.description}, Amount: $${tx.amount ?? tx.spent ?? tx.received}, Date: ${tx.date}.`
        });
      }
    } else if (selectedToAdd.size > 1) {
      contextMessages.push({
        role: 'system',
        content: `${selectedToAdd.size} transactions are currently selected.`
      });
    }

    // Add available categories context
    contextMessages.push({
      role: 'system',
      content: `Available categories: ${categories.map(c => c.name).join(', ')}`
    });

    const openAIMessages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...contextMessages,
      ...[...messages, newMessage].map(m => ({ role: m.role, content: m.content }))
    ];

    setMessages((prev) => [
      ...prev,
      { role: 'assistant', content: 'Thinking...' },
    ]);

    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_GROQ_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: openAIMessages,
          max_tokens: 256,
          temperature: 0.2,
        }),
      });
      const data = await res.json();
      let aiResponse = data.choices?.[0]?.message?.content?.trim() || 'Sorry, I could not generate a response.';

      // Check for JSON action in the response
      const actionMatch = aiResponse.match(/\{[^}]+\}/);
      let pendingAction = null;
      let showConfirmation = false;

      if (actionMatch) {
        try {
          const action = JSON.parse(actionMatch[0]);
          
          // For assign_parent_category, show confirmation instead of executing immediately
          if (action.action === 'assign_parent_category') {
            pendingAction = action;
            showConfirmation = true;
            // Don't execute the action yet, just prepare for confirmation
          } else {
            // For other actions (like categorize), execute immediately
            const result = await executeAction(action);
            aiResponse += `\n\n${result}`;
          }
        } catch {
          aiResponse += '\n\n[Error parsing action JSON]';
        }
      }

      setMessages((prev) => [
        ...prev.slice(0, -1), // remove 'Thinking...'
        { 
          role: 'assistant', 
          content: aiResponse,
          showConfirmation,
          pendingAction
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev.slice(0, -1),
        { role: 'assistant', content: 'Sorry, there was an error contacting the AI.' },
      ]);
    }
  };

  // Panel open/close transition - disable transition during resize for smoother experience
  const panelStyle = {
    width: isOpen ? panelWidth : 0,
    transition: isResizing ? 'none' : 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    minWidth: isOpen ? MIN_PANEL_WIDTH : 0,
    maxWidth: MAX_PANEL_WIDTH,
    overflow: 'hidden',
    boxShadow: isOpen ? 'rgba(0,0,0,0.1) 0px 0px 16px' : 'none',
    background: 'white',
    height: '100%',
    display: 'flex',
    flexDirection: 'column' as const,
    borderLeft: isOpen ? '1px solid #e5e7eb' : 'none',
    position: 'relative' as const,
  };

  // If closed, render floating button
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed right-4 bottom-4 p-3 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 transition-colors z-40"
      >
        <ChatBubbleLeftRightIcon className="h-6 w-6" />
      </button>
    );
  }

  // If open, render integrated panel
  return (
    <div 
      style={panelStyle}
      className={isResizing ? 'select-none' : ''}
    >
      <div className="flex h-full flex-col bg-white shadow-xl text-xs">
        <div className="px-4 py-6 sm:px-6">
          <div className="flex items-start justify-between">
            <div className="font-semibold leading-6 text-gray-900 text-xs">
              AI Assistant
            </div>
            <div className="ml-3 flex h-7 items-center">
              <button
                type="button"
                className="rounded-md bg-white text-gray-400 hover:text-gray-500"
                onClick={() => setIsOpen(false)}
              >
                <span className="sr-only">Close panel</span>
                <XMarkIcon className="h-6 w-6" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 text-xs">
          <div className="space-y-4">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex ${
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                <div
                  className={`rounded-lg px-4 py-2 max-w-[80%] ${
                    message.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-900'
                  } text-xs`}
                >
                  <div className="whitespace-pre-line">{message.content}</div>
                  
                  {/* Confirmation buttons */}
                  {message.showConfirmation && message.pendingAction && (
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => handleConfirm(index)}
                        className="px-3 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => handleCancel(index)}
                        className="px-3 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-gray-200 px-4 py-6 sm:px-6 text-xs">
          <div className="flex space-x-3">
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder="Type your message..."
              className="flex-1 rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs"
            />
            <button
              onClick={handleSendMessage}
              className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 text-xs"
            >
              Send
            </button>
          </div>
        </div>
      </div>
      
      {/* Enhanced resize handle */}
      <div
        ref={resizeRef}
        className={`absolute left-0 top-0 h-full w-0.5 cursor-ew-resize group ${
          isResizing ? 'bg-gray-500' : 'bg-gray-200 hover:bg-gray-400'
        } transition-colors duration-200`}
        onMouseDown={handleResizeStart}
        title="Drag to resize panel"
      >
      </div>
      
      {/* Overlay during resize to prevent interference */}
      {isResizing && (
        <div className="fixed inset-0 z-50 cursor-ew-resize" style={{ background: 'transparent' }} />
      )}
    </div>
  );
} 