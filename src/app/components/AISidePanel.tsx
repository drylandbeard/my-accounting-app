'use client';

import { Fragment, useState, useEffect, useRef, useContext } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon, ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline';
import { supabase } from '@/lib/supabaseClient';
import { useSelectedToAdd } from './SelectedToAddContext';
import { AIContext } from './AIContextProvider';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface Transaction {
  id: string;
  date: string;
  description: string;
  amount?: number;
  spent?: number;
  received?: number;
  category?: string;
  selected_category_id?: string;
  plaid_account_id?: string;
  plaid_account_name?: string;
}

interface Category {
  id: string;
  name: string;
  type: string;
  subtype?: string;
  plaid_account_id?: string | null;
}

interface Account {
  plaid_account_id: string | null;
  plaid_account_name: string;
  starting_balance: number | null;
  current_balance: number | null;
  last_synced: string | null;
  is_manual?: boolean;
}

const DEFAULT_PANEL_WIDTH = 400;
const MIN_PANEL_WIDTH = 300;
const MAX_PANEL_WIDTH = 800;

const OPENAI_API_KEY = process.env.NEXT_PUBLIC_OPENAI_API_KEY;
const SYSTEM_PROMPT = `You are an expert accounting assistant for a small business accounting app. You help users understand how to categorize transactions, use accounting categories, and manage their finances within the app. Answer questions about accounting best practices, transaction categorization, and how to use the app's features. If a user asks for legal or tax advice, remind them to consult a professional. Be concise, friendly, and clear in your responses. Keep replies short and to the point for easy back and forth.

When referring to transactions or categories, use their date, amount, description, and category name, not internal IDs. For example, to categorize a transaction, respond with:
{"action": "categorize", "date": "4/9/2025", "amount": 10, "description": "Lunch", "categoryName": "Wages"}

Always explain your reasoning before or after the JSON, but make sure the JSON is on its own line.`;

async function getCategorySuggestion(tx: Transaction): Promise<string | null> {
  if (!OPENAI_API_KEY) return null;
  const prompt = `Given the following transaction details, suggest the most appropriate category. Only return the category name.\n\nDescription: ${tx.description}\nAmount: $${tx.amount ?? tx.spent ?? tx.received}\nDate: ${tx.date}`;
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: 'You are a helpful assistant that categorizes financial transactions.' },
        { role: 'user', content: prompt },
      ],
      max_tokens: 20,
      temperature: 0.2,
    }),
  });
  const data = await res.json();
  const suggestion = data.choices?.[0]?.message?.content?.trim();
  return suggestion || null;
}

export default function AISidePanel() {
  const [isOpen, setIsOpen] = useState(false);
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

  // Add the action handler here so it can access context
  async function handleAIAction(action: any): Promise<string> {
    if (action.action === 'categorize') {
      // Find the transaction and category by human-friendly fields
      const { date, amount, description, categoryName } = action;
      // Try to match transaction (allow for string/number for amount)
      const tx = transactions.find((t: any) =>
        t.date === date &&
        (t.amount === amount || t.spent === amount || t.received === amount || t.amount === Number(amount) || t.spent === Number(amount) || t.received === Number(amount)) &&
        (description ? t.description === description : true)
      );
      const category = categories.find((c: any) => c.name.toLowerCase() === categoryName.toLowerCase());
      if (!tx) return `Could not find transaction with date ${date}, amount ${amount}${description ? ", description '" + description + "'" : ''}`;
      if (!category) return `Could not find category with name '${categoryName}'`;

      // Find the account for this transaction
      const account = accounts.find((a: any) => a.plaid_account_id === tx.plaid_account_id);
      if (!account) return `Could not find account for transaction`;
      // Find the account in chart_of_accounts
      const selectedAccount = categories.find((c: any) => c.plaid_account_id === tx.plaid_account_id);
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
      await fetch('/api/sync-journal', { method: 'POST' });
      // For now, reload the page to refresh context
      if (typeof window !== 'undefined') {
        setTimeout(() => window.location.reload(), 1000);
      }
      return `Transaction "${tx.description}" categorized as "${category.name}".`;
    }
    // TODO: Implement other actions
    return `Action received: ${JSON.stringify(action)}`;
  }

  const handleSendMessage = async () => {
    if (!inputMessage.trim()) return;
    const newMessage: Message = {
      role: 'user',
      content: inputMessage,
    };
    setMessages((prev) => [...prev, newMessage]);
    setInputMessage('');

    // Prepare context for the AI
    let contextMessages: { role: string; content: string }[] = [];
    
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
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: openAIMessages,
          max_tokens: 256,
          temperature: 0.2,
        }),
      });
      const data = await res.json();
      let aiResponse = data.choices?.[0]?.message?.content?.trim() || 'Sorry, I could not generate a response.';

      // Check for JSON action in the response
      const actionMatch = aiResponse.match(/\{[^}]+\}/);
      if (actionMatch) {
        try {
          const action = JSON.parse(actionMatch[0]);
          const result = await handleAIAction(action);
          aiResponse += `\n\n${result}`;
        } catch (err) {
          aiResponse += '\n\n[Error parsing action JSON]';
        }
      }

      setMessages((prev) => [
        ...prev.slice(0, -1), // remove 'Thinking...'
        { role: 'assistant', content: aiResponse },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev.slice(0, -1),
        { role: 'assistant', content: 'Sorry, there was an error contacting the AI.' },
      ]);
    }
  };

  // Panel open/close transition
  const panelStyle = {
    width: isOpen ? panelWidth : 0,
    transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    minWidth: isOpen ? MIN_PANEL_WIDTH : 0,
    maxWidth: MAX_PANEL_WIDTH,
    overflow: 'hidden',
    boxShadow: isOpen ? 'rgba(0,0,0,0.1) 0px 0px 16px' : 'none',
    background: 'white',
    position: 'fixed' as const,
    top: 0,
    right: 0,
    height: '100vh',
    zIndex: 40,
    display: 'flex',
    flexDirection: 'column' as const,
    borderLeft: isOpen ? '1px solid #e5e7eb' : 'none',
  };

  return (
    <>
      {/* Floating open button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed right-4 bottom-4 p-3 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 transition-colors z-40"
        >
          <ChatBubbleLeftRightIcon className="h-6 w-6" />
        </button>
      )}

      {/* Side panel */}
      <div style={panelStyle}>
        {isOpen && (
          <>
            <div className="flex h-full flex-col bg-white shadow-xl text-xs">
              <div className="px-4 py-6 sm:px-6">
                <div className="flex items-start justify-between">
                  <div className="text-base font-semibold leading-6 text-gray-900 text-xs">
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
                        {message.content}
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
            <div
              ref={resizeRef}
              className="absolute left-0 top-0 h-full w-1 cursor-ew-resize bg-gray-200 hover:bg-blue-500"
              onMouseDown={handleResizeStart}
            />
          </>
        )}
      </div>
    </>
  );
} 