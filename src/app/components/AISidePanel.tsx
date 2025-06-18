'use client';

import { useState, useEffect, useRef, useContext } from 'react';
import { XMarkIcon, ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline';
import { SharedContext } from './SharedContext';
import { useApiWithCompany } from '@/hooks/useApiWithCompany';
import { tools } from '../ai/tools';
import { categoryPrompt } from '../ai/prompts';
import { createCategoryHandler } from '../ai/functions/createCategory';
import { renameCategoryHandler } from '../ai/functions/renameCategory';
import { assignParentCategoryHandler } from '../ai/functions/assignParentCategory';
import { deleteCategoryHandler } from '../ai/functions/deleteCategory';
import { changeCategoryTypeHandler } from '../ai/functions/changeCategoryType';
import { useAuth } from './AuthContext';
import { reassignParentCategoryHandler } from '../ai/functions/reassignParentCategory';
import { createMultipleCategoriesHandler } from '../ai/functions/createMultipleCategories';
import { deleteMultipleCategoriesHandler } from '../ai/functions/deleteCategory';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface AISidePanelProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

interface ToolCall {
  function: {
    name: string;
    arguments: string;
  };
}

type PendingToolArgs =
  | { type: 'create_category'; args: any }
  | { type: 'rename_category'; args: any }
  | { type: 'assign_parent_category'; args: any }
  | { type: 'delete_category'; args: any }
  | { type: 'reassign_parent_category'; args: any }
  | { type: 'create_multiple_categories'; args: any }
  | { type: 'delete_multiple_categories'; args: any };

const DEFAULT_PANEL_WIDTH = 400;
const MIN_PANEL_WIDTH = 300;
const MAX_PANEL_WIDTH = 800;

// Helper to validate UUID
function isValidUUID(uuid: string | undefined): boolean {
  if (!uuid) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid);
}

