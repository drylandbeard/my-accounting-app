/* Use of 'any' types are intentional here due to the dynamic nature of the AI tool responses 
and the complex interaction between multiple imported type definitions from different files. */

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */

"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { X, RefreshCcw, ArrowUpCircle } from "lucide-react";
import { useCategoriesStore } from "@/zustand/categoriesStore";
import { usePayeesStore } from "@/zustand/payeesStore";
import { useAuthStore } from "@/zustand/authStore";
import { supabase } from "@/lib/supabase";
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
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  
  // Use the same Zustand store as the categories page for consistency
  const { 
    categories, 
    refreshCategories: refreshCategoriesFromStore, 
    addCategory,
    updateCategory,
    updateCategoryWithMergeCheck,
    deleteCategory,
    deleteCategoryWithValidation,
    mergeCategories,
    moveCategory,
    findCategoryByName,
    findCategoriesByName,
    checkBankAccountLinkage,
    error: storeError
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


  
  const [pendingToolQueue, setPendingToolQueue] = useState<any[]>([]);
  const [pendingToolArgs, setPendingToolArgs] = useState<any | null>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
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

  // Update activity time on user interaction
  const updateActivityTime = () => {
    // Activity tracking logic would go here
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

  // Add this helper function near the top of the file (after imports)
  function getFriendlySuccessMessage(action: string, details: any): string {
    switch (action) {
      case "create_category":
        return `All set! '${details.name}' has been added as an ${details.type}.`;
      case "update_category":
        return `Done! '${details.name}' has been updated.`;
      case "delete_category":
        return `'${details.name}' has been removed from your categories.`;
      case "move_category":
        return `'${details.categoryName}' has been moved to ${details.parentName}.`;
      case "change_category_type":
        return `Category type changed to ${details.newType}.`;
      case "merge_categories":
        return `Successfully merged ${details.sourceCount} categories into '${details.targetName}'.`;
      case "find_categories":
        return details.results || "Categories found.";
      case "check_category_usage":
        return details.message || "Category usage checked.";
      case "create_payee":
        return `Payee '${details.name}' has been added.`;
      case "update_payee":
        return `Payee '${details.name}' has been updated.`;
      case "delete_payee":
        return `Payee '${details.name}' has been removed.`;
      case "batch_execute":
        return `All done! Your batch of ${details.count} actions has been completed.`;
      default:
        return "Done!";
    }
  }

  // Robust executeAction function using all categoriesStore functions to prevent hallucinations
  async function executeAction(action: any, skipRefresh: boolean = false, customCategories?: any[]): Promise<string> {
    try {
      console.log('executeAction called with:', { action, skipRefresh }); // Debug log
      
      if (!currentCompany) {
        return "Error: No company selected. Please select a company first.";
      }

      const categoriesToUse = customCategories || categories;
      
      switch (action.action) {
        case "create_category": {
          // Validate required parameters
          if (!action.name || typeof action.name !== 'string') {
            return "Error: Category name is required and must be a string.";
          }
          if (!action.type || typeof action.type !== 'string') {
            return "Error: Category type is required and must be a string.";
          }
          
          // Handle parent lookup by name if provided
          let parentId = action.parent_id;
          if (action.parentName && !parentId) {
            const parentCategory = findCategoryByName(action.parentName);
            if (parentCategory) {
              parentId = parentCategory.id;
            } else {
              return `Error: Parent category "${action.parentName}" not found. Available categories: ${categories.map(c => c.name).join(', ')}`;
            }
          }

          const result = await addCategory({
            name: action.name.trim(), // Ensure we trim here to prevent store errors
            type: action.type,
            parent_id: parentId || null
          });
          
          if (!result) {
            return `Sorry, I couldn't add that category. ${storeError || 'Please try again.'}`;
          }
          if (!skipRefresh) await refreshCategories();
          return getFriendlySuccessMessage("create_category", { name: action.name, type: action.type });
        }

        case "update_category": {
          // Resolve category ID from name if needed
          let categoryId = action.categoryId || action.id;
          if (!categoryId && action.categoryName) {
            const category = findCategoryByName(action.categoryName);
            if (category) {
              categoryId = category.id;
            } else {
              return `Error: Category "${action.categoryName}" not found. Available categories: ${categories.map(c => c.name).join(', ')}`;
            }
          }

          if (!categoryId) {
            return "Error: Category ID or name is required for update operation.";
          }

          // Handle parent lookup by name if provided
          let parentId = action.parent_id;
          if (action.parentName !== undefined) {
            if (action.parentName === null || action.parentName === "") {
              parentId = null; // Move to root
            } else {
              const parentCategory = findCategoryByName(action.parentName);
              if (parentCategory) {
                parentId = parentCategory.id;
              } else {
                return `Error: Parent category "${action.parentName}" not found. Available categories: ${categories.map(c => c.name).join(', ')}`;
              }
            }
          }

          const updates: any = {};
          if (action.name !== undefined) updates.name = action.name;
          if (action.type !== undefined) updates.type = action.type;
          if (parentId !== undefined) updates.parent_id = parentId;

          // Use robust update with merge check
          const result = await updateCategoryWithMergeCheck(categoryId, updates, { companyId: currentCompany.id });
          
          if (!result.success) {
            if (result.needsMerge && result.existingCategory) {
              return `A category named "${action.name}" already exists. Would you like to merge "${action.categoryName || categoryId}" into "${result.existingCategory.name}"?`;
            }
            return `Sorry, I couldn't update that category. ${result.error || 'Please try again.'}`;
          }
          
          if (!skipRefresh) await refreshCategories();
          return getFriendlySuccessMessage("update_category", { name: action.name || action.categoryName });
        }

        case "delete_category": {
          // Resolve category ID from name if needed
          let categoryId = action.categoryId || action.id;
          let categoryName = action.categoryName || action.name;
          
          if (!categoryId && categoryName) {
            const category = findCategoryByName(categoryName);
            if (category) {
              categoryId = category.id;
              categoryName = category.name; // Use the actual name from DB
            } else {
              return `Error: Category "${categoryName}" not found. Available categories: ${categories.map(c => c.name).join(', ')}`;
            }
          }

          if (!categoryId) {
            return "Error: Category ID or name is required for delete operation.";
          }

          // Use robust delete with validation
          const result = await deleteCategoryWithValidation(categoryId, currentCompany.id);
          
          if (!result.success) {
            return `Sorry, I couldn't delete that category. ${result.error || 'Please try again.'}`;
          }
          
          if (!skipRefresh) await refreshCategories();
          return getFriendlySuccessMessage("delete_category", { name: categoryName });
        }

        case "move_category": {
          // Resolve category ID/name
          const categoryIdOrName = action.categoryId || action.categoryName;
          if (!categoryIdOrName) {
            return "Error: Category ID or name is required for move operation.";
          }

          // Resolve parent ID/name (null means move to root)
          let parentIdOrName = action.parentId || action.parentName;
          if (parentIdOrName === "root" || parentIdOrName === "") {
            parentIdOrName = null;
          }

          const result = await moveCategory(categoryIdOrName, parentIdOrName);
          
          if (!result) {
            return `Sorry, I couldn't move that category. ${storeError || 'Please try again.'}`;
          }
          
          if (!skipRefresh) await refreshCategories();
          return getFriendlySuccessMessage("move_category", { 
            categoryName: categoryIdOrName, 
            parentName: parentIdOrName || "root level" 
          });
        }

        case "change_category_type": {
          // Resolve category ID from name if needed
          let categoryId = action.categoryId || action.id;
          if (!categoryId && action.categoryName) {
            const category = findCategoryByName(action.categoryName);
            if (category) {
              categoryId = category.id;
            } else {
              return `Error: Category "${action.categoryName}" not found. Available categories: ${categories.map(c => c.name).join(', ')}`;
            }
          }

          if (!categoryId) {
            return "Error: Category ID or name is required for type change operation.";
          }

          const result = await updateCategory(categoryId, { type: action.newType });
          
          if (!result) {
            return `Sorry, I couldn't change the category type. ${storeError || 'Please try again.'}`;
          }
          
          if (!skipRefresh) await refreshCategories();
          return getFriendlySuccessMessage("change_category_type", { newType: action.newType });
        }

        case "merge_categories": {
          // Resolve source category IDs from names if needed
          let sourceCategoryIds = action.sourceCategoryIds || [];
          if (action.sourceCategoryNames && action.sourceCategoryNames.length > 0) {
            sourceCategoryIds = [];
            for (const name of action.sourceCategoryNames) {
              const category = findCategoryByName(name);
              if (category) {
                sourceCategoryIds.push(category.id);
              } else {
                return `Error: Source category "${name}" not found. Available categories: ${categories.map(c => c.name).join(', ')}`;
              }
            }
          }

          // Resolve target category ID from name if needed
          let targetCategoryId = action.targetCategoryId;
          if (!targetCategoryId && action.targetCategoryName) {
            const targetCategory = findCategoryByName(action.targetCategoryName);
            if (targetCategory) {
              targetCategoryId = targetCategory.id;
            } else {
              return `Error: Target category "${action.targetCategoryName}" not found. Available categories: ${categories.map(c => c.name).join(', ')}`;
            }
          }

          if (!targetCategoryId || sourceCategoryIds.length === 0) {
            return "Error: Both source and target categories are required for merge operation.";
          }

          const result = await mergeCategories(sourceCategoryIds, targetCategoryId, currentCompany.id);
          
          if (!result) {
            return `Sorry, I couldn't merge those categories. ${storeError || 'Please try again.'}`;
          }
          
          if (!skipRefresh) await refreshCategories();
          return getFriendlySuccessMessage("merge_categories", { 
            sourceCount: sourceCategoryIds.length,
            targetName: action.targetCategoryName || targetCategoryId 
          });
        }

        case "find_categories": {
          const exactMatch = action.exactMatch || false;
          const caseSensitive = action.caseSensitive || false;
          
          let foundCategories;
          if (exactMatch) {
            const category = findCategoryByName(action.namePattern, caseSensitive);
            foundCategories = category ? [category] : [];
          } else {
            foundCategories = findCategoriesByName(action.namePattern, caseSensitive);
          }

          if (foundCategories.length === 0) {
            return `No categories found matching "${action.namePattern}". Available categories: ${categories.map(c => c.name).join(', ')}`;
          }

          const categoryList = foundCategories.map(c => `- ${c.name} (${c.type})`).join('\n');
          return `Found ${foundCategories.length} categories matching "${action.namePattern}":\n${categoryList}`;
        }

        case "check_category_usage": {
          // Resolve category ID from name if needed
          let categoryId = action.categoryId;
          if (!categoryId && action.categoryName) {
            const category = findCategoryByName(action.categoryName);
            if (category) {
              categoryId = category.id;
            } else {
              return `Error: Category "${action.categoryName}" not found. Available categories: ${categories.map(c => c.name).join(', ')}`;
            }
          }

          if (!categoryId) {
            return "Error: Category ID or name is required for usage check.";
          }

          const linkageResult = await checkBankAccountLinkage(categoryId);
          
          if (linkageResult.error) {
            return `Error checking category usage: ${linkageResult.error}`;
          }

          if (linkageResult.isLinked) {
            return `Category is linked to bank account "${linkageResult.name}". Deleting or modifying this category may affect account synchronization.`;
          } else {
            return `Category is not linked to any bank accounts and appears safe to modify or delete.`;
          }
        }

        case "create_payee": {
          // Validate required parameters
          if (!action.name || typeof action.name !== 'string') {
            return "Error: Payee name is required and must be a string.";
          }
          
          // Check for duplicate payee names
          const existingPayee = payees.find(p => p.name.toLowerCase() === action.name.toLowerCase());
          if (existingPayee) {
            return `A payee named "${action.name}" already exists. Please choose a different name.`;
          }

          const result = await addPayee({ name: action.name.trim() });
          
          if (!result) {
            return `Sorry, I couldn't add that payee. ${payeesError || 'Please try again.'}`;
          }
          
          if (!skipRefresh) await refreshPayeesFromStore();
          return getFriendlySuccessMessage("create_payee", { name: action.name });
        }

        case "update_payee": {
          // Validate required parameters
          if (!action.name || typeof action.name !== 'string') {
            return "Error: New payee name is required and must be a string.";
          }
          
          // Resolve payee ID from name if needed
          let payeeId = action.payeeId || action.id;
          if (!payeeId && action.payeeName) {
            const payee = payees.find(p => p.name.toLowerCase() === action.payeeName.toLowerCase());
            if (payee) {
              payeeId = payee.id;
            } else {
              return `Error: Payee "${action.payeeName}" not found. Available payees: ${payees.map(p => p.name).join(', ')}`;
            }
          }

          if (!payeeId) {
            return "Error: Payee ID or name is required for update operation.";
          }

          const result = await updatePayee(payeeId, { name: action.name.trim() });
          
          if (!result) {
            return `Sorry, I couldn't update that payee. ${payeesError || 'Please try again.'}`;
          }
          
          if (!skipRefresh) await refreshPayeesFromStore();
          return getFriendlySuccessMessage("update_payee", { name: action.name });
        }

        case "delete_payee": {
          // Resolve payee ID from name if needed
          let payeeId = action.payeeId || action.id;
          let payeeName = action.payeeName || action.name;
          
          if (!payeeId && payeeName) {
            const payee = payees.find(p => p.name.toLowerCase() === payeeName.toLowerCase());
            if (payee) {
              payeeId = payee.id;
              payeeName = payee.name; // Use actual name from DB
            } else {
              return `Error: Payee "${payeeName}" not found. Available payees: ${payees.map(p => p.name).join(', ')}`;
            }
          }

          if (!payeeId) {
            return "Error: Payee ID or name is required for delete operation.";
          }

          const result = await deletePayee(payeeId);
          
          if (!result) {
            return `Sorry, I couldn't delete that payee. ${payeesError || 'Please try again.'}`;
          }
          
          if (!skipRefresh) await refreshPayeesFromStore();
          return getFriendlySuccessMessage("delete_payee", { name: payeeName });
        }

        case "batch_execute": {
          const results: string[] = [];
          let hasError = false;

          for (const operation of action.operations) {
            try {
              const result = await executeAction({ action: operation.action, ...operation.params }, true);
              results.push(result);
              
              // If any operation fails, stop the batch
              if (result.includes("Error:") || result.includes("Sorry,")) {
                hasError = true;
                break;
              }
            } catch (error) {
              hasError = true;
              results.push(`Error in ${operation.action}: ${error instanceof Error ? error.message : 'Unknown error'}`);
              break;
            }
          }

          // Refresh stores after batch completion
          if (!skipRefresh) {
            await Promise.all([refreshCategories(), refreshPayeesFromStore()]);
          }

          if (hasError) {
            return `Batch execution stopped due to error:\n${results.join('\n')}`;
          }

          return getFriendlySuccessMessage("batch_execute", { count: action.operations.length, results });
        }

        default: {
          return `Error: Unknown action "${action.action}". Available actions: create_category, update_category, delete_category, move_category, change_category_type, merge_categories, find_categories, check_category_usage, create_payee, update_payee, delete_payee, batch_execute`;
        }
      }
    } catch (error) {
      console.error("Error executing action:", error);
      return `Error executing action: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  // Handle confirmation
  const handleConfirm = async (messageIndex: number) => {
    const message = messages[messageIndex];
    if (!message.pendingAction) return;

    // Add user message 'Confirmed' immediately
    setMessages(prev => [...prev, { role: "user", content: "Confirmed" }]);

    setMessages(prev => prev.map((msg, i) => 
      i === messageIndex 
        ? { ...msg, showConfirmation: false, pendingAction: undefined }
        : msg
    ));

    const result = await executeAction(message.pendingAction);
    
    setMessages(prev => [...prev, {
      role: "assistant",
      content: result
    }]);
  };

  // Handle cancellation
  const handleCancel = (messageIndex: number) => {
    // Add user message 'Cancelled' immediately
    setMessages(prev => [...prev, { role: "user", content: "Cancelled" }]);

    setMessages(prev => prev.map((msg, i) => 
      i === messageIndex 
        ? { ...msg, showConfirmation: false, pendingAction: undefined }
        : msg
    ));
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
            } else if (functionName === "move_category") {
              confirmationMessage += `${index + 1}. Move category "${
                args.categoryName || args.categoryId
              }" under "${args.parentName || args.parentId || 'root level'}"\n`;
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

          // Convert toolCalls to operations format for executeAction
          const operations = toolCalls.map((toolCall: any) => {
            const functionName = toolCall.function?.name;
            const args = JSON.parse(toolCall.function?.arguments || "{}");
            return {
              action: functionName,
              params: args
            };
          });

          // Set up for execution
          setPendingToolQueue(toolCalls);
          setMessages((prev) => [
            ...prev.slice(0, -1), // remove 'Thinking...'
            {
              role: "assistant",
              content: confirmationMessage,
              showConfirmation: true,
              pendingAction: { action: "batch_execute", operations },
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
          case 'move_category':
            confirmationMessage = `I'll move category "${
              args.categoryName || args.categoryId
            }" under "${
              args.parentName || args.parentId || 'root level'
            }". Would you like to proceed?`;
            pendingAction = { action: 'move_category', ...args };
            break;
          case 'change_category_type':
            confirmationMessage = `I'll change category "${
              args.categoryName || args.categoryId
            }" type to "${args.newType}". Would you like to proceed?`;
            pendingAction = { action: 'change_category_type', ...args };
            break;
          case 'merge_categories':
            const sourceNames = args.sourceCategoryNames || args.sourceCategoryIds || [];
            const targetName = args.targetCategoryName || args.targetCategoryId;
            confirmationMessage = `I'll merge ${sourceNames.length} categories into "${targetName}". This action cannot be undone. Would you like to proceed?`;
            pendingAction = { action: 'merge_categories', ...args };
            break;
          case 'find_categories':
            confirmationMessage = `I'll search for categories matching "${args.namePattern}". Would you like to proceed?`;
            pendingAction = { action: 'find_categories', ...args };
            break;
          case 'check_category_usage':
            const categoryToCheck = args.categoryName || args.categoryId;
            confirmationMessage = `I'll check the usage and linkage status of category "${categoryToCheck}". Would you like to proceed?`;
            pendingAction = { action: 'check_category_usage', ...args };
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
                case 'move_category':
                  const moveCategoryName = params.categoryName || params.categoryId || 'Unknown Category';
                  const moveParentName = params.parentName || params.parentId || 'root level';
                  batchMessage += `${index + 1}. Move "${moveCategoryName}" under "${moveParentName}"\n`;
                  break;
                case 'change_category_type':
                  const changeCategoryName = params.categoryName || params.categoryId || 'Unknown Category';
                  const newType = params.newType || 'Unknown Type';
                  batchMessage += `${index + 1}. Change "${changeCategoryName}" type to "${newType}"\n`;
                  break;
                case 'merge_categories':
                  const mergeSourceNames = params.sourceCategoryNames || params.sourceCategoryIds || [];
                  const mergeTargetName = params.targetCategoryName || params.targetCategoryId || 'Unknown Target';
                  batchMessage += `${index + 1}. Merge ${mergeSourceNames.length} categories into "${mergeTargetName}"\n`;
                  break;
                case 'find_categories':
                  const searchPattern = params.namePattern || 'Unknown Pattern';
                  batchMessage += `${index + 1}. Search for categories matching "${searchPattern}"\n`;
                  break;
                case 'check_category_usage':
                  const checkCategoryName = params.categoryName || params.categoryId || 'Unknown Category';
                  batchMessage += `${index + 1}. Check usage of category "${checkCategoryName}"\n`;
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
        setPendingToolQueue(toolCalls);
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
      } else if (nextTool.function?.name === "move_category") {
        setPendingToolArgs({ type: "move_category", args: JSON.parse(nextTool.function.arguments) });
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `To confirm, I will move "${
              JSON.parse(nextTool.function.arguments).categoryId || JSON.parse(nextTool.function.arguments).categoryName
            }" under "${JSON.parse(nextTool.function.arguments).parentId || JSON.parse(nextTool.function.arguments).parentName || 'root level'}". Please press confirm.`,
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

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

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
                      ? "bg-white border-gray-200 text-gray-800" 
                      : "bg-gray-50 border-gray-200 text-gray-900"
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
            <div ref={messagesEndRef} />
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
          <div className="flex space-x-2 items-center">
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => {
                setInputMessage(e.target.value);
              }}
              onKeyPress={(e) => e.key === "Enter" && handleSendMessage()}
              placeholder="Message"
              className="flex-1 rounded-md border border-gray-300 px-3 py-2 bg-white focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 text-xs"
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
