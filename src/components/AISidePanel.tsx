/* Use of 'any' types are intentional here due to the dynamic nature of the AI tool responses 
and the complex interaction between multiple imported type definitions from different files. */

/* eslint-disable @typescript-eslint/no-explicit-any */

"use client";

import { useState, useEffect, useRef, useContext } from "react";
import { supabase } from "@/lib/supabase";
import { X, RefreshCcw } from "lucide-react";
import { AISharedContext } from "./AISharedContext";
import { useApiWithCompany } from "@/hooks/useApiWithCompany";
import { tools } from "@/ai/tools";
import { categoryPrompt } from "@/ai/prompts";
import { createCategoryHandler } from "@/ai/functions/createCategory";
import { renameCategoryHandler } from "@/ai/functions/renameCategory";
import { assignParentCategoryHandler } from "@/ai/functions/assignParentCategory";
import { deleteCategoryHandler } from "@/ai/functions/deleteCategory";
import { changeCategoryTypeHandler } from "../ai/functions/changeCategoryType";

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
  const { categories, refreshCategories } = useContext(AISharedContext);
  const [pendingToolQueue, setPendingToolQueue] = useState<any[]>([]);
  const [pendingToolArgs, setPendingToolArgs] = useState<any | null>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const { currentCompany, postWithCompany } = useApiWithCompany();
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

  // Function to execute confirmed actions
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
      await postWithCompany("/api/sync-journal", {});
      // Refresh categories unless we're in batch mode
      if (!skipRefresh) {
        await refreshCategories();
      }
      return `Transaction "${tx.description}" categorized as "${category.name}".`;
    }

    if (action.action === "create_category") {
      const result = await createCategoryHandler({
        name: action.name!,
        type: action.type!,
        companyId: currentCompany?.id,
      });

      if (result.success) {
        if (!skipRefresh) {
          await refreshCategories();
        }
        return `Successfully created category '${action.name}' with type '${action.type}'.`;
      } else {
        return `Error creating category: ${result.error}`;
      }
    }

    if (action.action === "rename_category") {
      const result = await renameCategoryHandler({
        oldName: action.oldName!,
        newName: action.newName!,
        companyId: currentCompany?.id,
        categories: categoriesToUse,
      });

      if (result.success) {
        if (!skipRefresh) {
          await refreshCategories();
        }
        return `Successfully renamed category '${action.oldName}' to '${action.newName}'.`;
      } else {
        return `Error renaming category: ${result.error}`;
      }
    }

    if (action.action === "delete_category") {
      const result = await deleteCategoryHandler({
        name: action.name!,
        companyId: currentCompany?.id,
        categories: categoriesToUse,
      });

      if (result.success) {
        if (!skipRefresh) {
          await refreshCategories();
        }
        return `Successfully deleted category '${action.name}'.`;
      } else {
        return `Error deleting category: ${result.error}`;
      }
    }

    if (action.action === "change_category_type") {
      const result = await changeCategoryTypeHandler({
        categoryName: action.categoryName!,
        newType: action.newType!,
        companyId: currentCompany?.id,
        categories: categoriesToUse,
      });

      if (result.success) {
        if (!skipRefresh) {
          await refreshCategories();
        }
        return `Successfully changed category '${action.categoryName}' type to '${action.newType}'.`;
      } else {
        return `Error changing category type: ${result.error}`;
      }
    }

    if (action.action === "assign_parent_category") {
      const result = await assignParentCategoryHandler({
        childName: action.categoryName!,
        parentName: action.parentCategoryName!,
        companyId: currentCompany?.id,
        categories: categoriesToUse,
      });

      if (result.success) {
        if (!skipRefresh) {
          await refreshCategories();
        }
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
      if (message.pendingAction.action === "batch_execute") {
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

        // Execute each action in sequence with proper async handling
        for (let i = 0; i < pendingToolQueue.length; i++) {
          const action = pendingToolQueue[i];
          try {
            // Update to show current action being processed
            const processingMessage = currentMessage + `\n🔄 Processing action ${i + 1}...`;
            setMessages((prev) =>
              prev.map((msg, idx) => (idx === messageIndex ? { ...msg, content: processingMessage } : msg))
            );

            // For actions that depend on recently created categories, get fresh data
            let freshCategories = categories;
            if (action.action === "assign_parent_category" && i > 0) {
              // Refresh categories and wait for the update
              await refreshCategories();
              await new Promise((resolve) => setTimeout(resolve, 1000));

              // Fetch fresh categories directly from database
              if (currentCompany) {
                const { data: freshCategoriesData } = await supabase
                  .from("chart_of_accounts")
                  .select("*")
                  .eq("company_id", currentCompany.id);
                freshCategories = freshCategoriesData || categories;
              }
            }

            const result = await executeAction(action, true, freshCategories);
            results.push(`${i + 1}. ${result}`);
            currentMessage += `${i + 1}. ${result}\n`;

            // CRITICAL: Wait for categories to be refreshed before next action
            await refreshCategories();

            // Add a small delay to ensure state is updated
            await new Promise((resolve) => setTimeout(resolve, 500));

            // Update message with progress
            setMessages((prev) =>
              prev.map((msg, idx) => (idx === messageIndex ? { ...msg, content: currentMessage } : msg))
            );
          } catch (error) {
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

        // Final message update
        currentMessage += `\n🎉 **All actions completed!**`;
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

    const newMessage: Message = {
      role: "user",
      content: inputMessage,
    };
    setMessages((prev) => [...prev, newMessage]);
    setInputMessage("");

    // Only provide categories context
    const contextMessages: { role: string; content: string }[] = [
      {
        role: "system",
        content: `Available categories: ${categories.map((c) => c.name).join(", ")}`,
      },
    ];

    const openAIMessages = [
      { role: "system", content: categoryPrompt },
      ...contextMessages,
      ...[...messages, newMessage].map((m) => ({ role: m.role, content: m.content })),
    ];

    setMessages((prev) => [...prev, { role: "assistant", content: "Thinking..." }]);

    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: openAIMessages,
          max_tokens: 256,
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
        const allActions: any[] = [];
        let confirmationMessage = "";

        toolCalls.forEach((toolCall: any, index: number) => {
          const functionName = toolCall.function?.name;
          const args = JSON.parse(toolCall.function?.arguments || "{}");

          if (functionName === "create_category") {
            allActions.push({
              action: "create_category",
              name: args.name,
              type: args.type,
            });
            confirmationMessage += `${toolCalls.length > 1 ? `${index + 1}. ` : ""}Create category "${
              args.name
            }" with type "${args.type}"${toolCalls.length > 1 ? "\n" : ""}`;
          } else if (functionName === "rename_category") {
            allActions.push({
              action: "rename_category",
              oldName: args.oldName,
              newName: args.newName,
            });
            confirmationMessage += `${toolCalls.length > 1 ? `${index + 1}. ` : ""}Rename category "${
              args.oldName
            }" to "${args.newName}"${toolCalls.length > 1 ? "\n" : ""}`;
          } else if (functionName === "delete_category") {
            allActions.push({
              action: "delete_category",
              name: args.name,
            });
            confirmationMessage += `${toolCalls.length > 1 ? `${index + 1}. ` : ""}Delete category "${args.name}"${
              toolCalls.length > 1 ? "\n" : ""
            }`;
          } else if (functionName === "change_category_type") {
            allActions.push({
              action: "change_category_type",
              categoryName: args.categoryName,
              newType: args.newType,
            });
            confirmationMessage += `${toolCalls.length > 1 ? `${index + 1}. ` : ""}Change category "${
              args.categoryName
            }" type to "${args.newType}"${toolCalls.length > 1 ? "\n" : ""}`;
          } else if (functionName === "assign_parent_category") {
            allActions.push({
              action: "assign_parent_category",
              categoryName: args.childName,
              parentCategoryName: args.parentName,
            });
            confirmationMessage += `${toolCalls.length > 1 ? `${index + 1}. ` : ""}Assign category "${
              args.childName
            }" under "${args.parentName}"${toolCalls.length > 1 ? "\n" : ""}`;
          }
        });

        if (toolCalls.length > 1) {
          confirmationMessage =
            "I will perform the following actions:\n\n" +
            confirmationMessage +
            "\nPress Confirm to execute all actions, or Cancel to abort.";
        } else {
          confirmationMessage = "I will " + confirmationMessage.toLowerCase() + ". Press Confirm to proceed.";
        }

        // Set up for batch execution
        setPendingToolQueue(allActions);
        setMessages((prev) => [
          ...prev.slice(0, -1), // remove 'Thinking...'
          {
            role: "assistant",
            content: confirmationMessage,
            showConfirmation: true,
            pendingAction: { action: "batch_execute" },
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
      result = await createCategoryHandler({ ...pendingToolArgs.args, companyId: currentCompany?.id });
      if (result.success) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `Category "${pendingToolArgs.args.name}" (${pendingToolArgs.args.type}) has been created! Would you like to create another category or assign this one to a parent category?`,
          },
        ]);
        await refreshCategories();
      } else {
        setMessages((prev) => [...prev, { role: "assistant", content: `Error creating category: ${result.error}` }]);
      }
    } else if (pendingToolArgs.type === "rename_category") {
      result = await renameCategoryHandler({ ...pendingToolArgs.args, companyId: currentCompany?.id, categories });
      if (result.success) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `Category "${pendingToolArgs.args.oldName}" has been renamed to "${pendingToolArgs.args.newName}". Is there anything else you'd like to change about this category?`,
          },
        ]);
        await refreshCategories();
      } else {
        setMessages((prev) => [...prev, { role: "assistant", content: `Error renaming category: ${result.error}` }]);
      }
    } else if (pendingToolArgs.type === "assign_parent_category") {
      result = await assignParentCategoryHandler({
        ...pendingToolArgs.args,
        companyId: currentCompany?.id,
        categories,
      });
      if (result.success) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `Assigned "${pendingToolArgs.args.childName}" as a subcategory of "${pendingToolArgs.args.parentName}". Would you like to organize any other categories?`,
          },
        ]);
        await refreshCategories();
      } else {
        setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${result.error}` }]);
      }
    } else if (pendingToolArgs.type === "delete_category") {
      result = await deleteCategoryHandler({ ...pendingToolArgs.args, companyId: currentCompany?.id, categories });
      if (result.success) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `Category "${pendingToolArgs.args.name}" has been deleted. Would you like to make any other changes to your categories?`,
          },
        ]);
        await refreshCategories();
      } else {
        setMessages((prev) => [...prev, { role: "assistant", content: `Error deleting category: ${result.error}` }]);
      }
    } else if (pendingToolArgs.type === "change_category_type") {
      result = await changeCategoryTypeHandler({ ...pendingToolArgs.args, companyId: currentCompany?.id, categories });
      if (result.success) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `Category "${pendingToolArgs.args.categoryName}" type has been changed to "${pendingToolArgs.args.newType}". Would you like to make any other changes to your categories?`,
          },
        ]);
        await refreshCategories();
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
      } else if (nextTool.function?.name === "rename_category") {
        setPendingToolArgs({ type: "rename_category", args: JSON.parse(nextTool.function.arguments) });
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `To confirm, I will rename the category "${JSON.parse(nextTool.function.arguments).oldName}" to "${
              JSON.parse(nextTool.function.arguments).newName
            }". Please press confirm.`,
          },
        ]);
      } else if (nextTool.function?.name === "assign_parent_category") {
        setPendingToolArgs({ type: "assign_parent_category", args: JSON.parse(nextTool.function.arguments) });
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `To confirm, I will assign "${
              JSON.parse(nextTool.function.arguments).childName
            }" as a subcategory of "${JSON.parse(nextTool.function.arguments).parentName}". Please press confirm.`,
          },
        ]);
      } else if (nextTool.function?.name === "delete_category") {
        setPendingToolArgs({ type: "delete_category", args: JSON.parse(nextTool.function.arguments) });
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `To confirm, I will delete the category "${
              JSON.parse(nextTool.function.arguments).name
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
              JSON.parse(nextTool.function.arguments).categoryName
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