export default function AISidePanel({ isOpen, setIsOpen }: AISidePanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [panelWidth, setPanelWidth] = useState(DEFAULT_PANEL_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const resizeRef = useRef<HTMLDivElement>(null);
  const { categories, refreshCategories } = useContext(SharedContext);
  const [pendingToolQueue, setPendingToolQueue] = useState<ToolCall[]>([]);
  const [pendingToolArgs, setPendingToolArgs] = useState<PendingToolArgs | null>(null);
  const { currentCompany } = useApiWithCompany();
  const { user } = useAuth();

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

  // Load saved messages from localStorage when component mounts
  useEffect(() => {
    if (user) {
      const savedMessages = localStorage.getItem(`aiChatHistory_${user.id}`);
      if (savedMessages) {
        setMessages(JSON.parse(savedMessages));
      }
    }
  }, [user]);

  // Save messages to localStorage whenever they change
  useEffect(() => {
    if (user && messages.length > 0) {
      localStorage.setItem(`aiChatHistory_${user.id}`, JSON.stringify(messages));
    }
  }, [messages, user]);

  // Clear chat history when user logs out
  useEffect(() => {
    if (!user) {
      setMessages([]);
    }
  }, [user]);

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
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo-1106',
          messages: openAIMessages,
          max_tokens: 256,
          temperature: 0.2,
          tools,
        }),
      });
      const data = await res.json();
      const choice = data.choices?.[0];
      const toolCalls = choice?.message?.tool_calls;
      const aiResponse = choice?.message?.content?.trim() || 'Sorry, I could not generate a response.';

      if (toolCalls && toolCalls.length > 0) {
        setPendingToolQueue(toolCalls);
        // Set up the first tool's args for confirmation
        const firstTool = toolCalls[0];
        if (firstTool.function?.name === 'create_category') {
          setPendingToolArgs({ type: 'create_category', args: JSON.parse(firstTool.function.arguments) });
          setMessages((prev) => [
            ...prev.slice(0, -1),
            { role: 'assistant', content: `To confirm, I will create a new category named "${JSON.parse(firstTool.function.arguments).name}" with type "${JSON.parse(firstTool.function.arguments).type}". Please press confirm.` }
          ]);
        } else if (firstTool.function?.name === 'create_multiple_categories') {
          setPendingToolArgs({ type: 'create_multiple_categories', args: JSON.parse(firstTool.function.arguments) });
          const args = JSON.parse(firstTool.function.arguments);
          const names = args.categories.map((cat: any) => `"${cat.name}"`).join(', ');
          setMessages((prev) => [
            ...prev.slice(0, -1),
            { role: 'assistant', content: `To confirm, I will create the following categories: ${names}. Please press confirm.` }
          ]);
        } else if (firstTool.function?.name === 'delete_multiple_categories') {
          setPendingToolArgs({ type: 'delete_multiple_categories', args: JSON.parse(firstTool.function.arguments) });
          const args = JSON.parse(firstTool.function.arguments);
          const names = args.names.map((name: string) => `"${name}"`).join(', ');
          setMessages((prev) => [
            ...prev.slice(0, -1),
            { role: 'assistant', content: `To confirm, I will delete the following categories: ${names}. Please press confirm.` }
          ]);
        } else if (firstTool.function?.name === 'rename_category') {
          setPendingToolArgs({ type: 'rename_category', args: JSON.parse(firstTool.function.arguments) });
          setMessages((prev) => [
            ...prev.slice(0, -1),
            { role: 'assistant', content: `To confirm, I will rename the category "${JSON.parse(firstTool.function.arguments).oldName}" to "${JSON.parse(firstTool.function.arguments).newName}". Please press confirm.` }
          ]);
        } else if (firstTool.function?.name === 'assign_parent_category') {
          setPendingToolArgs({ type: 'assign_parent_category', args: JSON.parse(firstTool.function.arguments) });
          setMessages((prev) => [
            ...prev.slice(0, -1),
            { role: 'assistant', content: `To confirm, I will assign "${JSON.parse(firstTool.function.arguments).childName}" as a subcategory of "${JSON.parse(firstTool.function.arguments).parentName}". Please press confirm.` }
          ]);
        } else if (firstTool.function?.name === 'delete_category') {
          setPendingToolArgs({ type: 'delete_category', args: JSON.parse(firstTool.function.arguments) });
          setMessages((prev) => [
            ...prev.slice(0, -1),
            { role: 'assistant', content: `To confirm, I will delete the category "${JSON.parse(firstTool.function.arguments).name}". Please press confirm.` }
          ]);
        } else if (firstTool.function?.name === 'change_category_type') {
          setPendingToolArgs({ type: 'change_category_type', args: JSON.parse(firstTool.function.arguments) });
          setMessages((prev) => [
            ...prev.slice(0, -1),
            { role: 'assistant', content: `To confirm, I will change the type of category "${JSON.parse(firstTool.function.arguments).name}" to "${JSON.parse(firstTool.function.arguments).newType}". Please press confirm.` }
          ]);
        } else if (firstTool.function?.name === 'reassign_parent_category') {
          setPendingToolArgs({ type: 'reassign_parent_category', args: JSON.parse(firstTool.function.arguments) });
          const args = JSON.parse(firstTool.function.arguments);
          setMessages((prev) => [
            ...prev.slice(0, -1),
            { role: 'assistant', content: args.parentName === null || args.parentName === ''
              ? `To confirm, I will make "${args.childName}" a root category (remove its parent). Please press confirm.`
              : `To confirm, I will reassign the parent of "${args.childName}" to "${args.parentName}". Please press confirm.` }
          ]);
        }
        return;
      }

      // Default: show the AI's response as usual
      setMessages((prev) => [
        ...prev.slice(0, -1),
        { role: 'assistant', content: aiResponse },
      ]);
    } catch {
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
    } else if (pendingToolArgs.type === 'create_multiple_categories') {
      const categoriesWithCompany = pendingToolArgs.args.categories.map((cat: any) => ({
        ...cat,
        companyId: isValidUUID(cat.companyId) ? cat.companyId : currentCompany?.id,
        parentId: cat.parentId && isValidUUID(cat.parentId) ? cat.parentId : undefined
      }));
      result = await createMultipleCategoriesHandler(categoriesWithCompany);
      const successNames = result.filter((r: any) => r.success).map((r: any) => `"${r.name}"`).join(', ');
      const errorNames = result.filter((r: any) => !r.success).map((r: any) => `"${r.name}"`).join(', ');
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content:
          (successNames ? `Categories created: ${successNames}. ` : '') +
          (errorNames ? `Failed to create: ${errorNames}.` : '') +
          ' Would you like to create more categories or organize them?'
        }
      ]);
      await refreshCategories();
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
          { role: 'assistant', content: `Category "${pendingToolArgs.args.name}" has been changed to type "${pendingToolArgs.args.newType}". Would you like to make any other changes to your categories?` }
        ]);
        await refreshCategories();
      } else {
        setMessages(prev => [
          ...prev,
          { role: 'assistant', content: `Error changing category type: ${result.error}` }
        ]);
      }
    } else if (pendingToolArgs.type === 'reassign_parent_category') {
      result = await reassignParentCategoryHandler({ ...pendingToolArgs.args, companyId: currentCompany?.id, categories });
      if (result.success) {
        setMessages(prev => [
          ...prev,
          { role: 'assistant', content: (pendingToolArgs.args.parentName === null || pendingToolArgs.args.parentName === '')
            ? `Category "${pendingToolArgs.args.childName}" is now a root category (no parent). Would you like to organize any other categories?`
            : `Category "${pendingToolArgs.args.childName}" has been reassigned to parent "${pendingToolArgs.args.parentName}". Would you like to organize any other categories?` }
        ]);
        await refreshCategories();
      } else {
        setMessages(prev => [
          ...prev,
          { role: 'assistant', content: `Error changing category type: ${result.error}` }
        ]);
      }
    } else if (pendingToolArgs.type === 'delete_multiple_categories') {
      const names = pendingToolArgs.args.names;
      const companyId = isValidUUID(pendingToolArgs.args.companyId) ? pendingToolArgs.args.companyId : currentCompany?.id;
      const cats = pendingToolArgs.args.categories || categories;
      result = await deleteMultipleCategoriesHandler({ names, companyId, categories: cats });
      const successNames = result.filter((r: any) => r.success).map((r: any) => `"${r.name}"`).join(', ');
      const errorNames = result.filter((r: any) => !r.success).map((r: any) => `"${r.name}"`).join(', ');
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content:
          (successNames ? `Categories deleted: ${successNames}. ` : '') +
          (errorNames ? `Failed to delete: ${errorNames}.` : '') +
          ' Would you like to delete more categories or organize them?'
        }
      ]);
      await refreshCategories();
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
      } else if (nextTool.function?.name === 'create_multiple_categories') {
        setPendingToolArgs({ type: 'create_multiple_categories', args: JSON.parse(nextTool.function.arguments) });
        const args = JSON.parse(nextTool.function.arguments);
        const names = args.categories.map((cat: any) => `"${cat.name}"`).join(', ');
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: `To confirm, I will create the following categories: ${names}. Please press confirm.` }
        ]);
      } else if (nextTool.function?.name === 'delete_multiple_categories') {
        setPendingToolArgs({ type: 'delete_multiple_categories', args: JSON.parse(nextTool.function.arguments) });
        const args = JSON.parse(nextTool.function.arguments);
        const names = args.names.map((name: string) => `"${name}"`).join(', ');
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: `To confirm, I will delete the following categories: ${names}. Please press confirm.` }
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
          { role: 'assistant', content: `To confirm, I will change the type of category "${JSON.parse(nextTool.function.arguments).name}" to "${JSON.parse(nextTool.function.arguments).newType}". Please press confirm.` }
        ]);
      } else if (nextTool.function?.name === 'reassign_parent_category') {
        setPendingToolArgs({ type: 'reassign_parent_category', args: JSON.parse(nextTool.function.arguments) });
        const args = JSON.parse(nextTool.function.arguments);
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: args.parentName === null || args.parentName === ''
            ? `To confirm, I will make "${args.childName}" a root category (remove its parent). Please press confirm.`
            : `To confirm, I will reassign the parent of "${args.childName}" to "${args.parentName}". Please press confirm.` }
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
              Agent
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
                      ? 'bg-gray-700 text-white'
                      : 'bg-gray-100 text-gray-900'
                  } text-xs`}
                >
                  {message.content}
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
          <div className="flex space-x-3">
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder="Type your message..."
              className="flex-1 rounded-md border border-gray-300 px-3 py-2 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 text-xs"
            />
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