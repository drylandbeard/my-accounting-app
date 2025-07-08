/* Use of 'any' types are intentional here due to the dynamic nature of the AI tool responses 
and the complex interaction between multiple imported type definitions from different files. */

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */

"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { X, RefreshCcw, ArrowUpCircle } from "lucide-react";
import { usePayeesStore } from "@/zustand/payeesStore";
import { useAuthStore } from "@/zustand/authStore";
import { supabase } from "@/lib/supabase";

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
  


  
  const [transactions, setTransactions] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);

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




  // Function to refresh/clear chat context
  const handleRefreshContext = () => {
    setMessages([
      {
        role: "assistant",
        content: `How can I help?`,
      },
    ]);
    localStorage.removeItem("aiChatMessages");
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

      switch (action.action) {








        case "create_payee": {
          // Validate required parameters
          if (!action.name || typeof action.name !== 'string') {
            return "I need a payee name to create a new payee. What would you like to name it?";
          }
          
          const trimmedName = action.name.trim();
          if (!trimmedName) {
            return "The payee name cannot be empty. Please provide a valid name.";
          }
          
          // Check for duplicate payee names with intelligent suggestions
          const existingPayee = payees.find(p => p.name.toLowerCase() === trimmedName.toLowerCase());
          if (existingPayee) {
            return `A payee named "${trimmedName}" already exists. Would you like to:\n• Use the existing payee "${existingPayee.name}"\n• Choose a different name (e.g., "${trimmedName} Inc" or "${trimmedName} LLC")`;
          }

          // Check for similar names (fuzzy matching)
          const similarPayees = payees.filter(p => 
            p.name.toLowerCase().includes(trimmedName.toLowerCase()) || 
            trimmedName.toLowerCase().includes(p.name.toLowerCase())
          );
          
          if (similarPayees.length > 0) {
            const suggestions = similarPayees.map(p => p.name).join('", "');
            return `I found similar payees: "${suggestions}". Did you mean one of these, or would you like to create "${trimmedName}" as a new payee?`;
          }

          const result = await addPayee({ name: trimmedName });
          
          if (!result) {
            const errorMsg = payeesError || 'Unknown error occurred';
            if (errorMsg.toLowerCase().includes('duplicate') || errorMsg.toLowerCase().includes('already exists')) {
              return `It looks like "${trimmedName}" already exists. Current payees: ${payees.map(p => p.name).join(', ')}`;
            }
            return `I couldn't create the payee "${trimmedName}". ${errorMsg}. Would you like to try a different name?`;
          }
          
          if (!skipRefresh) await refreshPayeesFromStore();
          return getFriendlySuccessMessage("create_payee", { name: trimmedName });
        }

        case "update_payee": {
          // Validate required parameters
          if (!action.name || typeof action.name !== 'string') {
            return "I need a new name for the payee. What would you like to rename it to?";
          }
          
          const trimmedNewName = action.name.trim();
          if (!trimmedNewName) {
            return "The new payee name cannot be empty. Please provide a valid name.";
          }
          
          // Resolve payee ID from name if needed
          let payeeId = action.payeeId || action.id;
          let currentPayeeName = action.payeeName;
          
          if (!payeeId && action.payeeName) {
            const payee = payees.find(p => p.name.toLowerCase() === action.payeeName.toLowerCase());
            if (payee) {
              payeeId = payee.id;
              currentPayeeName = payee.name;
            } else {
              // Try fuzzy matching for the payee name
              const similarPayees = payees.filter(p => 
                p.name.toLowerCase().includes(action.payeeName.toLowerCase()) || 
                action.payeeName.toLowerCase().includes(p.name.toLowerCase())
              );
              
              if (similarPayees.length > 0) {
                const suggestions = similarPayees.map(p => p.name).join('", "');
                return `I couldn't find "${action.payeeName}" exactly. Did you mean: "${suggestions}"?`;
              }
              
              return `I couldn't find the payee "${action.payeeName}". Available payees: ${payees.map(p => p.name).join(', ')}`;
            }
          }

          if (!payeeId) {
            return "I need to know which payee to update. Please specify the current payee name.";
          }

          // Check if new name already exists (excluding current payee)
          const nameConflict = payees.find(p => p.id !== payeeId && p.name.toLowerCase() === trimmedNewName.toLowerCase());
          if (nameConflict) {
            return `A payee named "${trimmedNewName}" already exists. Please choose a different name for "${currentPayeeName}".`;
          }

          const result = await updatePayee(payeeId, { name: trimmedNewName });
          
          if (!result) {
            const errorMsg = payeesError || 'Unknown error occurred';
            if (errorMsg.toLowerCase().includes('not found')) {
              return `The payee "${currentPayeeName}" wasn't found. Current payees: ${payees.map(p => p.name).join(', ')}`;
            }
            return `I couldn't update "${currentPayeeName}" to "${trimmedNewName}". ${errorMsg}. Please try again.`;
          }
          
          if (!skipRefresh) await refreshPayeesFromStore();
          return getFriendlySuccessMessage("update_payee", { name: trimmedNewName });
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
              // Try fuzzy matching for the payee name
              const similarPayees = payees.filter(p => 
                p.name.toLowerCase().includes(payeeName.toLowerCase()) || 
                payeeName.toLowerCase().includes(p.name.toLowerCase())
              );
              
              if (similarPayees.length > 0) {
                const suggestions = similarPayees.map(p => p.name).join('", "');
                return `I couldn't find "${payeeName}" exactly. Did you mean: "${suggestions}"?`;
              }
              
              return `I couldn't find the payee "${payeeName}". Available payees: ${payees.map(p => p.name).join(', ')}`;
            }
          }

          if (!payeeId) {
            return "I need to know which payee to delete. Please specify the payee name.";
          }

          const result = await deletePayee(payeeId);
          
          if (!result) {
            const errorMsg = payeesError || 'Unknown error occurred';
            if (errorMsg.toLowerCase().includes('in use') || errorMsg.toLowerCase().includes('transactions')) {
              return `I can't delete "${payeeName}" because it's being used in transactions. You may want to update those transactions first, or keep the payee for historical records.`;
            }
            if (errorMsg.toLowerCase().includes('not found')) {
              return `The payee "${payeeName}" wasn't found. Current payees: ${payees.map(p => p.name).join(', ')}`;
            }
            return `I couldn't delete "${payeeName}". ${errorMsg}. The payee might be in use by transactions.`;
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
            await refreshPayeesFromStore();
          }

          if (hasError) {
            return `Batch execution stopped due to error:\n${results.join('\n')}`;
          }

          return getFriendlySuccessMessage("batch_execute", { count: action.operations.length, results });
        }

        default: {
          return `Error: Unknown action "${action.action}". Available actions: create_payee, update_payee, delete_payee, batch_execute`;
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
        content: `Current payees in the system:
${payees.map((p) => `- ${p.name}`).join('\n')}

Available payee names: ${payees.map((p) => p.name).join(", ")}

IMPORTANT: Use the appropriate tools for payee operations. For multiple related operations, use batch_execute to group them together efficiently.`
      },
    ];

    const payeePrompt = `
You are an AI assistant that helps users manage payees for bookkeeping.

IMPORTANT VALIDATION RULES:
1. Payee names must be unique within a company
2. Always validate that referenced payees actually exist before acting
3. Use fuzzy matching to find payees when exact names don't match

AVAILABLE TOOLS:
- create_payee: Create new payees with duplicate detection
- update_payee: Update payee names with validation
- delete_payee: Delete payees with usage validation
- batch_execute: Execute multiple payee operations with proper dependency ordering

PAYEE OPERATION GUIDELINES:
1. For CREATE_PAYEE: Check for exact matches and suggest similar existing payees if found
2. For UPDATE_PAYEE: Use fuzzy matching to find the intended payee when exact names don't match
3. For DELETE_PAYEE: Check if the payee is used in transactions and warn appropriately
4. When payee operations fail, provide helpful suggestions like alternative names or existing payees
5. For unclear payee names, suggest the closest matches from the existing payee list

ERROR HANDLING:
1. NEVER hallucinate payee names - always validate they exist first
2. When names don't exist, provide helpful suggestions with similar existing names
3. For vague requests, ask for specific names with context about available options
4. Always confirm destructive actions (deletes) and explain consequences
5. Use batch_execute for multiple related operations
6. Provide intelligent error messages that guide users toward successful actions
7. When duplicate names are detected, suggest variations or alternatives

RESPONSE STYLE:
- Be conversational and helpful, not robotic
- Explain what you're doing and why
- Offer alternatives when operations can't be completed
- Use fuzzy matching to understand user intent when exact names don't match
- Prioritize user success over strict rule enforcement

Respond concisely and only take action when confident about the existence of referenced items.
`;

    const openAIMessages = [
      { role: "system", content: payeePrompt },
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
          tools: [
            {
              type: 'function',
              function: {
                name: 'create_payee',
                description: 'Create a new payee with intelligent duplicate detection and suggestions. Handles similar name detection and provides helpful alternatives when duplicates exist.',
                parameters: {
                  type: 'object',
                  properties: {
                    name: { type: 'string', description: 'The name of the new payee. Will check for duplicates and suggest alternatives if similar names exist.' }
                  },
                  required: ['name'],
                },
              },
            },
            {
              type: 'function',
              function: {
                name: 'update_payee',
                description: 'Update an existing payee name with fuzzy matching for payee identification. Provides helpful suggestions when exact payee names are not found.',
                parameters: {
                  type: 'object',
                  properties: {
                    payeeId: { type: 'string', description: 'The ID of the payee to update' },
                    payeeName: { type: 'string', description: 'The current name of the payee to update (supports fuzzy matching if exact name not found)' },
                    name: { type: 'string', description: 'The new name for the payee. Will validate uniqueness and suggest alternatives if conflicts exist.' }
                  },
                  required: ['name'],
                },
              },
            },
            {
              type: 'function',
              function: {
                name: 'delete_payee',
                description: 'Delete an existing payee with usage validation and fuzzy matching. Warns if payee is used in transactions and suggests alternatives when exact names are not found.',
                parameters: {
                  type: 'object',
                  properties: {
                    payeeId: { type: 'string', description: 'The ID of the payee to delete' },
                    payeeName: { type: 'string', description: 'The name of the payee to delete (supports fuzzy matching if exact name not found)' }
                  },
                  required: []
                },
              },
            },
            {
              type: 'function',
              function: {
                name: 'batch_execute',
                description: 'Execute multiple payee operations in a single batch with proper dependency ordering and rollback on failure.',
                parameters: {
                  type: 'object',
                  properties: {
                    operations: { 
                      type: 'array',
                      description: 'List of payee operations to execute in sequence',
                      items: {
                        type: 'object',
                        properties: {
                          action: { 
                            type: 'string',
                            description: 'The type of payee operation to perform',
                            enum: ['create_payee', 'update_payee', 'delete_payee']
                          },
                          params: {
                            type: 'object',
                            description: 'Parameters for the payee operation'
                          }
                        },
                        required: ['action', 'params']
                      }
                    }
                  },
                  required: ['operations'],
                },
              },
            }
          ],
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

          if (functionName === "create_payee") {
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
            
            args.operations.forEach((op: any, index: number) => {
              // Safely access parameters with fallbacks
              const params = op.params || op;
              
              switch(op.action) {
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
                default:
                  batchMessage += `${index + 1}. ${op.action} operation\n`;
              }
            });
            
            
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



  // Helper function to identify vague prompts
  const isVaguePrompt = (message: string): boolean => {
    const vaguePatterns = [
      /^add\s+payee$/i, // "Add payee"
      /^new\s+payee$/i, // "New payee"
      /^create\s+payee$/i, // "Create payee"
      /^delete\s+(\w+)$/i, // "Delete Test", etc.
      /^update\s+(\w+)$/i, // "Update payee", etc.
      /^rename\s+(\w+)$/i, // "Rename payee", etc.
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
    
    if (/add|create|new/i.test(userMessage) && /payee/i.test(userMessage)) {
      clarificationMessage = "I'd be happy to create a new payee for you. Could you please provide:\n\n" +
        "1. The complete name for the payee\n" +
        "2. Any additional details about the payee if relevant";
    } else if (/delete|remove/i.test(userMessage)) {
      clarificationMessage = "I'd be happy to delete that payee for you, but I need to know:\n\n" +
        "1. The complete name of the payee you want to delete\n" +
        "2. Are you sure you want to permanently remove it?";
    } else if (/update|change|modify|rename/i.test(userMessage)) {
      clarificationMessage = "I'd be happy to make that change, but I need more specifics:\n\n" +
        "1. The exact name of the payee you want to change\n" +
        "2. What would you like to rename it to?";
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
      <div className="flex h-screen flex-col bg-white shadow-xl font-sans text-xs" style={{height: "calc(100vh - 2.7rem)"}}>
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
