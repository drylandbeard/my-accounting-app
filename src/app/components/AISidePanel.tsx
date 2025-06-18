'use client';

import { useState, useEffect, useRef, useContext } from 'react';
import { XMarkIcon, ChatBubbleLeftRightIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { SharedContext } from './SharedContext';
import { supabase } from '@/lib/supabaseClient';
import { useApiWithCompany } from '@/hooks/useApiWithCompany';
import { tools } from '../ai/tools';
import { categoryPrompt } from '../ai/prompts';
import { createCategoryHandler, createCategoryHelper } from '../ai/functions/createCategory';
import { renameCategoryHandler, renameCategoryHelper } from '../ai/functions/renameCategory';
import { assignParentCategoryHandler } from '../ai/functions/assignParentCategory';
import { deleteCategoryHandler } from '../ai/functions/deleteCategory';
import { changeCategoryTypeHandler } from '../ai/functions/changeCategoryType';

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

export default function AISidePanel({ isOpen, setIsOpen }: AISidePanelProps) {
  const [messages, setMessages] = useState<Message[]>(() => {
    if (typeof window === 'undefined') {
      return [];
    }
    const savedMessages = localStorage.getItem('aiChatMessages');
    if (savedMessages) {
      try {
        const parsedMessages = JSON.parse(savedMessages);
        // Filter out any messages with showConfirmation or pendingAction to avoid stale confirmations
        return parsedMessages.map((msg: Message) => ({
          role: msg.role,
          content: msg.content
        }));
      } catch (error) {
        console.error('Error parsing saved messages:', error);
        localStorage.removeItem('aiChatMessages');
        return [];
      }
    }
    return [];
  });
  const [inputMessage, setInputMessage] = useState('');
  const [panelWidth, setPanelWidth] = useState(DEFAULT_PANEL_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const resizeRef = useRef<HTMLDivElement>(null);
  const { categories, refreshCategories } = useContext(SharedContext);
  const [pendingToolQueue, setPendingToolQueue] = useState<any[]>([]);
  const [pendingToolArgs, setPendingToolArgs] = useState<any | null>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const { currentCompany, postWithCompany } = useApiWithCompany();

  // Load saved panel width from localStorage
  useEffect(() => {
    const savedWidth = localStorage.getItem('aiPanelWidth');
    if (savedWidth) {
      setPanelWidth(parseInt(savedWidth, 10));
    }
  }, []);

  // Save messages to localStorage whenever messages change
  useEffect(() => {
    // A small delay to batch updates and avoid excessive writes.
    const handler = setTimeout(() => {
      localStorage.setItem('aiChatMessages', JSON.stringify(messages));
    }, 100);

    return () => {
      clearTimeout(handler);
    };
  }, [messages]);

  // Fetch transactions and accounts when component mounts
  useEffect(() => {
    const fetchData = async () => {
      if (!currentCompany) return;
      
      const [transactionsData, accountsData] = await Promise.all([
        supabase.from('imported_transactions').select('*').eq('company_id', currentCompany.id),
        supabase.from('accounts').select('*').eq('company_id', currentCompany.id)
      ]);
      
      setTransactions(transactionsData.data || []);
      setAccounts(accountsData.data || []);
    };
    
    fetchData();
  }, [currentCompany]);

  // Save panel width to localStorage
  useEffect(() => {
    localStorage.setItem('aiPanelWidth', panelWidth.toString());
  }, [panelWidth]);

  // Function to refresh/clear chat context
  const handleRefreshContext = () => {
    setMessages([]);
    localStorage.removeItem('aiChatMessages');
    setPendingToolQueue([]);
    setPendingToolArgs(null);
  };

  const handleResizeStart = (e: React.MouseEvent) => {
    setIsResizing(true);
    e.preventDefault();
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
  async function executeAction(action: { 
    action: string; 
    date?: string; 
    amount?: number; 
    description?: string; 
    categoryName?: string; 
    parentCategoryName?: string;
    name?: string;
    type?: string;
    oldName?: string;
    newName?: string;
    newType?: string;
  }): Promise<string> {
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
      await refreshCategories();
      return `Transaction "${tx.description}" categorized as "${category.name}".`;
    }
    
    if (action.action === 'create_category') {
      const result = await createCategoryHandler({
        name: action.name!,
        type: action.type!,
        companyId: currentCompany?.id
      });
      
      if (result.success) {
        await refreshCategories();
        return `Successfully created category '${action.name}' with type '${action.type}'.`;
      } else {
        return `Error creating category: ${result.error}`;
      }
    }
    
    if (action.action === 'rename_category') {
      const result = await renameCategoryHandler({
        oldName: action.oldName!,
        newName: action.newName!,
        companyId: currentCompany?.id,
        categories
      });
      
      if (result.success) {
        await refreshCategories();
        return `Successfully renamed category '${action.oldName}' to '${action.newName}'.`;
      } else {
        return `Error renaming category: ${result.error}`;
      }
    }
    
    if (action.action === 'delete_category') {
      const result = await deleteCategoryHandler({
        name: action.name!,
        companyId: currentCompany?.id,
        categories
      });
      
      if (result.success) {
        await refreshCategories();
        return `Successfully deleted category '${action.name}'.`;
      } else {
        return `Error deleting category: ${result.error}`;
      }
    }
    
    if (action.action === 'change_category_type') {
      const result = await changeCategoryTypeHandler({
        categoryName: action.categoryName!,
        newType: action.newType!,
        companyId: currentCompany?.id,
        categories
      });
      
      if (result.success) {
        await refreshCategories();
        return `Successfully changed category '${action.categoryName}' type to '${action.newType}'.`;
      } else {
        return `Error changing category type: ${result.error}`;
      }
    }
    
    if (action.action === 'assign_parent_category') {
      const result = await assignParentCategoryHandler({
        childName: action.categoryName!,
        parentName: action.parentCategoryName!,
        companyId: currentCompany?.id,
        categories
      });
      
      if (result.success) {
        await refreshCategories(); // Instead of page reload
        return `Successfully assigned category '${action.categoryName}' under parent category '${action.parentCategoryName}'.`;
      } else {
        return `Error assigning category: ${result.error}`;
      }
    }
    
    return `Action executed: ${JSON.stringify(action)}`;
  }

  // Handle confirmation
  const handleConfirm = async (messageIndex: number) => {
    const message = messages[messageIndex];
    if (message.pendingAction) {
      if (message.pendingAction.action === 'batch_execute') {
        // Execute all actions in the queue
        const results: string[] = [];
        let currentMessage = message.content + '\n\n✅ **Executing actions:**\n';
        
        // Update message to show it's executing
        setMessages(prev => prev.map((msg, idx) => 
          idx === messageIndex 
            ? { ...msg, content: currentMessage, showConfirmation: false, pendingAction: undefined }
            : msg
        ));
        
                 // Execute each action in sequence
         for (let i = 0; i < pendingToolQueue.length; i++) {
           const action = pendingToolQueue[i];
           try {
             // Update to show current action being processed
             const processingMessage = currentMessage + `\n🔄 Processing action ${i + 1}...`;
             setMessages(prev => prev.map((msg, idx) => 
               idx === messageIndex 
                 ? { ...msg, content: processingMessage }
                 : msg
             ));
             
             const result = await executeAction(action);
             results.push(`${i + 1}. ${result}`);
             currentMessage += `${i + 1}. ${result}\n`;
             
             // Categories are already refreshed in executeAction, no need to call again
             
             // Update message with progress
             setMessages(prev => prev.map((msg, idx) => 
               idx === messageIndex 
                 ? { ...msg, content: currentMessage }
                 : msg
             ));
           } catch (error) {
             results.push(`${i + 1}. Error: ${error}`);
             currentMessage += `${i + 1}. ❌ Error: ${error}\n`;
             
             // Update message with error
             setMessages(prev => prev.map((msg, idx) => 
               idx === messageIndex 
                 ? { ...msg, content: currentMessage }
                 : msg
             ));
           }
         }
        
        // Clear the queue
        setPendingToolQueue([]);
        
        // Final message update
        currentMessage += `\n🎉 **All actions completed!**`;
        setMessages(prev => prev.map((msg, idx) => 
          idx === messageIndex 
            ? { ...msg, content: currentMessage }
            : msg
        ));
              } else {
          // Execute single action (backward compatibility)
          
          // Show confirming message first
          setMessages(prev => prev.map((msg, idx) => 
            idx === messageIndex 
              ? { ...msg, content: msg.content + `\n\n🔄 **Confirming and executing...**`, showConfirmation: false, pendingAction: undefined }
              : msg
          ));
          
          try {
            const result = await executeAction(message.pendingAction);
            
            // Force refresh categories after successful action
            await refreshCategories();
            
            // Update the message to show the result
            setMessages(prev => prev.map((msg, idx) => 
              idx === messageIndex 
                ? { ...msg, content: msg.content.replace('🔄 **Confirming and executing...**', `✅ **Confirmed and executed:** ${result}`) }
                : msg
            ));
          } catch (error) {
            // Update the message to show the error
            setMessages(prev => prev.map((msg, idx) => 
              idx === messageIndex 
                ? { ...msg, content: msg.content.replace('🔄 **Confirming and executing...**', `❌ **Error:** ${error}`) }
                : msg
            ));
          }
        }
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

    // Only provide categories context
    const contextMessages: { role: string; content: string }[] = [
      {
        role: 'system',
        content: `Available categories: ${categories.map(c => c.name).join(', ')}`
      }
    ];

    const openAIMessages = [
      { role: 'system', content: categoryPrompt },
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
          tools,
        }),
      });
      
      const data = await res.json();
      console.log('API Response:', data); // Debug log
      
      const choice = data.choices?.[0];
      const toolCalls = choice?.message?.tool_calls;
      let aiResponse = choice?.message?.content?.trim() || '';

      // Handle tool calls (preferred method)
      if (toolCalls && toolCalls.length > 0) {
        // Handle multiple tool calls - queue them all up
        const allActions: any[] = [];
        let confirmationMessage = "";
        
        toolCalls.forEach((toolCall: any, index: number) => {
          const functionName = toolCall.function?.name;
          const args = JSON.parse(toolCall.function?.arguments || '{}');
          
          if (functionName === 'create_category') {
            allActions.push({
              action: 'create_category',
              name: args.name,
              type: args.type
            });
            confirmationMessage += `${toolCalls.length > 1 ? `${index + 1}. ` : ''}Create category "${args.name}" with type "${args.type}"${toolCalls.length > 1 ? '\n' : ''}`;
          } else if (functionName === 'rename_category') {
            allActions.push({
              action: 'rename_category',
              oldName: args.oldName,
              newName: args.newName
            });
            confirmationMessage += `${toolCalls.length > 1 ? `${index + 1}. ` : ''}Rename category "${args.oldName}" to "${args.newName}"${toolCalls.length > 1 ? '\n' : ''}`;
          } else if (functionName === 'delete_category') {
            allActions.push({
              action: 'delete_category',
              name: args.name
            });
            confirmationMessage += `${toolCalls.length > 1 ? `${index + 1}. ` : ''}Delete category "${args.name}"${toolCalls.length > 1 ? '\n' : ''}`;
          } else if (functionName === 'change_category_type') {
            allActions.push({
              action: 'change_category_type',
              categoryName: args.categoryName,
              newType: args.newType
            });
            confirmationMessage += `${toolCalls.length > 1 ? `${index + 1}. ` : ''}Change category "${args.categoryName}" type to "${args.newType}"${toolCalls.length > 1 ? '\n' : ''}`;
          } else if (functionName === 'assign_parent_category') {
            allActions.push({
              action: 'assign_parent_category',
              categoryName: args.childName,
              parentCategoryName: args.parentName
            });
            confirmationMessage += `${toolCalls.length > 1 ? `${index + 1}. ` : ''}Assign category "${args.childName}" under "${args.parentName}"${toolCalls.length > 1 ? '\n' : ''}`;
          }
        });
        
        if (toolCalls.length > 1) {
          confirmationMessage = "I will perform the following actions:\n\n" + confirmationMessage + "\nPress Confirm to execute all actions, or Cancel to abort.";
        } else {
          confirmationMessage = "I will " + confirmationMessage.toLowerCase() + ". Press Confirm to proceed.";
        }
        
        // Set up for batch execution
        setPendingToolQueue(allActions);
        setMessages((prev) => [
          ...prev.slice(0, -1), // remove 'Thinking...'
          { 
            role: 'assistant', 
            content: confirmationMessage,
            showConfirmation: true,
            pendingAction: { action: 'batch_execute' }
          },
        ]);
        return;
      }

      // Fallback: check for JSON action in the response content
      if (!aiResponse && choice?.message?.content) {
        aiResponse = choice.message.content.trim();
        
        const actionMatch = aiResponse.match(/\{[^}]+\}/);
        let pendingAction = null;
        let showConfirmation = false;

        if (actionMatch) {
          try {
            const action = JSON.parse(actionMatch[0]);
            
            if (action.action === 'assign_parent_category') {
              pendingAction = action;
              showConfirmation = true;
            } else {
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
        return;
      }

      // Default fallback
      if (!aiResponse) {
        aiResponse = 'Sorry, I could not generate a response.';
      }

      setMessages((prev) => [
        ...prev.slice(0, -1), // remove 'Thinking...'
        { 
          role: 'assistant', 
          content: aiResponse
        },
      ]);

    } catch (err) {
      console.error('API Error:', err); // Debug log
      setMessages((prev) => [
        ...prev.slice(0, -1),
        { role: 'assistant', content: 'Sorry, there was an error contacting the AI.' },
      ]);
    }
  };

  const handleConfirmTool = async () => {
    if (!pendingToolArgs || pendingToolQueue.length === 0) return;
    let result: any;
    if (pendingToolArgs.type === 'create_category') {
      result = await createCategoryHandler({ ...pendingToolArgs.args, companyId: currentCompany?.id });
      if (result.success) {
        setMessages(prev => [
          ...prev,
          { role: 'assistant', content: `Category "${pendingToolArgs.args.name}" (${pendingToolArgs.args.type}) has been created! Would you like to create another category or assign this one to a parent category?` }
        ]);
        await refreshCategories();
      } else {
        setMessages(prev => [
          ...prev,
          { role: 'assistant', content: `Error creating category: ${result.error}` }
        ]);
      }
    } else if (pendingToolArgs.type === 'rename_category') {
      result = await renameCategoryHandler({ ...pendingToolArgs.args, companyId: currentCompany?.id, categories });
      if (result.success) {
        setMessages(prev => [
          ...prev,
          { role: 'assistant', content: `Category "${pendingToolArgs.args.oldName}" has been renamed to "${pendingToolArgs.args.newName}". Is there anything else you'd like to change about this category?` }
        ]);
        await refreshCategories();
      } else {
        setMessages(prev => [
          ...prev,
          { role: 'assistant', content: `Error renaming category: ${result.error}` }
        ]);
      }
    } else if (pendingToolArgs.type === 'assign_parent_category') {
      result = await assignParentCategoryHandler({ ...pendingToolArgs.args, companyId: currentCompany?.id, categories });
      if (result.success) {
        setMessages(prev => [
          ...prev,
          { role: 'assistant', content: `Assigned "${pendingToolArgs.args.childName}" as a subcategory of "${pendingToolArgs.args.parentName}". Would you like to organize any other categories?` }
        ]);
        await refreshCategories();
      } else {
        setMessages(prev => [
          ...prev,
          { role: 'assistant', content: `Error: ${result.error}` }
        ]);
      }
    } else if (pendingToolArgs.type === 'delete_category') {
      result = await deleteCategoryHandler({ ...pendingToolArgs.args, companyId: currentCompany?.id, categories });
      if (result.success) {
        setMessages(prev => [
          ...prev,
          { role: 'assistant', content: `Category "${pendingToolArgs.args.name}" has been deleted. Would you like to make any other changes to your categories?` }
        ]);
        await refreshCategories();
      } else {
        setMessages(prev => [
          ...prev,
          { role: 'assistant', content: `Error deleting category: ${result.error}` }
        ]);
      }
    } else if (pendingToolArgs.type === 'change_category_type') {
      result = await changeCategoryTypeHandler({ ...pendingToolArgs.args, companyId: currentCompany?.id, categories });
      if (result.success) {
        setMessages(prev => [
          ...prev,
          { role: 'assistant', content: `Category "${pendingToolArgs.args.categoryName}" type has been changed to "${pendingToolArgs.args.newType}". Would you like to make any other changes to your categories?` }
        ]);
        await refreshCategories();
      } else {
        setMessages(prev => [
          ...prev,
          { role: 'assistant', content: `Error changing category type: ${result.error}` }
        ]);
      }
    }
    // Remove the first tool from the queue and set up the next one
    const newQueue = pendingToolQueue.slice(1);
    setPendingToolQueue(newQueue);
    if (newQueue.length > 0) {
      const nextTool = newQueue[0];
      if (nextTool.function?.name === 'create_category') {
        setPendingToolArgs({ type: 'create_category', args: JSON.parse(nextTool.function.arguments) });
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: `To confirm, I will create a new category named "${JSON.parse(nextTool.function.arguments).name}" with type "${JSON.parse(nextTool.function.arguments).type}". Please press confirm.` }
        ]);
      } else if (nextTool.function?.name === 'rename_category') {
        setPendingToolArgs({ type: 'rename_category', args: JSON.parse(nextTool.function.arguments) });
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: `To confirm, I will rename the category "${JSON.parse(nextTool.function.arguments).oldName}" to "${JSON.parse(nextTool.function.arguments).newName}". Please press confirm.` }
        ]);
      } else if (nextTool.function?.name === 'assign_parent_category') {
        setPendingToolArgs({ type: 'assign_parent_category', args: JSON.parse(nextTool.function.arguments) });
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: `To confirm, I will assign "${JSON.parse(nextTool.function.arguments).childName}" as a subcategory of "${JSON.parse(nextTool.function.arguments).parentName}". Please press confirm.` }
        ]);
      } else if (nextTool.function?.name === 'delete_category') {
        setPendingToolArgs({ type: 'delete_category', args: JSON.parse(nextTool.function.arguments) });
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: `To confirm, I will delete the category "${JSON.parse(nextTool.function.arguments).name}". Please press confirm.` }
        ]);
      } else if (nextTool.function?.name === 'change_category_type') {
        setPendingToolArgs({ type: 'change_category_type', args: JSON.parse(nextTool.function.arguments) });
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: `To confirm, I will change the type of category "${JSON.parse(nextTool.function.arguments).categoryName}" to "${JSON.parse(nextTool.function.arguments).newType}". Please press confirm.` }
        ]);
      }
    } else {
      setPendingToolArgs(null);
    }
  };

  useEffect(() => {
    function handleGlobalKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        if (pendingToolArgs) {
          handleConfirmTool();
        }
      }
    }
    if (pendingToolArgs) {
      window.addEventListener('keydown', handleGlobalKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [pendingToolArgs]);

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

        <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 bg-gray-50">
          <div className="space-y-4">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex ${
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                <div
                  className={`rounded-lg px-4 py-3 max-w-[85%] shadow-sm ${
                    message.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white border border-gray-200 text-gray-800'
                  }`}
                >
                  <div 
                    className={`whitespace-pre-line leading-relaxed ${
                      message.role === 'user' 
                        ? 'text-sm font-medium' 
                        : 'text-sm font-normal'
                    }`}
                    style={{
                      fontFamily: message.role === 'assistant' ? 'ui-sans-serif, system-ui, -apple-system, sans-serif' : 'inherit'
                    }}
                  >
                    {message.content}
                  </div>
                  
                  {/* Confirmation buttons */}
                  {message.showConfirmation && message.pendingAction && (
                    <div className="mt-4 flex gap-3 border-t border-gray-100 pt-3">
                      <button
                        onClick={() => handleConfirm(index)}
                        className="px-4 py-2 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-1 transition-colors duration-200 shadow-sm"
                      >
                        ✓ Confirm
                      </button>
                      <button
                        onClick={() => handleCancel(index)}
                        className="px-4 py-2 bg-gray-500 text-white rounded-md text-sm font-medium hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-1 transition-colors duration-200 shadow-sm"
                      >
                        ✕ Cancel
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          {/* Confirmation button for tool confirmation */}
          {pendingToolArgs && (
            <div className="flex flex-col items-center my-4">
              <button
                className="bg-gray-300 text-gray-900 px-3 py-2 rounded-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-400 transition-all duration-100 flex items-center gap-2 text-xs font-medium animate-pulse"
                style={{ animationDuration: '2s' }}
                onClick={handleConfirmTool}
              >
                Confirm
                <span className="ml-2 inline-block bg-gray-200 text-gray-700 text-[10px] px-1.5 py-0.5 rounded font-mono border border-gray-300">
                  ⌘↵
                </span>
              </button>
            </div>
          )}
        </div>

        <div className="border-t border-gray-200 px-4 py-6 sm:px-6 text-xs">
          <div className="flex space-x-2">
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder="Type your message..."
              className="flex-1 rounded-md border border-gray-300 px-3 py-2 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 text-xs"
            />
            <button
              onClick={handleRefreshContext}
              className="rounded-md bg-orange-600 px-3 py-2 text-white hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 text-xs flex items-center"
              title="Clear chat context"
            >
              <ArrowPathIcon className="h-4 w-4" />
            </button>
            <button
              onClick={handleSendMessage}
              className="rounded-md bg-gray-700 px-4 py-2 text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 text-xs"
            >
              Send
            </button>
          </div>
        </div>
      </div>
      <div
        ref={resizeRef}
        className={`absolute left-0 top-0 h-full w-0.5 cursor-ew-resize group ${
          isResizing ? 'bg-gray-500' : 'bg-gray-200 hover:bg-gray-400'
        } transition-colors duration-200`}
        onMouseDown={handleResizeStart}
        title="Drag to resize panel"
      >
      </div>
      {isResizing && (
        <div className="fixed inset-0 z-50 cursor-ew-resize" style={{ background: 'transparent' }} />
      )}
    </div>
  );
} 