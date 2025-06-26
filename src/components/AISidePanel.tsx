/* Use of 'any' types are intentional here due to the dynamic nature of the AI tool responses 
and the complex interaction between multiple imported type definitions from different files. */

/* eslint-disable @typescript-eslint/no-explicit-any */

"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { X, RefreshCcw, ArrowUpCircle } from "lucide-react";
import { useCategoriesStore } from "@/zustand/categoriesStore";
import { usePayeesStore } from "@/zustand/payeesStore";
import { useAuthStore } from "@/zustand/authStore";
import { supabase } from "@/lib/supabase";
import { api } from "@/lib/api";
import { tools } from "@/ai/tools";
import { categoryPrompt } from "@/ai/prompts";

const MIN_PANEL_WIDTH = 320;
const MAX_PANEL_WIDTH = 600;
const DEFAULT_PANEL_WIDTH = 400;

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

export default function AISidePanel({ isOpen, setIsOpen }: AISidePanelProps) {
  const [messages, setMessages] = useState<Message[]>(() => {
    if (typeof window === "undefined") return [];
    
    try {
      const saved = localStorage.getItem("aiChatMessages");
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (error) {
      console.error("Error parsing saved messages:", error);
      localStorage.removeItem("aiChatMessages");
      return [];
    }
    // Return welcome message for new users
    return [
      {
        role: "assistant",
        content: `How can I help?`,
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
    moveCategory
  } = useCategoriesStore();
  
  // Use the payees store for payee operations
  const { 
    payees, 
    refreshPayees: refreshPayeesFromStore,
    addPayee,
    updatePayee,
    deletePayee,
    error: payeesError
  } = usePayeesStore();
  
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
• **Check for duplicates**: I can help identify any similar categories that could be consolidated
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
    setMessages([
      {
        role: "assistant",
        content: `How can I help?`,
      },
    ]);
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
        console.log('Creating category with action:', action); // Debug log
        console.log('Current company:', currentCompany); // Debug log
        
        // The store now handles parent names directly, so we can pass either parentName or parent_id
        let parentId = action.parent_id || action.parentName || null;
        
        const categoryData = {
          name: action.name!,
          type: action.type!,
          parent_id: parentId,
          company_id: currentCompany!.id,
        };

        console.log('Category data being sent:', categoryData); // Debug log

        const result = await addCategory(categoryData);
        
        if (result) {
          return `Successfully created category '${action.name}' with type '${action.type}'.`;
        } else {
          const errorMessage = storeError || 'Failed to create category';
          return `Error creating category: ${errorMessage}`;
        }
      } catch (error) {
        return `Error creating category: ${error instanceof Error ? error.message : 'Unknown error'}`;
      }
    }

    if (action.action === "update_category") {
      try {
        // The store now handles both ID and name, so we can pass either directly
        let categoryIdOrName = action.categoryId || action.categoryName;
        
        if (!categoryIdOrName) {
          return 'Category ID or name is required for update';
        }
        
        const updates: any = {};
        if (action.name) updates.name = action.name;
        if (action.type) updates.type = action.type;
        if (action.parent_id !== undefined) updates.parent_id = action.parent_id;

        console.log('Executing update_category:', { categoryIdOrName, updates, action }); // Debug log
        
        const result = await updateCategory(categoryIdOrName, updates);
        
        // Wait a moment for any API errors to propagate
        await new Promise(resolve => setTimeout(resolve, 100));
        
        console.log('Update result:', result, 'Store error:', storeError); // Debug log
        
        if (result) {
          // Double-check that the store error hasn't been set by API failure
          if (storeError) {
            console.error('Update appeared successful but store has error:', storeError); // Debug log
            return `Error updating category: ${storeError}`;
          }
          
          // Be more specific about what was updated
          const updateDetails = [];
          if (updates.name) updateDetails.push(`name to "${updates.name}"`);
          if (updates.type) updateDetails.push(`type to "${updates.type}"`);
          if (updates.parent_id !== undefined) {
            updateDetails.push(updates.parent_id ? `parent category` : `removed parent`);
          }
          
          const detailsText = updateDetails.length > 0 ? ` (${updateDetails.join(', ')})` : '';
          return `Successfully updated category "${action.categoryName || categoryIdOrName}"${detailsText}. Changes should be reflected in the database and UI.`;
        } else {
          const errorMessage = storeError || 'Failed to update category - no specific error available';
          console.error('Update failed:', errorMessage); // Debug log
          return `Error updating category "${action.categoryName || categoryIdOrName}": ${errorMessage}. Please check if the category name already exists or refresh the page.`;
        }
      } catch (error) {
        console.error('Exception in update_category:', error); // Debug log
        return `Error updating category: ${error instanceof Error ? error.message : 'Unknown error'}`;
      }
    }

    if (action.action === "delete_category") {
      try {
        // The store now handles both ID and name, so we can pass either directly
        let categoryIdOrName = action.categoryId || action.categoryName;
        
        // Handle different possible field names for category name
        if (!categoryIdOrName) {
          categoryIdOrName = action.name || action.category || action.category_name;
        }
        
        console.log('Delete category debug:', { 
          action, 
          categoryIdOrName, 
          availableCategories: categoriesToUse.map(c => ({ id: c.id, name: c.name }))
        }); // Debug log
        
        if (!categoryIdOrName) {
          return 'Category ID or name is required for deletion';
        }
        
        console.log('Deleting category:', { categoryIdOrName, action }); // Debug log
        
        const result = await deleteCategory(categoryIdOrName);
        
        if (result) {
          return `Successfully deleted category '${categoryIdOrName}'.`;
        } else {
          const errorMessage = storeError || 'Failed to delete category';
          return `Error deleting category: ${errorMessage}`;
        }
      } catch (error) {
        return `Error deleting category: ${error instanceof Error ? error.message : 'Unknown error'}`;
      }
    }

    if (action.action === "change_category_type") {
      // The store now handles both ID and name, so we can pass either directly
      let categoryIdOrName = action.categoryId || action.categoryName;
      
      if (!categoryIdOrName) {
        return 'Category ID or name is required to change type';
      }

      const result = await updateCategory(categoryIdOrName, { type: action.newType });

      if (result) {
        if (!skipRefresh) {
          await refreshCategories();
        }
        return `Successfully changed category '${action.categoryName || categoryIdOrName}' type to '${action.newType}'.`;
      } else {
        return `Error changing category type: ${storeError || 'Unknown error'}`;
      }
    }

    if (action.action === "assign_parent_category") {
      // The store now handles both ID and name, so we can pass either directly
      let childIdOrName = action.childCategoryId || action.childCategoryName;
      let parentIdOrName = action.parentCategoryId || action.parentCategoryName;
      
      if (!childIdOrName || !parentIdOrName) {
        return 'Both child and parent category IDs/names are required';
      }

      const result = await updateCategory(childIdOrName, { parent_id: parentIdOrName });

      if (result) {
        if (!skipRefresh) {
          await refreshCategories();
        }
        return `Successfully assigned category '${action.childCategoryName || childIdOrName}' under parent category '${action.parentCategoryName || parentIdOrName}'.`;
      } else {
        return `Error assigning category: ${storeError || 'Unknown error'}`;
      }
    }

    if (action.action === "create_payee") {
      try {
        const payeeData = {
          name: action.name.trim(),
        };

        // Call the API route
        const response = await api.post('/api/payee', payeeData);
        
        if (!response.ok) {
          const errorData = await response.json();
          console.error('API error adding payee:', errorData.error);
          return `Error creating payee: ${errorData.error || 'Failed to add payee'}`;
        }
        
        const result = await response.json();
        const newPayee = result.payee;
        
        // Refresh payees to get updated list
        await refreshPayeesFromStore();
        
        return `Successfully created payee '${action.name}'.`;
      } catch (error) {
        return `Error creating payee: ${error instanceof Error ? error.message : 'Unknown error'}`;
      }
    }

    if (action.action === "update_payee") {
      try {
        // The store handles both ID and name, so we can pass either directly
        let payeeIdOrName = action.payeeId || action.payeeName;
        
        if (!payeeIdOrName) {
          return 'Payee ID or name is required for update';
        }
        
        const result = await updatePayee(payeeIdOrName, { name: action.name });
        
        if (result) {
          return `Successfully updated payee '${action.payeeName || payeeIdOrName}' to '${action.name}'.`;
        } else {
          const errorMessage = payeesError || 'Failed to update payee';
          return `Error updating payee: ${errorMessage}`;
        }
      } catch (error) {
        return `Error updating payee: ${error instanceof Error ? error.message : 'Unknown error'}`;
      }
    }

    if (action.action === "delete_payee") {
      try {
        // The store handles both ID and name, so we can pass either directly
        let payeeIdOrName = action.payeeId || action.payeeName;
        
        if (!payeeIdOrName) {
          return 'Payee ID or name is required for deletion';
        }
        
        const result = await deletePayee(payeeIdOrName);
        
        if (result) {
          return `Successfully deleted payee '${payeeIdOrName}'.`;
        } else {
          const errorMessage = payeesError || 'Failed to delete payee';
          return `Error deleting payee: ${errorMessage}`;
        }
      } catch (error) {
        return `Error deleting payee: ${error instanceof Error ? error.message : 'Unknown error'}`;
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
        let currentMessage = message.content + "\n\n**Executing batch operations:**\n";

        // Check if we have currentCompany
        if (!currentCompany) {
          setMessages((prev) =>
            prev.map((msg, idx) =>
              idx === messageIndex
                ? {
                    ...msg,
                    content: msg.content + "\n\n**Error:** No company context available. Please refresh the page and try again.",
                    showConfirmation: false,
                    pendingAction: undefined,
                  }
                : msg
            )
          );
          return;
        }

        console.log('Starting batch execution with company:', currentCompany.id); // Debug log

        // Update message to show it's executing
        setMessages((prev) =>
          prev.map((msg, idx) =>
            idx === messageIndex
              ? { ...msg, content: currentMessage, showConfirmation: false, pendingAction: undefined }
              : msg
          )
        );
        
        let allSuccessful = true;
        let failedOperations: string[] = [];

        // Execute each operation in sequence
        for (let i = 0; i < operations.length; i++) {
          const operation = operations[i];
          try {
            // Update to show current operation being processed
            const processingMessage = currentMessage + `\nProcessing operation ${i + 1}...`;
            setMessages((prev) =>
              prev.map((msg, idx) => (idx === messageIndex ? { ...msg, content: processingMessage } : msg))
            );

            // Create action from operation
            const action = { 
              action: operation.action, 
              ...(operation.params || operation) 
            };
            
            // Add company_id for category operations if not present
            if (action.action === 'create_category' && !action.company_id && currentCompany) {
              action.company_id = currentCompany.id;
            }
            
            console.log('Executing batch operation:', action); // Debug log
            console.log('Original operation:', operation); // Debug log for operation structure
            
            const result = await executeAction(action, true, categories);
            
            results.push(`${i + 1}. ${result}`);
            currentMessage += `${i + 1}. ${result}\n`;

            // Check if operation was not successful - improved error detection
            if (result.toLowerCase().includes('error') || 
                result.toLowerCase().includes('failed') || 
                result.toLowerCase().includes('could not') ||
                result.toLowerCase().includes('required') ||
                result.toLowerCase().includes('not found') ||
                result.toLowerCase().includes('unable to')) {
              allSuccessful = false;
              failedOperations.push(`Operation ${i + 1}: ${result}`);
            }

            // Small delay to ensure UI updates are processed
            await new Promise((resolve) => setTimeout(resolve, 200));

            // Update message with progress
            setMessages((prev) =>
              prev.map((msg, idx) => (idx === messageIndex ? { ...msg, content: currentMessage } : msg))
            );
          } catch (error) {
            allSuccessful = false;
            const errorMessage = `Error: ${error}`;
            results.push(`${i + 1}. ${errorMessage}`);
            currentMessage += `${i + 1}. ${errorMessage}\n`;
            failedOperations.push(`Operation ${i + 1}: ${errorMessage}`);

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

        // Final message update with detailed error reporting
        if (allSuccessful) {
          currentMessage += `\n**All batch operations completed successfully!**`;
          currentMessage += `\n\nIs there anything else you'd like to do with your categories or accounting setup?`;
        } else {
          currentMessage += `\n**Batch operations completed with ${failedOperations.length} error(s):**`;
          failedOperations.forEach(error => {
            currentMessage += `\n- ${error}`;
          });
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
                  content: msg.content + `\n\n**Confirming and executing...**`,
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
                      "**Confirming and executing...**",
                      `**Confirmed and executed:** ${result}`
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
                    content: msg.content.replace("**Confirming and executing...**", `**Error:** ${error}`),
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
              content: msg.content + "\n\n**Cancelled:** Action was not executed.",
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
        content: `Current categories in the system:
${categories.map((c) => `- ${c.name} (${c.type})${c.parent_id ? ` - child of ${categories.find(p => p.id === c.parent_id)?.name || 'unknown parent'}` : ''}`).join('\n')}

Current payees in the system:
${payees.map((p) => `- ${p.name}`).join('\n')}

Available category names: ${categories.map((c) => c.name).join(", ")}
Available payee names: ${payees.map((p) => p.name).join(", ")}

IMPORTANT: Use the appropriate tools for any data modification operations. For multiple related operations, use batch_execute to group them together efficiently.`
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
          model: "gpt-3.5-turbo",
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
            } else if (functionName === "create_payee") {
              confirmationMessage += `${index + 1}. Create payee "${args.name}"\n`;
            } else if (functionName === "update_payee") {
              confirmationMessage += `${index + 1}. Update payee "${args.payeeName || args.payeeId}" to "${args.name}"\n`;
            } else if (functionName === "delete_payee") {
              confirmationMessage += `${index + 1}. Delete payee "${args.payeeName || args.payeeId}"\n`;
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
          case 'create_payee':
            confirmationMessage = `I'll create a new payee named "${args.name}". Would you like to proceed?`;
            pendingAction = { action: 'create_payee', ...args };
            break;
          case 'update_payee':
            confirmationMessage = `I'll update the payee "${args.payeeName || args.payeeId}" to "${args.name}". Would you like to proceed?`;
            pendingAction = { action: 'update_payee', ...args };
            break;
          case 'delete_payee':
            confirmationMessage = `I'll delete the payee "${args.payeeName || args.payeeId}". Would you like to proceed?`;
            pendingAction = { action: 'delete_payee', ...args };
            break;
          case 'batch_execute':
            // Handle batch execute by showing all operations
            let batchMessage = "I'll perform the following operations:\n\n";
            let hasAutoCreation = false;
            
            args.operations.forEach((op: any, index: number) => {
              // Safely access parameters with fallbacks
              const params = op.params || op;
              
              switch(op.action) {
                case 'create_category':
                  const categoryName = params.name || 'Unknown Category';
                  const categoryType = params.type || 'Unknown Type';
                  const isAutoCreation = !categories.find(c => c.name.toLowerCase() === categoryName.toLowerCase());
                  if (isAutoCreation) {
                    hasAutoCreation = true;
                    batchMessage += `${index + 1}. Auto-create category "${categoryName}" (${categoryType}) - category doesn't exist yet\n`;
                  } else {
                    batchMessage += `${index + 1}. Create category "${categoryName}" (${categoryType})\n`;
                  }
                  break;
                case 'update_category':
                  const updateCategoryName = params.categoryName || params.categoryId || 'Unknown Category';
                  batchMessage += `${index + 1}. Update category "${updateCategoryName}"\n`;
                  break;
                case 'delete_category':
                  const deleteCategoryName = params.categoryName || params.categoryId || 'Unknown Category';
                  batchMessage += `${index + 1}. Delete category "${deleteCategoryName}"\n`;
                  break;
                case 'create_payee':
                  const payeeName = params.name || 'Unknown Payee';
                  batchMessage += `${index + 1}. Create payee "${payeeName}"\n`;
                  break;
                case 'update_payee':
                  const updatePayeeName = params.payeeName || params.payeeId || 'Unknown Payee';
                  const newPayeeName = params.name || 'Unknown Name';
                  batchMessage += `${index + 1}. Update payee "${updatePayeeName}" to "${newPayeeName}"\n`;
                  break;
                case 'delete_payee':
                  const deletePayeeName = params.payeeName || params.payeeId || 'Unknown Payee';
                  batchMessage += `${index + 1}. Delete payee "${deletePayeeName}"\n`;
                  break;
                case 'assign_parent_category':
                  const childName = params.childCategoryName || params.childCategoryId || 'Unknown Child';
                  const parentName = params.parentCategoryName || params.parentCategoryId || 'Unknown Parent';
                  batchMessage += `${index + 1}. Move "${childName}" under "${parentName}"\n`;
                  break;
                case 'change_category_type':
                  const changeCategoryName = params.categoryName || params.categoryId || 'Unknown Category';
                  const newType = params.newType || 'Unknown Type';
                  batchMessage += `${index + 1}. Change "${changeCategoryName}" type to "${newType}"\n`;
                  break;
                default:
                  batchMessage += `${index + 1}. ${op.action} operation\n`;
              }
            });
            
            if (hasAutoCreation) {
              batchMessage += "\nI detected that some categories don't exist yet, so I'll create them first before performing the main operations.";
            }
            
            batchMessage += "\nWould you like to proceed with all these operations?";
            
            confirmationMessage = batchMessage;
            pendingAction = { action: 'batch_execute', operations: args.operations };
            break;
          default:
            // All tool calls must go through confirmation - no exceptions
            confirmationMessage = `I'll ${functionName.replace('_', ' ')} based on your request. Would you like to proceed?`;
            pendingAction = { action: functionName, ...args };
            break;
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
        // The store now handles both ID and name, so we can pass either directly
        let categoryIdOrName = pendingToolArgs.args.categoryId || pendingToolArgs.args.categoryName;
        
        // Handle different possible field names for category name
        if (!categoryIdOrName) {
          categoryIdOrName = pendingToolArgs.args.name || pendingToolArgs.args.category || pendingToolArgs.args.category_name;
        }
        
        console.log('Delete category debug:', { 
          action: pendingToolArgs, 
          categoryIdOrName, 
          availableCategories: categories.map((c: any) => ({ id: c.id, name: c.name }))
        }); // Debug log
        
        if (!categoryIdOrName) {
          setMessages((prev) => [...prev, { role: "assistant", content: 'Category ID or name is required for deletion' }]);
          return;
        }
        
        console.log('Deleting category:', { categoryIdOrName, pendingToolArgs }); // Debug log
        
        const result = await deleteCategory(categoryIdOrName);
        
        if (result) {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: `Category "${categoryIdOrName}" has been deleted. Would you like to make any other changes to your categories?`,
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
    } else if (pendingToolArgs.type === "update_payee") {
      result = await updatePayee(pendingToolArgs.args.payeeId, { name: pendingToolArgs.args.name });
      if (result) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `Payee "${pendingToolArgs.args.payeeId}" has been updated to "${pendingToolArgs.args.name}". Would you like to make any other changes to this payee?`,
          },
        ]);
      } else {
        const errorMessage = payeesError || 'Failed to update payee';
        setMessages((prev) => [...prev, { role: "assistant", content: `Error updating payee: ${errorMessage}` }]);
      }
    } else if (pendingToolArgs.type === "delete_payee") {
      result = await deletePayee(pendingToolArgs.args.payeeId);
      if (result) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `Payee "${pendingToolArgs.args.payeeId}" has been deleted. Would you like to make any other changes to your payees?`,
          },
        ]);
      } else {
        const errorMessage = payeesError || 'Failed to delete payee';
        setMessages((prev) => [...prev, { role: "assistant", content: `Error deleting payee: ${errorMessage}` }]);
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
      } else if (nextTool.function?.name === "create_payee") {
        setPendingToolArgs({ type: "create_payee", args: JSON.parse(nextTool.function.arguments) });
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `To confirm, I will create a new payee named "${
              JSON.parse(nextTool.function.arguments).name
            }". Please press confirm.`,
          },
        ]);
      } else if (nextTool.function?.name === "update_payee") {
        setPendingToolArgs({ type: "update_payee", args: JSON.parse(nextTool.function.arguments) });
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `To confirm, I will update the payee "${JSON.parse(nextTool.function.arguments).payeeId || JSON.parse(nextTool.function.arguments).payeeName}" to "${JSON.parse(nextTool.function.arguments).name}". Please press confirm.`,
          },
        ]);
      } else if (nextTool.function?.name === "delete_payee") {
        setPendingToolArgs({ type: "delete_payee", args: JSON.parse(nextTool.function.arguments) });
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `To confirm, I will delete the payee "${
              JSON.parse(nextTool.function.arguments).payeeId || JSON.parse(nextTool.function.arguments).payeeName
            }". Please press confirm.`,
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
      /^add\s+payee$/i, // "Add payee"
      /^new\s+payee$/i, // "New payee"
      /^create\s+payee$/i, // "Create payee"
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
    const commonVerbs = ['create', 'add', 'delete', 'remove', 'update', 'move', 'rename', 'change', 'group'];
    
    // Count occurrences of common verbs
    const verbCount = commonVerbs.reduce((count, verb) => {
      const regex = new RegExp(`\\b${verb}\\b`, 'gi');
      const matches = message.match(regex);
      return count + (matches ? matches.length : 0);
    }, 0);
    
    // Check for and/then patterns
    const hasConjunctions = /\band\b|\bthen\b|\bafter\b|\bwhile\b|\binto\b/i.test(message);
    
    // Check for commas with conjunctions
    const hasCommaLists = /,\s*and\b/i.test(message);
    
    // Check for numbered lists
    const hasNumberedList = /\d+\.|\(\d+\)/.test(message);
    
    // Check for multiple items in a list
    const multipleItems = (message.match(/,/g) || []).length >= 2;
    
    // Check for complex patterns like "Create X, Y, and Z as Type"
    const hasComplexList = /create\s+[^,]+(?:,\s*[^,]+)*\s+as\s+\w+/i.test(message);
    
    // Check for "Group X and Y under Z" patterns
    const hasGroupPattern = /group\s+[^,]+(?:,\s*[^,]+)*\s+under\s+\w+/i.test(message);
    
    // Check for "Add payees: X, Y, Z" patterns
    const hasPayeeListPattern = /add\s+payees?:\s*[^,]+(?:,\s*[^,]+)*/i.test(message);
    
    // Check for "Rename X to Y and move it under Z" patterns
    const hasRenameMovePattern = /rename\s+\w+\s+to\s+\w+\s+and\s+move/i.test(message);
    
    // Check for "Delete X, then create Y" patterns
    const hasDeleteThenCreate = /delete\s+\w+,\s*then\s+create/i.test(message);
    
    // Check for multiple category names in quotes or specific patterns
    const hasMultipleCategories = /["'][^"']+["']\s*(?:,\s*["'][^"']+["'])+/i.test(message);
    
    // Check for mixed operations like "Add payee X and create category Y"
    const hasMixedOperations = /add\s+payee\s+\w+\s+and\s+create/i.test(message);
    
    return (verbCount > 1) || 
           hasConjunctions || 
           hasCommaLists || 
           hasNumberedList || 
           multipleItems ||
           hasComplexList ||
           hasGroupPattern ||
           hasPayeeListPattern ||
           hasRenameMovePattern ||
           hasDeleteThenCreate ||
           hasMultipleCategories ||
           hasMixedOperations;
  };
  
  // Helper function to handle ambiguous or vague requests
  const handleVaguePrompt = (userMessage: string) => {
    let clarificationMessage = "I'd be happy to help with that, but I need a bit more information:";
    
    if (/add|create|new/i.test(userMessage) && /category|account/i.test(userMessage)) {
      clarificationMessage = "I'd be happy to create a new category for you. Could you please provide:\n\n" +
        "1. The complete name for the category\n" +
        "2. What type it should be (Asset, Liability, Equity, Revenue, COGS, Expense)\n" +
        "3. Should it be a subcategory under another category? If so, which one?";
    } else if (/add|create|new/i.test(userMessage) && /payee/i.test(userMessage)) {
      clarificationMessage = "I'd be happy to create a new payee for you. Could you please provide:\n\n" +
        "1. The complete name for the payee\n" +
        "2. Any additional details about the payee if relevant";
    } else if (/delete|remove/i.test(userMessage)) {
      clarificationMessage = "I'd be happy to delete that for you, but I need to know exactly what you want to delete:\n\n" +
        "1. The complete name of the category or payee you want to delete\n" +
        "2. Are you sure you want to permanently remove it?";
    } else if (/update|change|modify/i.test(userMessage)) {
      clarificationMessage = "I'd be happy to make that change, but I need more specifics:\n\n" +
        "1. The exact name of the category or payee you want to change\n" +
        "2. What specific changes would you like to make?";
    } else if (/move/i.test(userMessage)) {
      clarificationMessage = "I'd be happy to help move a category. Could you please specify:\n\n" +
        "1. Which category you want to move\n" +
        "2. Where you want to move it (under which parent category, or to the root level)";
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
      <div className="flex h-full flex-col bg-white shadow-xl font-sans text-xs">
        <div className="px-4 py-6 sm:px-6 bg-gray-50 border-b border-gray-200">
          <div className="flex items-start justify-between">
            <div className="font-semibold leading-6 text-gray-900 text-xs">Agent</div>
            <div className="ml-3 flex h-7 items-center space-x-2">
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
                  className={`rounded-lg px-4 py-3 max-w-[85%] border ${
                    message.role === "user" 
                      ? "bg-gray-50 border-gray-200 text-gray-900" 
                      : "bg-white border-gray-200 text-gray-800"
                  }`}
                >
                  <div
                    className={`whitespace-pre-line leading-relaxed text-xs ${
                      message.role === "user" ? "font-medium" : "font-normal"
                    }`}
                  >
                    {message.content}
                  </div>

                  {/* Confirmation buttons */}
                  {message.showConfirmation && message.pendingAction && (
                    <div className="mt-4 flex gap-3 border-t border-gray-100 pt-3">
                      <button
                        onClick={() => handleConfirm(index)}
                        className="px-4 py-2 bg-gray-900 text-white rounded-md text-xs font-medium hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-1 transition-colors duration-200 shadow-sm"
                      >
                        ✓ Confirm
                      </button>
                      <button
                        onClick={() => handleCancel(index)}
                        className="px-4 py-2 bg-gray-100 text-gray-700 border border-gray-300 rounded-md text-xs font-medium hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-1 transition-colors duration-200 shadow-sm"
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
                  }}
                  className="block w-full text-left px-2 py-1 rounded text-gray-700 hover:bg-gray-100 transition-colors border border-gray-200 bg-white text-xs"
                >
                  • What categories should I create for my business?
                </button>
                <button
                  onClick={() => {
                    setInputMessage("How can I organize my expense categories better?");
                  }}
                  className="block w-full text-left px-2 py-1 rounded text-gray-700 hover:bg-gray-100 transition-colors border border-gray-200 bg-white text-xs"
                >
                  • How can I organize my expense categories better?
                </button>
                <button
                  onClick={() => {
                    setInputMessage("What's the best way to structure my chart of accounts?");
                  }}
                  className="block w-full text-left px-2 py-1 rounded text-gray-700 hover:bg-gray-100 transition-colors border border-gray-200 bg-white text-xs"
                >
                  • What&apos;s the best way to structure my chart of accounts?
                </button>
              </div>
            </div>
          )}
          <div className="flex space-x-2 items-center">
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => {
                setInputMessage(e.target.value);
              }}
              onKeyPress={(e) => e.key === "Enter" && handleSendMessage()}
              placeholder="Message"
              className="flex-1 rounded-md border border-gray-300 px-3 py-2 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 text-xs"
            />
            <button
              onClick={handleSendMessage}
              className="rounded-md bg-gray-900 px-4 py-2 text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 text-xs flex items-center justify-center"
              aria-label="Send message"
            >
              <ArrowUpCircle className="w-5 h-5" />
            </button>
            <button
              onClick={handleRefreshContext}
              className="rounded-md bg-gray-100 text-gray-700 border border-gray-300 px-3 py-2 hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 text-xs flex items-center"
              title="Clear chat context"
            >
              <RefreshCcw className="h-4 w-4" />
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
