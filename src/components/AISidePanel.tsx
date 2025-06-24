/* Use of 'any' types are intentional here due to the dynamic nature of the AI tool responses 
and the complex interaction between multiple imported type definitions from different files. */

/* eslint-disable @typescript-eslint/no-explicit-any */

"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { X, RefreshCcw } from "lucide-react";
import { useCategoriesStore } from "@/zustand/categoriesStore";
import { useAuthStore } from "@/zustand/authStore";
import { api } from "@/lib/api";
import { tools } from "@/ai/tools";
import { categoryPrompt } from "@/ai/prompts";


interface Message {
  role: "user" | "assistant";
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
    if (typeof window === "undefined") {
      return [];
    }
    const savedMessages = localStorage.getItem("aiChatMessages");
    if (savedMessages) {
      try {
        const parsedMessages = JSON.parse(savedMessages);
        // Filter out any messages with showConfirmation or pendingAction to avoid stale confirmations
        return parsedMessages.map((msg: Message) => ({
          role: msg.role,
          content: msg.content,
        }));
      } catch (error) {
        console.error("Error parsing saved messages:", error);
        localStorage.removeItem("aiChatMessages");
        return [];
      }
    }
    // Return welcome message for new users
    return [
      {
        role: "assistant",
        content: `👋 Hey there! I'm your **continuous** accounting assistant agent. I'm always monitoring your workflow and looking for ways to optimize it!

🔄 **Continuous Mode**: I'll automatically suggest improvements when you make changes, monitor for new transactions, and check in periodically to help enhance your accounting setup.

I can help you:
• Create and organize chart of account categories
• Set up category hierarchies that make sense for your business
• Proactively suggest optimizations as you work
• Monitor changes and offer continuous improvements
• Answer questions about accounting structure

What kind of business are you running? I'd love to learn more so I can continuously provide tailored suggestions! 💡

*Tip: Toggle the "🔄 Continuous" button in the header if you prefer manual-only assistance.*`,
      },
    ];
  });
  const [inputMessage, setInputMessage] = useState("");
  const [panelWidth, setPanelWidth] = useState(DEFAULT_PANEL_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const resizeRef = useRef<HTMLDivElement>(null);
  
  // Use the same Zustand store as the categories page for consistency
  const { 
    categories, 
    refreshCategories: refreshCategoriesFromStore, 
    addCategory,
    updateCategory,
    deleteCategory,
    error: storeError,
    findCategoryByName,
    findCategoriesByName,
    mergeCategories,
    moveCategory
  } = useCategoriesStore();
  
  const { currentCompany } = useAuthStore();
  
  // Create a wrapper for refreshCategories
  const refreshCategories = useCallback(async () => {
    await refreshCategoriesFromStore();
  }, [refreshCategoriesFromStore]);

  // Helper function for assigning parent category using store
  const assignParentCategory = useCallback(async (childCategoryId: string, parentCategoryId: string) => {
    try {
      // Validate that both categories exist
      const childCategory = categories.find(c => c.id === childCategoryId);
      const parentCategory = categories.find(c => c.id === parentCategoryId);
      
      if (!childCategory) {
        return { success: false, error: `Child category with ID '${childCategoryId}' not found` };
      }
      
      if (!parentCategory) {
        return { success: false, error: `Parent category with ID '${parentCategoryId}' not found` };
      }
      
      // Check for circular dependency
      if (childCategoryId === parentCategoryId) {
        return { success: false, error: 'A category cannot be its own parent' };
      }
      
             // Check if parent would create a circular dependency
       let currentParent: typeof parentCategory | undefined = parentCategory;
       while (currentParent?.parent_id) {
         if (currentParent.parent_id === childCategoryId) {
           return { success: false, error: 'This would create a circular dependency' };
         }
         currentParent = categories.find(c => c.id === currentParent?.parent_id);
         if (!currentParent) break;
       }
      
      const result = await updateCategory(childCategoryId, { parent_id: parentCategoryId });
      return { success: result, error: result ? null : 'Failed to assign parent category' };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }, [categories, updateCategory]);

  // Helper function for changing category type using store
  const changeCategoryType = useCallback(async (categoryId: string, newType: string) => {
    try {
      // Validate that category exists
      const category = categories.find(c => c.id === categoryId);
      
      if (!category) {
        return { success: false, error: `Category with ID '${categoryId}' not found` };
      }
      
      // Check if category has children and ensure type consistency
      const children = categories.filter(c => c.parent_id === categoryId);
      if (children.length > 0) {
        const inconsistentChildren = children.filter(c => c.type !== newType);
        if (inconsistentChildren.length > 0) {
          return { 
            success: false, 
            error: `Cannot change type because this category has ${inconsistentChildren.length} subcategories with different types. Please update them first or remove them.`
          };
        }
      }
      
      // Check if category has a parent and ensure type consistency
      if (category.parent_id) {
        const parent = categories.find(c => c.id === category.parent_id);
        if (parent && parent.type !== newType) {
          return {
            success: false,
            error: `Cannot change type because the parent category has type '${parent.type}'. Categories and their parents must have the same type.`
          };
        }
      }
      
      const result = await updateCategory(categoryId, { type: newType });
      return { success: result, error: result ? null : 'Failed to change category type' };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }, [categories, updateCategory]);
  
  const [pendingToolQueue, setPendingToolQueue] = useState<any[]>([]);
  const [pendingToolArgs, setPendingToolArgs] = useState<any | null>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [lastActivityTime, setLastActivityTime] = useState<number>(Date.now());
  const [proactiveMode, setProactiveMode] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const saved = localStorage.getItem("aiProactiveMode");
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [lastCategoriesHash, setLastCategoriesHash] = useState<string>("");
  const [lastTransactionsCount, setLastTransactionsCount] = useState<number>(0);
  const [recentProactiveMessages, setRecentProactiveMessages] = useState<Set<string>>(new Set());

  // Load saved panel width from localStorage
  useEffect(() => {
    const savedWidth = localStorage.getItem("aiPanelWidth");
    if (savedWidth) {
      setPanelWidth(parseInt(savedWidth, 10));
    }
  }, []);

  // Save messages to localStorage whenever messages change
  useEffect(() => {
    // A small delay to batch updates and avoid excessive writes.
    const handler = setTimeout(() => {
      localStorage.setItem("aiChatMessages", JSON.stringify(messages));
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
        supabase.from("imported_transactions").select("*").eq("company_id", currentCompany.id),
        supabase.from("accounts").select("*").eq("company_id", currentCompany.id),
      ]);

      setTransactions(transactionsData.data || []);
      setAccounts(accountsData.data || []);
    };

    fetchData();
  }, [currentCompany]);

  // Save panel width to localStorage
  useEffect(() => {
    localStorage.setItem("aiPanelWidth", panelWidth.toString());
  }, [panelWidth]);

  // Save proactive mode setting
  useEffect(() => {
    localStorage.setItem("aiProactiveMode", JSON.stringify(proactiveMode));
  }, [proactiveMode]);

  // Helper function to add proactive message without duplicates
  const addProactiveMessage = (messageKey: string, content: string, delay: number = 2000) => {
    if (recentProactiveMessages.has(messageKey)) return;

    setRecentProactiveMessages((prev) => new Set(prev).add(messageKey));

    setTimeout(() => {
      setMessages((prev) => {
        // Double-check the message hasn't been added already
        const lastMessage = prev[prev.length - 1];
        if (lastMessage?.role === "assistant" && lastMessage.content.includes(content.substring(0, 50))) {
          return prev;
        }
        return [...prev, { role: "assistant", content }];
      });
    }, delay);

    // Clear the message key after 5 minutes to allow future similar messages
    setTimeout(() => {
      setRecentProactiveMessages((prev) => {
        const newSet = new Set(prev);
        newSet.delete(messageKey);
        return newSet;
      });
    }, 5 * 60 * 1000);
  };

  // Continuous monitoring - detect changes and proactively suggest improvements
  useEffect(() => {
    if (!proactiveMode || !currentCompany) return;

    const categoriesHash = JSON.stringify(categories.map((c) => ({ id: c.id, name: c.name, type: c.type })));
    const transactionsCount = transactions.length;

    // Check for category changes
    if (lastCategoriesHash && lastCategoriesHash !== categoriesHash && categoriesHash !== "[]") {
      const messageKey = `category-changes-${Date.now()}`;
      const content = `🔍 I noticed you've made changes to your categories! Here are some suggestions to optimize further:

• **Review category hierarchy**: Would you like me to suggest better parent-child relationships?
• **Check for duplicates**: I can help identify any similar categories that could be merged
• **Optimize for reporting**: Let's ensure your categories align with your reporting needs

What would you like to focus on next? I'm here to help you continuously improve your accounting structure! 💡`;

      addProactiveMessage(messageKey, content, 2000);
    }

    // Check for new transactions
    if (lastTransactionsCount > 0 && transactionsCount > lastTransactionsCount) {
      const newTransactionsCount = transactionsCount - lastTransactionsCount;
      const messageKey = `new-transactions-${transactionsCount}`;
      const content = `📊 I see you have ${newTransactionsCount} new transaction${
        newTransactionsCount > 1 ? "s" : ""
      } to categorize!

Here's how I can help optimize this:
• **Batch categorization**: I can help you quickly categorize similar transactions
• **Create missing categories**: Need new categories for these transactions?
• **Set up rules**: Want me to suggest automation for recurring transactions?

Ready to tackle these together? What type of transactions are these mostly? 🚀`;

      addProactiveMessage(messageKey, content, 1500);
    }

    setLastCategoriesHash(categoriesHash);
    setLastTransactionsCount(transactionsCount);
  }, [
    categories,
    transactions,
    lastCategoriesHash,
    lastTransactionsCount,
    proactiveMode,
    currentCompany,
    recentProactiveMessages,
  ]);

  // Periodic check-ins to keep AI engaged
  useEffect(() => {
    if (!proactiveMode) return;

    const checkInInterval = setInterval(() => {
      const timeSinceLastActivity = Date.now() - lastActivityTime;
      const tenMinutes = 10 * 60 * 1000;

      // If user hasn't interacted in 10 minutes, send a helpful check-in
      if (timeSinceLastActivity > tenMinutes && messages.length > 1) {
        const checkInMessages = [
          `👋 Still working on your accounting? I'm here if you need any suggestions for optimizing your categories or workflow!`,
          `💡 Quick question: Have you considered setting up subcategories for better expense tracking? I can help organize them!`,
          `📈 How's your financial organization going? I noticed some areas where we could improve efficiency - want to explore them?`,
          `🎯 Ready to take your accounting to the next level? I have some ideas for optimizing your current setup!`,
        ];

        const randomMessage = checkInMessages[Math.floor(Math.random() * checkInMessages.length)];
        const messageKey = `check-in-${Date.now()}`;

        addProactiveMessage(messageKey, randomMessage, 0);
        setLastActivityTime(Date.now()); // Reset timer after check-in
      }
    }, 60000); // Check every minute

    return () => clearInterval(checkInInterval);
  }, [lastActivityTime, messages.length, proactiveMode, recentProactiveMessages]);

  // Update activity time on user interaction
  const updateActivityTime = () => {
    setLastActivityTime(Date.now());
  };

  // Function to refresh/clear chat context
  const handleRefreshContext = () => {
    setMessages([]);
    localStorage.removeItem("aiChatMessages");
    setPendingToolQueue([]);
    setPendingToolArgs(null);
  };

  const handleResizeStart = (e: React.MouseEvent) => {
    setIsResizing(true);
    e.preventDefault();
    document.body.style.userSelect = "none";
    document.body.style.cursor = "ew-resize";
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
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
  };

  useEffect(() => {
    if (isResizing) {
      window.addEventListener("mousemove", handleResizeMove);
      window.addEventListener("mouseup", handleResizeEnd);
    }
    return () => {
      window.removeEventListener("mousemove", handleResizeMove);
      window.removeEventListener("mouseup", handleResizeEnd);
    };
  }, [isResizing]);

  // Enhanced executeAction function to handle category operations
  async function executeAction(action: any, skipRefresh: boolean = false, customCategories?: any[]): Promise<string> {
    const categoriesToUse = customCategories || categories;
    
    if (action.action === "categorize") {
      // Find the transaction and category by human-friendly fields
      const { date, amount, description, categoryName } = action;
      // Try to match transaction (allow for string/number for amount)
      const tx = transactions.find(
        (t) =>
          t.date === date &&
          (t.amount === amount ||
            t.spent === amount ||
            t.received === amount ||
            t.amount === Number(amount) ||
            t.spent === Number(amount) ||
            t.received === Number(amount)) &&
          (description ? t.description === description : true)
      );
      const category = categoriesToUse.find((c) => c.name.toLowerCase() === categoryName?.toLowerCase());
      if (!tx)
        return `Could not find transaction with date ${date}, amount ${amount}${
          description ? ", description '" + description + "'" : ""
        }`;
      if (!category) return `Could not find category with name '${categoryName}'`;

      // Find the account for this transaction
      const account = accounts.find((a) => a.plaid_account_id === tx.plaid_account_id);
      if (!account) return `Could not find account for transaction`;
      // Find the account in chart_of_accounts
      const selectedAccount = categoriesToUse.find((c) => c.plaid_account_id === tx.plaid_account_id);
      if (!selectedAccount) return `Could not find chart of account for transaction`;
      const selectedAccountIdInCOA = selectedAccount.id;

      // Insert into transactions
      await supabase.from("transactions").insert([
        {
          date: tx.date,
          description: tx.description,
          spent: tx.spent ?? 0,
          received: tx.received ?? 0,
          selected_category_id: category.id,
          corresponding_category_id: selectedAccountIdInCOA,
          plaid_account_id: tx.plaid_account_id,
          plaid_account_name: tx.plaid_account_name,
        },
      ]);
      // Remove from imported_transactions
      await supabase.from("imported_transactions").delete().eq("id", tx.id);
      await api.post("/api/sync-journal", {});
      // Refresh categories unless we're in batch mode
      if (!skipRefresh) {
        await refreshCategories();
      }
      return `Transaction "${tx.description}" categorized as "${category.name}".`;
    }

    if (action.action === "create_category") {
      try {
        // If parent is specified by name, find the ID
        let parentId = action.parent_id || null;
        if (action.parentName && !parentId) {
          const parentCategory = findCategoryByName(action.parentName);
          if (parentCategory) {
            parentId = parentCategory.id;
          } else if (action.parentName) {
            return `Could not find parent category '${action.parentName}'`;
          }
        }
        
        const categoryData = {
          name: action.name!,
          type: action.type!,
          parent_id: parentId,
          company_id: currentCompany!.id,
        };

        const result = await addCategory(categoryData);
        
        if (result) {
          return `Successfully created category '${action.name}' with type '${action.type}'.`;
        } else {
          const errorMessage = storeError || 'Failed to create category';
          return `Error creating category: ${errorMessage}`;
        }
      } catch (error) {
        return `Error creating category: ${error instanceof Error ? error : 'Unknown error'}`;
      }
    }

    if (action.action === "update_category") {
      try {
        // Find category by name if ID is not provided
        let categoryId = action.categoryId;
        if (!categoryId && action.categoryName) {
          const category = findCategoryByName(action.categoryName);
          if (category) {
            categoryId = category.id;
          } else {
            return `Could not find category with name '${action.categoryName}'`;
          }
        }
        
        if (!categoryId) {
          return 'Category ID or name is required for update';
        }
        
        const updates: any = {};
        if (action.name) updates.name = action.name;
        if (action.type) updates.type = action.type;
        if (action.parent_id !== undefined) updates.parent_id = action.parent_id;

        const result = await updateCategory(categoryId, updates);
        
        if (result) {
          return `Successfully updated category '${action.categoryName || categoryId}'.`;
        } else {
          const errorMessage = storeError || 'Failed to update category';
          return `Error updating category: ${errorMessage}`;
        }
      } catch (error) {
        return `Error updating category: ${error instanceof Error ? error.message : 'Unknown error'}`;
      }
    }

    if (action.action === "delete_category") {
      try {
        // Find category by name if ID is not provided
        let categoryId = action.categoryId;
        if (!categoryId && action.categoryName) {
          const category = findCategoryByName(action.categoryName);
          if (category) {
            categoryId = category.id;
          } else {
            return `Could not find category with name '${action.categoryName}'`;
          }
        }
        
        if (!categoryId) {
          return 'Category ID or name is required for deletion';
        }
        
        const result = await deleteCategory(categoryId);
        
        if (result) {
          return `Successfully deleted category '${action.categoryName || categoryId}'.`;
        } else {
          const errorMessage = storeError || 'Failed to delete category';
          return `Error deleting category: ${errorMessage}`;
        }
      } catch (error) {
        return `Error deleting category: ${error instanceof Error ? error.message : 'Unknown error'}`;
      }
    }

    if (action.action === "change_category_type") {
      // Find category by name if ID is not provided
      let categoryId = action.categoryId;
      if (!categoryId && action.categoryName) {
        const category = findCategoryByName(action.categoryName);
        if (category) {
          categoryId = category.id;
        } else {
          return `Could not find category with name '${action.categoryName}'`;
        }
      }
      
      if (!categoryId) {
        return 'Category ID or name is required to change type';
      }

      const result = await updateCategory(categoryId, { type: action.newType });

      if (result) {
        if (!skipRefresh) {
          await refreshCategories();
        }
        return `Successfully changed category '${action.categoryName || categoryId}' type to '${action.newType}'.`;
      } else {
        return `Error changing category type: ${storeError || 'Unknown error'}`;
      }
    }

    if (action.action === "assign_parent_category") {
      // Find categories by name if IDs are not provided
      let childId = action.childCategoryId;
      let parentId = action.parentCategoryId;
      
      if (!childId && action.childCategoryName) {
        const childCategory = findCategoryByName(action.childCategoryName);
        if (childCategory) {
          childId = childCategory.id;
        } else {
          return `Could not find child category with name '${action.childCategoryName}'`;
        }
      }
      
      if (!parentId && action.parentCategoryName) {
        const parentCategory = findCategoryByName(action.parentCategoryName);
        if (parentCategory) {
          parentId = parentCategory.id;
        } else {
          return `Could not find parent category with name '${action.parentCategoryName}'`;
        }
      }
      
      if (!childId || !parentId) {
        return 'Both child and parent category IDs/names are required';
      }

      const result = await updateCategory(childId, { parent_id: parentId });

      if (result) {
        if (!skipRefresh) {
          await refreshCategories();
        }
        return `Successfully assigned category '${action.childCategoryName || childId}' under parent category '${action.parentCategoryName || parentId}'.`;
      } else {
        return `Error assigning category: ${storeError || 'Unknown error'}`;
      }
    }

    if (action.action === "merge_categories") {
      // Find categories by name if IDs are not provided
      let sourceId = action.sourceCategoryId;
      let targetId = action.targetCategoryId;
      
      if (!sourceId && action.sourceCategoryName) {
        const sourceCategory = findCategoryByName(action.sourceCategoryName);
        if (sourceCategory) {
          sourceId = sourceCategory.id;
        } else {
          return `Could not find source category with name '${action.sourceCategoryName}'`;
        }
      }
      
      if (!targetId && action.targetCategoryName) {
        const targetCategory = findCategoryByName(action.targetCategoryName);
        if (targetCategory) {
          targetId = targetCategory.id;
        } else {
          return `Could not find target category with name '${action.targetCategoryName}'`;
        }
      }
      
      if (!sourceId || !targetId) {
        return 'Both source and target category IDs/names are required';
      }
      
      // Validate categories exist and have compatible types
      const sourceCategory = categories.find(c => c.id === sourceId);
      const targetCategory = categories.find(c => c.id === targetId);
      
      if (!sourceCategory || !targetCategory) {
        return 'One or both categories not found';
      }
      
      if (sourceCategory.type !== targetCategory.type) {
        return `Cannot merge categories of different types: ${sourceCategory.type} and ${targetCategory.type}`;
      }
      
      if (sourceId === targetId) {
        return 'Cannot merge a category into itself';
      }
      
      const result = await mergeCategories(sourceId, targetId);
      
      if (result) {
        if (!skipRefresh) {
          await refreshCategories();
        }
        return `Successfully merged category '${action.sourceCategoryName || sourceId}' into '${action.targetCategoryName || targetId}'.`;
      } else {
        return `Error merging categories: ${storeError || 'Unknown error'}`;
      }
    }

    return `Action executed: ${JSON.stringify(action)}`;
  }

  // Handle confirmation
  const handleConfirm = async (messageIndex: number) => {
    const message = messages[messageIndex];
    if (message.pendingAction) {
      if (message.pendingAction.action === "multi_execute") {
        // Execute all actions in the queue
        const results: string[] = [];
        let currentMessage = message.content + "\n\n✅ **Executing actions:**\n";

        // Update message to show it's executing
        setMessages((prev) =>
          prev.map((msg, idx) =>
            idx === messageIndex
              ? { ...msg, content: currentMessage, showConfirmation: false, pendingAction: undefined }
              : msg
          )
        );
        
        let allSuccessful = true;

        // Execute each action in sequence with proper async handling
        for (let i = 0; i < pendingToolQueue.length; i++) {
          const toolCall = pendingToolQueue[i];
          try {
            // Update to show current action being processed
            const processingMessage = currentMessage + `\n🔄 Processing action ${i + 1}...`;
            setMessages((prev) =>
              prev.map((msg, idx) => (idx === messageIndex ? { ...msg, content: processingMessage } : msg))
            );

            // Convert tool call to action format
            const functionName = toolCall.function?.name;
            const args = JSON.parse(toolCall.function?.arguments || "{}");
            const action = { action: functionName, ...args };

            const result = await executeAction(action, true, categories);
            
            results.push(`${i + 1}. ${result}`);
            currentMessage += `${i + 1}. ${result}\n`;

            // Check if operation was not successful
            if (result.toLowerCase().includes('error') || result.toLowerCase().includes('failed') || result.toLowerCase().includes('could not')) {
              allSuccessful = false;
            }

            // Small delay to ensure UI updates are processed
            await new Promise((resolve) => setTimeout(resolve, 200));

            // Update message with progress
            setMessages((prev) =>
              prev.map((msg, idx) => (idx === messageIndex ? { ...msg, content: currentMessage } : msg))
            );
          } catch (error) {
            allSuccessful = false;
            results.push(`${i + 1}. Error: ${error}`);
            currentMessage += `${i + 1}. ❌ Error: ${error}\n`;

            // Update message with error
            setMessages((prev) =>
              prev.map((msg, idx) => (idx === messageIndex ? { ...msg, content: currentMessage } : msg))
            );
          }
        }

        // Clear the queue
        setPendingToolQueue([]);
        
        // Refresh categories
        await refreshCategories();

        // Final message update
        const successEmoji = allSuccessful ? '🎉' : '⚠️';
        const statusText = allSuccessful ? "All actions completed successfully!" : "Actions completed with some issues.";
        
        currentMessage += `\n${successEmoji} **${statusText}**`;
        
        // Add follow-up suggestion based on what was done
        if (allSuccessful) {
          currentMessage += `\n\nIs there anything else you'd like to do with your categories or accounting setup?`;
        } else {
          currentMessage += `\n\nWould you like me to help fix any of the issues that occurred?`;
        }
        
        setMessages((prev) =>
          prev.map((msg, idx) => (idx === messageIndex ? { ...msg, content: currentMessage } : msg))
        );
      } else if (message.pendingAction.action === "batch_execute") {
        // Execute batch operations
        const operations = message.pendingAction.operations;
        const results: string[] = [];
        let currentMessage = message.content + "\n\n✅ **Executing batch operations:**\n";

        // Update message to show it's executing
        setMessages((prev) =>
          prev.map((msg, idx) =>
            idx === messageIndex
              ? { ...msg, content: currentMessage, showConfirmation: false, pendingAction: undefined }
              : msg
          )
        );
        
        let allSuccessful = true;

        // Execute each operation in sequence
        for (let i = 0; i < operations.length; i++) {
          const operation = operations[i];
          try {
            // Update to show current operation being processed
            const processingMessage = currentMessage + `\n🔄 Processing operation ${i + 1}...`;
            setMessages((prev) =>
              prev.map((msg, idx) => (idx === messageIndex ? { ...msg, content: processingMessage } : msg))
            );

            // Create action from operation
            const action = { action: operation.action, ...operation.params };
            
            const result = await executeAction(action, true, categories);
            
            results.push(`${i + 1}. ${result}`);
            currentMessage += `${i + 1}. ${result}\n`;

            // Check if operation was not successful
            if (result.toLowerCase().includes('error') || result.toLowerCase().includes('failed') || result.toLowerCase().includes('could not')) {
              allSuccessful = false;
            }

            // Small delay to ensure UI updates are processed
            await new Promise((resolve) => setTimeout(resolve, 200));

            // Update message with progress
            setMessages((prev) =>
              prev.map((msg, idx) => (idx === messageIndex ? { ...msg, content: currentMessage } : msg))
            );
          } catch (error) {
            allSuccessful = false;
            results.push(`${i + 1}. Error: ${error}`);
            currentMessage += `${i + 1}. ❌ Error: ${error}\n`;

            // Update message with error
            setMessages((prev) =>
              prev.map((msg, idx) => (idx === messageIndex ? { ...msg, content: currentMessage } : msg))
            );
          }
        }

        // Refresh categories
        await refreshCategories();

        // Final message update
        const successEmoji = allSuccessful ? '🎉' : '⚠️';
        const statusText = allSuccessful ? "All batch operations completed successfully!" : "Batch operations completed with some issues.";
        
        currentMessage += `\n${successEmoji} **${statusText}**`;
        
        // Add follow-up suggestion based on what was done
        if (allSuccessful) {
          currentMessage += `\n\nIs there anything else you'd like to do with your categories or accounting setup?`;
        } else {
          currentMessage += `\n\nWould you like me to help fix any of the issues that occurred?`;
        }
        
        setMessages((prev) =>
          prev.map((msg, idx) => (idx === messageIndex ? { ...msg, content: currentMessage } : msg))
        );
      } else {
        // Execute single action (backward compatibility)

        // Show confirming message first
        setMessages((prev) =>
          prev.map((msg, idx) =>
            idx === messageIndex
              ? {
                  ...msg,
                  content: msg.content + `\n\n🔄 **Confirming and executing...**`,
                  showConfirmation: false,
                  pendingAction: undefined,
                }
              : msg
          )
        );

        try {
          const result = await executeAction(message.pendingAction);

          // Force refresh categories after successful action
          await refreshCategories();

          // Update the message to show the result
          setMessages((prev) =>
            prev.map((msg, idx) =>
              idx === messageIndex
                ? {
                    ...msg,
                    content: msg.content.replace(
                      "🔄 **Confirming and executing...**",
                      `✅ **Confirmed and executed:** ${result}`
                    ),
                  }
                : msg
            )
          );
          
          // Add follow-up suggestion if successful
          if (!result.toLowerCase().includes('error') && !result.toLowerCase().includes('failed')) {
            setTimeout(() => {
              setMessages(prev => [
                ...prev,
                {
                  role: "assistant",
                  content: "Is there anything else you'd like to do with your categories or accounting setup?"
                }
              ]);
            }, 1000);
          }
        } catch (error) {
          // Update the message to show the error
          setMessages((prev) =>
            prev.map((msg, idx) =>
              idx === messageIndex
                ? {
                    ...msg,
                    content: msg.content.replace("🔄 **Confirming and executing...**", `❌ **Error:** ${error}`),
                  }
                : msg
            )
          );
        }
      }
    }
  };

  // Handle cancellation
  const handleCancel = (messageIndex: number) => {
    setMessages((prev) =>
      prev.map((msg, idx) =>
        idx === messageIndex
          ? {
              ...msg,
              content: msg.content + "\n\n❌ **Cancelled:** Action was not executed.",
              showConfirmation: false,
              pendingAction: undefined,
            }
          : msg
      )
    );
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim()) return;

    // Update activity time on user interaction
    updateActivityTime();

    const userMessage = inputMessage.trim();
    const newMessage: Message = {
      role: "user",
      content: userMessage,
    };
    
    setMessages((prev) => [...prev, newMessage]);
    setInputMessage("");

    // Check for vague prompts and handle them
    if (isVaguePrompt(userMessage)) {
      handleVaguePrompt(userMessage);
      return;
    }

    // Prepare context for AI
    const contextMessages: { role: string; content: string }[] = [
      {
        role: "system",
        content: `Available categories: ${categories.map((c) => c.name).join(", ")}`
      },
    ];

    const openAIMessages = [
      { role: "system", content: categoryPrompt },
      ...contextMessages,
      ...[...messages, newMessage].map((m) => ({ role: m.role, content: m.content })),
    ];

    setMessages((prev) => [...prev, { role: "assistant", content: "Thinking..." }]);

    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4",
          messages: openAIMessages,
          max_tokens: 512,
          temperature: 0.2,
          tools,
        }),
      });

      const data = await res.json();
      console.log("API Response:", data); // Debug log

      const choice = data.choices?.[0];
      const toolCalls = choice?.message?.tool_calls;
      let aiResponse = choice?.message?.content?.trim() || "";

      // Handle tool calls (preferred method)
      if (toolCalls && toolCalls.length > 0) {
        // Handle multiple tool calls - queue them all up
        if (toolCalls.length > 1) {
          let confirmationMessage = "I will perform the following actions:\n\n";

        toolCalls.forEach((toolCall: any, index: number) => {
          const functionName = toolCall.function?.name;
          const args = JSON.parse(toolCall.function?.arguments || "{}");

          if (functionName === "create_category") {
              confirmationMessage += `${index + 1}. Create category "${args.name}" with type "${args.type}"${
                args.parentName ? ` under ${args.parentName}` : ''
              }\n`;
            } else if (functionName === "update_category") {
              confirmationMessage += `${index + 1}. Update category "${args.categoryName || args.categoryId}"${
                args.name ? ` to name "${args.name}"` : ''
              }${
                args.type ? ` and type "${args.type}"` : ''
              }\n`;
          } else if (functionName === "delete_category") {
              confirmationMessage += `${index + 1}. Delete category "${args.categoryName || args.categoryId}"\n`;
            } else if (functionName === "assign_parent_category") {
              confirmationMessage += `${index + 1}. Move category "${
                args.childCategoryName || args.childCategoryId
              }" under "${args.parentCategoryName || args.parentCategoryId}"\n`;
          } else if (functionName === "change_category_type") {
              confirmationMessage += `${index + 1}. Change category "${
                args.categoryName || args.categoryId
              }" type to "${args.newType}"\n`;
            } else if (functionName === "merge_categories") {
              confirmationMessage += `${index + 1}. Merge "${
                args.sourceCategoryName || args.sourceCategoryId
              }" into "${args.targetCategoryName || args.targetCategoryId}"\n`;
            }
          });

          confirmationMessage += "\nPress Confirm to execute all actions, or Cancel to abort.";

          // Set up for execution
          setPendingToolQueue(toolCalls);
          setMessages((prev) => [
            ...prev.slice(0, -1), // remove 'Thinking...'
            {
              role: "assistant",
              content: confirmationMessage,
              showConfirmation: true,
              pendingAction: { action: "multi_execute" },
            },
          ]);
          return;
        }

        // Single tool call
        const toolCall = toolCalls[0];
        const functionName = toolCall.function?.name;
        const args = JSON.parse(toolCall.function?.arguments || "{}");
        
        let confirmationMessage = '';
        let pendingAction: any = null;

        switch(functionName) {
          case 'create_category':
            confirmationMessage = `I'll create a new category named "${args.name}" with type "${args.type}"${
              args.parentName ? ` under ${args.parentName}` : ''
            }. Would you like to proceed?`;
            pendingAction = { action: 'create_category', ...args };
            break;
          case 'update_category':
            confirmationMessage = `I'll update the category "${args.categoryName || args.categoryId}"${
              args.name ? ` to name "${args.name}"` : ''
            }${
              args.type ? ` with type "${args.type}"` : ''
            }. Would you like to proceed?`;
            pendingAction = { action: 'update_category', ...args };
            break;
          case 'delete_category':
            confirmationMessage = `I'll delete the category "${args.categoryName || args.categoryId}". Would you like to proceed?`;
            pendingAction = { action: 'delete_category', ...args };
            break;
          case 'assign_parent_category':
            confirmationMessage = `I'll move category "${
              args.childCategoryName || args.childCategoryId
            }" under "${
              args.parentCategoryName || args.parentCategoryId
            }". Would you like to proceed?`;
            pendingAction = { action: 'assign_parent_category', ...args };
            break;
          case 'change_category_type':
            confirmationMessage = `I'll change category "${
              args.categoryName || args.categoryId
            }" type to "${args.newType}". Would you like to proceed?`;
            pendingAction = { action: 'change_category_type', ...args };
            break;
          case 'merge_categories':
            confirmationMessage = `I'll merge category "${
              args.sourceCategoryName || args.sourceCategoryId
            }" into "${
              args.targetCategoryName || args.targetCategoryId
            }". The source category will be deleted and all transactions moved. Would you like to proceed?`;
            pendingAction = { action: 'merge_categories', ...args };
            break;
          case 'batch_execute':
            // Handle batch execute by showing all operations
            let batchMessage = "I'll perform the following operations:\n\n";
            args.operations.forEach((op: any, index: number) => {
              switch(op.action) {
                case 'create_category':
                  batchMessage += `${index + 1}. Create category "${op.params.name}" (${op.params.type})\n`;
                  break;
                case 'update_category':
                  batchMessage += `${index + 1}. Update category "${op.params.categoryName || op.params.categoryId}"\n`;
                  break;
                case 'delete_category':
                  batchMessage += `${index + 1}. Delete category "${op.params.categoryName || op.params.categoryId}"\n`;
                  break;
                case 'merge_categories':
                  batchMessage += `${index + 1}. Merge "${op.params.sourceCategoryName || op.params.sourceCategoryId}" into "${op.params.targetCategoryName || op.params.targetCategoryId}"\n`;
                  break;
                default:
                  batchMessage += `${index + 1}. ${op.action} operation\n`;
              }
            });
            batchMessage += "\nWould you like to proceed with all these operations?";
            
            confirmationMessage = batchMessage;
            pendingAction = { action: 'batch_execute', operations: args.operations };
            break;
          default:
            // For tools that don't require confirmation
            setMessages((prev) => [
              ...prev.slice(0, -1), // remove 'Thinking...'
              {
                role: "assistant",
                content: aiResponse || `I'll ${functionName.replace('_', ' ')} based on your request.`,
              },
            ]);
            return;
        }
        
        // Set confirmation message
        setMessages((prev) => [
          ...prev.slice(0, -1), // remove 'Thinking...'
          {
            role: "assistant",
            content: confirmationMessage,
            showConfirmation: true,
            pendingAction: pendingAction,
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

            if (action.action === "assign_parent_category") {
              pendingAction = action;
              showConfirmation = true;
            } else {
              const result = await executeAction(action);
              aiResponse += `\n\n${result}`;
            }
          } catch {
            aiResponse += "\n\n[Error parsing action JSON]";
          }
        }

        setMessages((prev) => [
          ...prev.slice(0, -1), // remove 'Thinking...'
          {
            role: "assistant",
            content: aiResponse,
            showConfirmation,
            pendingAction,
          },
        ]);
        return;
      }

      // Default fallback
      if (!aiResponse) {
        aiResponse = "Sorry, I could not generate a response.";
      }

      setMessages((prev) => [
        ...prev.slice(0, -1), // remove 'Thinking...'
        {
          role: "assistant",
          content: aiResponse,
        },
      ]);
    } catch (err) {
      console.error("API Error:", err); // Debug log
      setMessages((prev) => [
        ...prev.slice(0, -1),
        { role: "assistant", content: "Sorry, there was an error contacting the AI." },
      ]);
    }
  };

  const handleConfirmTool = async () => {
    if (!pendingToolArgs || pendingToolQueue.length === 0) return;
    let result: any;
    if (pendingToolArgs.type === "create_category") {
      try {
        const categoryData = {
          name: pendingToolArgs.args.name,
          type: pendingToolArgs.args.type,
          parent_id: pendingToolArgs.args.parent_id || null,
        };

        result = await addCategory(categoryData);
        if (result) {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: `Category "${pendingToolArgs.args.name}" (${pendingToolArgs.args.type}) has been created! Would you like to create another category or assign this one to a parent category?`,
            },
          ]);
        } else {
          const errorMessage = storeError || 'Failed to create category';
          setMessages((prev) => [...prev, { role: "assistant", content: `Error creating category: ${errorMessage}` }]);
        }
      } catch (error) {
        setMessages((prev) => [...prev, { role: "assistant", content: `Error creating category: ${error instanceof Error ? error.message : 'Unknown error'}` }]);
      }
    } else if (pendingToolArgs.type === "update_category") {
      try {
        const updates: any = {};
        if (pendingToolArgs.args.name) updates.name = pendingToolArgs.args.name;
        if (pendingToolArgs.args.type) updates.type = pendingToolArgs.args.type;
        if (pendingToolArgs.args.parent_id !== undefined) updates.parent_id = pendingToolArgs.args.parent_id;

        result = await updateCategory(pendingToolArgs.args.categoryId, updates);
        if (result) {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: `Category "${pendingToolArgs.args.categoryId}" has been updated. Is there anything else you'd like to change about this category?`,
            },
          ]);
        } else {
          const errorMessage = storeError || 'Failed to update category';
          setMessages((prev) => [...prev, { role: "assistant", content: `Error updating category: ${errorMessage}` }]);
        }
      } catch (error) {
        setMessages((prev) => [...prev, { role: "assistant", content: `Error updating category: ${error instanceof Error ? error.message : 'Unknown error'}` }]);
      }
    } else if (pendingToolArgs.type === "assign_parent_category") {
      result = await assignParentCategory(pendingToolArgs.args.childCategoryId, pendingToolArgs.args.parentCategoryId);
      if (result.success) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `Assigned "${pendingToolArgs.args.childCategoryId}" as a subcategory of "${pendingToolArgs.args.parentCategoryId}". Would you like to organize any other categories?`,
          },
        ]);
      } else {
        setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${result.error}` }]);
      }
    } else if (pendingToolArgs.type === "delete_category") {
      try {
        result = await deleteCategory(pendingToolArgs.args.categoryId);
        if (result) {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: `Category "${pendingToolArgs.args.categoryId}" has been deleted. Would you like to make any other changes to your categories?`,
            },
          ]);
        } else {
          const errorMessage = storeError || 'Failed to delete category';
          setMessages((prev) => [...prev, { role: "assistant", content: `Error deleting category: ${errorMessage}` }]);
        }
      } catch (error) {
        setMessages((prev) => [...prev, { role: "assistant", content: `Error deleting category: ${error instanceof Error ? error.message : 'Unknown error'}` }]);
      }
    } else if (pendingToolArgs.type === "change_category_type") {
      result = await changeCategoryType(pendingToolArgs.args.categoryId, pendingToolArgs.args.newType);
      if (result.success) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `Category "${pendingToolArgs.args.categoryId}" type has been changed to "${pendingToolArgs.args.newType}". Would you like to make any other changes to your categories?`,
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `Error changing category type: ${result.error}` },
        ]);
      }
    }
    // Remove the first tool from the queue and set up the next one
    const newQueue = pendingToolQueue.slice(1);
    setPendingToolQueue(newQueue);
    if (newQueue.length > 0) {
      const nextTool = newQueue[0];
      if (nextTool.function?.name === "create_category") {
        setPendingToolArgs({ type: "create_category", args: JSON.parse(nextTool.function.arguments) });
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `To confirm, I will create a new category named "${
              JSON.parse(nextTool.function.arguments).name
            }" with type "${JSON.parse(nextTool.function.arguments).type}". Please press confirm.`,
          },
        ]);
      } else if (nextTool.function?.name === "update_category") {
        setPendingToolArgs({ type: "update_category", args: JSON.parse(nextTool.function.arguments) });
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `To confirm, I will update the category "${JSON.parse(nextTool.function.arguments).categoryId}". Please press confirm.`,
          },
        ]);
      } else if (nextTool.function?.name === "assign_parent_category") {
        setPendingToolArgs({ type: "assign_parent_category", args: JSON.parse(nextTool.function.arguments) });
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `To confirm, I will assign "${
              JSON.parse(nextTool.function.arguments).childCategoryId
            }" as a subcategory of "${JSON.parse(nextTool.function.arguments).parentCategoryId}". Please press confirm.`,
          },
        ]);
      } else if (nextTool.function?.name === "delete_category") {
        setPendingToolArgs({ type: "delete_category", args: JSON.parse(nextTool.function.arguments) });
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `To confirm, I will delete the category "${
              JSON.parse(nextTool.function.arguments).categoryId
            }". Please press confirm.`,
          },
        ]);
      } else if (nextTool.function?.name === "change_category_type") {
        setPendingToolArgs({ type: "change_category_type", args: JSON.parse(nextTool.function.arguments) });
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `To confirm, I will change the type of category "${
              JSON.parse(nextTool.function.arguments).categoryId
            }" to "${JSON.parse(nextTool.function.arguments).newType}". Please press confirm.`,
          },
        ]);
      }
    } else {
      setPendingToolArgs(null);
    }
  };

  useEffect(() => {
    function handleGlobalKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        if (pendingToolArgs) {
          handleConfirmTool();
        }
      }
    }
    if (pendingToolArgs) {
      window.addEventListener("keydown", handleGlobalKeyDown);
    }
    return () => {
      window.removeEventListener("keydown", handleGlobalKeyDown);
    };
  }, [pendingToolArgs]);

  // Helper function to identify vague prompts
  const isVaguePrompt = (message: string): boolean => {
    const vaguePatterns = [
      /^add\s+category$/i, // "Add category"
      /^new\s+category$/i, // "New category"
      /^create\s+category$/i, // "Create category"
      /^delete\s+(\w+)$/i, // "Delete Test", etc.
      /^update\s+(\w+)$/i, // "Update category", etc.
      /^change\s+(\w+)$/i, // "Change type", etc.
      /^move\s+(\w+)$/i, // "Move category", etc.
    ];
    
    return vaguePatterns.some(pattern => pattern.test(message.trim()));
  };
  
  // Helper function to identify multi-action prompts
  const isMultiActionPrompt = (message: string): boolean => {
    // Check for multiple verbs
    const commonVerbs = ['create', 'add', 'delete', 'remove', 'update', 'move', 'rename', 'change'];
    
    // Count occurrences of common verbs
    const verbCount = commonVerbs.reduce((count, verb) => {
      const regex = new RegExp(`\\b${verb}\\b`, 'gi');
      const matches = message.match(regex);
      return count + (matches ? matches.length : 0);
    }, 0);
    
    // Check for and/then patterns
    const hasConjunctions = /\band\b|\bthen\b|\bafter\b/i.test(message);
    
    // Check for commas with conjunctions
    const hasCommaLists = /,\s*and\b/i.test(message);
    
    // Check for numbered lists
    const hasNumberedList = /\d+\.|\(\d+\)/.test(message);
    
    // Check for multiple items in a list
    const multipleItems = (message.match(/,/g) || []).length >= 2;
    
    return (verbCount > 1) || hasConjunctions || hasCommaLists || hasNumberedList || multipleItems;
  };
  
  // Helper function to handle ambiguous or vague requests
  const handleVaguePrompt = (userMessage: string) => {
    let clarificationMessage = "I'd be happy to help with that, but I need a bit more information:";
    
    if (/add|create|new/i.test(userMessage) && /category|account/i.test(userMessage)) {
      clarificationMessage = "I'd be happy to create a new category for you. Could you please provide:\n\n" +
        "1. The complete name for the category\n" +
        "2. What type it should be (Asset, Liability, Equity, Revenue, COGS, Expense)\n" +
        "3. Should it be a subcategory under another category? If so, which one?";
    } else if (/delete|remove/i.test(userMessage)) {
      clarificationMessage = "I'd be happy to delete that for you, but I need to know exactly what you want to delete:\n\n" +
        "1. The complete name of the category you want to delete\n" +
        "2. Are you sure you want to permanently remove it?";
    } else if (/update|change|modify/i.test(userMessage)) {
      clarificationMessage = "I'd be happy to make that change, but I need more specifics:\n\n" +
        "1. The exact name of the category you want to change\n" +
        "2. What specific changes would you like to make?";
    } else if (/move/i.test(userMessage)) {
      clarificationMessage = "I'd be happy to help move a category. Could you please specify:\n\n" +
        "1. Which category you want to move\n" +
        "2. Where you want to move it (under which parent category, or to the root level)";
    } else if (/merge/i.test(userMessage)) {
      clarificationMessage = "I'd be happy to help merge categories. Could you please specify:\n\n" +
        "1. Which two categories you want to merge\n" +
        "2. Which category should be kept (target) and which should be removed (source)\n" +
        "3. Note: All transactions from the source category will be moved to the target category";
    }
    
    setMessages((prev) => [...prev, {
      role: "assistant",
      content: clarificationMessage
    }]);
  };

  const panelStyle = {
    width: isOpen ? panelWidth : 0,
    transition: isResizing ? "none" : "width 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
    minWidth: isOpen ? MIN_PANEL_WIDTH : 0,
    maxWidth: MAX_PANEL_WIDTH,
    overflow: "hidden",
    boxShadow: isOpen ? "rgba(0,0,0,0.1) 0px 0px 16px" : "none",
    background: "white",
    height: "100%",
    display: "flex",
    flexDirection: "column" as const,
    borderLeft: isOpen ? "1px solid #e5e7eb" : "none",
    position: "relative" as const,
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div style={panelStyle} className={isResizing ? "select-none" : ""}>
      <div className="flex h-full flex-col bg-white shadow-xl text-xs">
        <div className="px-4 py-6 sm:px-6 bg-gray-50 border-b border-gray-200">
          <div className="flex items-start justify-between">
            <div className="font-semibold leading-6 text-gray-900 text-xs">🤖 Agent</div>
            <div className="ml-3 flex h-7 items-center space-x-2">
              <button
                onClick={() => setProactiveMode(!proactiveMode)}
                className={`px-2 py-1 rounded text-xs font-medium transition-colors border ${
                  proactiveMode
                    ? "bg-gray-900 text-white border-gray-900 hover:bg-gray-800"
                    : "bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200"
                }`}
                title={
                  proactiveMode
                    ? "Continuous mode ON - I'll proactively suggest improvements"
                    : "Continuous mode OFF - I'll only respond when asked"
                }
              >
                {proactiveMode ? "🔄 Continuous" : "⏸️ Manual"}
              </button>
              <button
                type="button"
                className="rounded-md bg-white text-gray-400 hover:text-gray-500 p-1"
                onClick={() => setIsOpen(false)}
              >
                <span className="sr-only">Close panel</span>
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 bg-white">
          <div className="space-y-4">
            {messages.map((message, index) => (
              <div key={index} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`rounded-lg px-4 py-3 max-w-[85%] shadow-sm border ${
                    message.role === "user" 
                      ? "bg-gray-50 border-gray-200 text-gray-900" 
                      : "bg-white border-gray-200 text-gray-800"
                  }`}
                >
                  <div
                    className={`whitespace-pre-line leading-relaxed ${
                      message.role === "user" ? "text-sm font-medium" : "text-sm font-normal"
                    }`}
                    style={{
                      fontFamily:
                        message.role === "assistant"
                          ? "ui-sans-serif, system-ui, -apple-system, sans-serif"
                          : "inherit",
                    }}
                  >
                    {message.content}
                  </div>

                  {/* Confirmation buttons */}
                  {message.showConfirmation && message.pendingAction && (
                    <div className="mt-4 flex gap-3 border-t border-gray-100 pt-3">
                      <button
                        onClick={() => handleConfirm(index)}
                        className="px-4 py-2 bg-gray-900 text-white rounded-md text-sm font-medium hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-1 transition-colors duration-200 shadow-sm"
                      >
                        ✓ Confirm
                      </button>
                      <button
                        onClick={() => handleCancel(index)}
                        className="px-4 py-2 bg-gray-100 text-gray-700 border border-gray-300 rounded-md text-sm font-medium hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-1 transition-colors duration-200 shadow-sm"
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
                className="bg-gray-900 text-white px-3 py-2 rounded-md hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-400 transition-all duration-100 flex items-center gap-2 text-xs font-medium animate-pulse"
                style={{ animationDuration: "2s" }}
                onClick={handleConfirmTool}
              >
                Confirm
                <span className="ml-2 inline-block bg-gray-100 text-gray-700 text-[10px] px-1.5 py-0.5 rounded font-mono border border-gray-300">
                  ⌘↵
                </span>
              </button>
            </div>
          )}
        </div>

        <div className="border-t border-gray-200 px-4 py-6 sm:px-6 text-xs bg-gray-50">
          {/* Quick suggestions for new users */}
          {messages.length <= 1 && (
            <div className="mb-3 text-xs text-gray-600">
              <div className="text-gray-500 mb-2">💡 Try asking:</div>
              <div className="space-y-1">
                <button
                  onClick={() => {
                    setInputMessage("What categories should I create for my business?");
                    updateActivityTime();
                  }}
                  className="block w-full text-left px-2 py-1 rounded text-gray-700 hover:bg-gray-100 transition-colors border border-gray-200 bg-white"
                >
                  • What categories should I create for my business?
                </button>
                <button
                  onClick={() => {
                    setInputMessage("How can I organize my expense categories better?");
                    updateActivityTime();
                  }}
                  className="block w-full text-left px-2 py-1 rounded text-gray-700 hover:bg-gray-100 transition-colors border border-gray-200 bg-white"
                >
                  • How can I organize my expense categories better?
                </button>
                <button
                  onClick={() => {
                    setInputMessage("What's the best way to structure my chart of accounts?");
                    updateActivityTime();
                  }}
                  className="block w-full text-left px-2 py-1 rounded text-gray-700 hover:bg-gray-100 transition-colors border border-gray-200 bg-white"
                >
                  • What&apos;s the best way to structure my chart of accounts?
                </button>
              </div>
            </div>
          )}
          <div className="flex space-x-2">
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => {
                setInputMessage(e.target.value);
                updateActivityTime();
              }}
              onKeyPress={(e) => e.key === "Enter" && handleSendMessage()}
              placeholder="Ask me anything about your accounting setup..."
              className="flex-1 rounded-md border border-gray-300 px-3 py-2 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 text-xs"
            />
            <button
              onClick={handleRefreshContext}
              className="rounded-md bg-gray-100 text-gray-700 border border-gray-300 px-3 py-2 hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 text-xs flex items-center"
              title="Clear chat context"
            >
              <RefreshCcw className="h-4 w-4" />
            </button>
            <button
              onClick={handleSendMessage}
              className="rounded-md bg-gray-900 px-4 py-2 text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 text-xs"
            >
              Send
            </button>
          </div>
        </div>
      </div>
      <div
        ref={resizeRef}
        className={`absolute left-0 top-0 h-full w-0.5 cursor-ew-resize group ${
          isResizing ? "bg-gray-500" : "bg-gray-200 hover:bg-gray-400"
        } transition-colors duration-200`}
        onMouseDown={handleResizeStart}
        title="Drag to resize panel"
      ></div>
      {isResizing && <div className="fixed inset-0 z-50 cursor-ew-resize" style={{ background: "transparent" }} />}
    </div>
  );
}
