"use client";

import React, { useState, useRef, useEffect } from "react";
import { X, Send } from "lucide-react";
import { useAIStore } from "@/zustand/aiStore";
import { usePayeesStore } from "@/zustand/payeesStore";
import { useCategoriesStore } from "@/zustand/categoriesStore";

interface AISidePanelProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

const DEFAULT_PANEL_WIDTH = 400;

// Function definitions for the AI assistant
const createPayee = async (name: string) => {
  console.log("Creating payee with name:", name); // Debug log
  const { addPayee } = usePayeesStore.getState();
  const result = await addPayee({ name });
  console.log("Payee creation result:", result); // Debug log
  return result;
};

const createCategory = async (name: string, type: "income" | "expense") => {
  const { addCategory } = useCategoriesStore.getState();
  // Map income/expense to the actual category types used in the system
  const categoryType = type === "income" ? "Revenue" : "Expense";
  const result = await addCategory({ name, type: categoryType });
  return result;
};

export default function AISidePanel({ isOpen, setIsOpen }: AISidePanelProps) {
  const [inputValue, setInputValue] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [unclearResponseCount, setUnclearResponseCount] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { messages, addMessage, pendingAction, awaitingConfirmation, setPendingAction, clearPendingAction } =
    useAIStore();

  // Auto-scroll to bottom when new messages are added
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Initialize with welcome message if no messages exist
  useEffect(() => {
    if (messages.length === 0) {
      addMessage({
        role: "assistant",
        content:
          "Hello! I'm your accounting assistant. I can help you create payees and categories. What would you like to do?",
      });
    }
  }, [messages.length, addMessage]);

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isProcessing) return;

    const userMessage = inputValue.trim();
    setInputValue("");
    setIsProcessing(true);

    // Add user message
    addMessage({
      role: "user",
      content: userMessage,
    });

    try {
      // If we're awaiting confirmation (and have a complete action), handle confirmation logic
      if (awaitingConfirmation && pendingAction && (pendingAction.type === "createPayee" || pendingAction.data.type)) {
        await handleConfirmation(userMessage);
        return;
      }

      // If we're awaiting category type specification, handle that first
      if (pendingAction?.type === "createCategory" && !pendingAction.data.type) {
        const lowerMessage = userMessage.toLowerCase();
        if (lowerMessage.includes("income") || lowerMessage.includes("expense")) {
          const categoryType = lowerMessage.includes("income") ? "income" : "expense";
          setPendingAction({
            type: "createCategory",
            data: { name: pendingAction.data.name, type: categoryType },
          });
          addMessage({
            role: "assistant",
            content: `Great! Would you like me to go ahead and add "${pendingAction.data.name}" as an **${categoryType} category**? ✅ Confirm | ❌ Cancel`,
          });
          return;
        }
      }

      // Process the user's intent
      await processUserIntent(userMessage);
    } catch (error) {
      console.error("Error processing message:", error);
      addMessage({
        role: "assistant",
        content: "I'm sorry, I encountered an error. Please try again.",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmation = async (userMessage: string) => {
    const lowerMessage = userMessage.toLowerCase();

    if (
      lowerMessage.includes("yes") ||
      lowerMessage.includes("confirm") ||
      lowerMessage.includes("ok") ||
      lowerMessage.includes("✅")
    ) {
      // Execute the pending action
      if (pendingAction?.type === "createPayee") {
        const result = await createPayee(pendingAction.data.name);
        if (result) {
          addMessage({
            role: "assistant",
            content: `Great! I've created the payee "${pendingAction.data.name}" for you.`,
          });
        } else {
          addMessage({
            role: "assistant",
            content: "I'm sorry, I couldn't create that payee. It might already exist or there was an error.",
          });
        }
      } else if (pendingAction?.type === "createCategory") {
        const result = await createCategory(pendingAction.data.name, pendingAction.data.type!);
        if (result) {
          addMessage({
            role: "assistant",
            content: `Perfect! I've created the ${pendingAction.data.type} category "${pendingAction.data.name}" for you.`,
          });
        } else {
          addMessage({
            role: "assistant",
            content: "I'm sorry, I couldn't create that category. It might already exist or there was an error.",
          });
        }
      }
    } else if (lowerMessage.includes("no") || lowerMessage.includes("cancel") || lowerMessage.includes("❌")) {
      addMessage({
        role: "assistant",
        content: "No problem! I've cancelled that action. What else can I help you with?",
      });
    } else {
      const newCount = unclearResponseCount + 1;
      setUnclearResponseCount(newCount);

      if (newCount >= 2) {
        addMessage({
          role: "assistant",
          content:
            "I'm having trouble understanding. Let me cancel this action and start fresh. What would you like to do?",
        });
        clearPendingAction();
        setUnclearResponseCount(0);
      } else {
        addMessage({
          role: "assistant",
          content:
            "I didn't understand your response. Please confirm with 'yes' or 'no', or say 'cancel' to cancel the action.",
        });
      }
      return; // Don't clear pending action yet
    }

    clearPendingAction();
    setUnclearResponseCount(0);
  };

  const processUserIntent = async (userMessage: string) => {
    const lowerMessage = userMessage.toLowerCase();

    // Check for payee creation intent
    if (lowerMessage.includes("add") || lowerMessage.includes("create")) {
      const payeeMatch = userMessage.match(
        /(?:add|create)\s+([a-zA-Z0-9\s]+?)(?:\s+as\s+(?:a\s+)?(?:payee|category))?$/i
      );
      const categoryMatch = userMessage.match(/(?:add|create)\s+([a-zA-Z0-9\s]+?)\s+as\s+(?:a\s+)?category/i);

      if (payeeMatch && !categoryMatch) {
        const name = payeeMatch[1].trim();
        if (name) {
          setPendingAction({
            type: "createPayee",
            data: { name },
          });
          addMessage({
            role: "assistant",
            content: `Sure! Would you like me to add "${name}" as a new payee? ✅ Confirm | ❌ Cancel`,
          });
          return;
        }
      }

      if (categoryMatch) {
        const name = categoryMatch[1].trim();
        if (name) {
          // Ask for category type
          setPendingAction({
            type: "createCategory",
            data: { name },
          });
          addMessage({
            role: "assistant",
            content: `Got it! Should "${name}" be an **income** category or an **expense** category?`,
          });
          return;
        }
      }
    }

    // Default response for unclear intent
    addMessage({
      role: "assistant",
      content:
        "I'm not sure what you'd like me to do. You can ask me to:\n• Add a payee (e.g., 'Add John' or 'Create ABC Company')\n• Add a category (e.g., 'Add Marketing as a category')\n\nWhat would you like to do?",
    });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Panel styling
  const panelStyle = {
    width: isOpen ? DEFAULT_PANEL_WIDTH : 0,
    transition: "width 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
    minWidth: isOpen ? 320 : 0,
    maxWidth: 600,
    overflow: "hidden",
    boxShadow: isOpen ? "rgba(0,0,0,0.1) 0px 0px 16px" : "none",
    background: "white",
    height: "calc(100vh - 2.75rem)",
    display: "flex",
    flexDirection: "column" as const,
    borderLeft: isOpen ? "1px solid #e5e7eb" : "none",
    position: "sticky" as const,
    top: "2.75rem",
    zIndex: 30,
  };

  return (
    <div style={panelStyle}>
      {isOpen && (
        <div className="flex h-full flex-col bg-white shadow-xl font-sans text-xs">
          {/* Header */}
          <div className="px-4 py-6 sm:px-6 bg-gray-50 border-b border-gray-200">
            <div className="flex items-start justify-between">
              <div className="font-semibold leading-6 text-gray-900 text-xs">AI Assistant</div>
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

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 bg-white">
            <div className="space-y-4">
              {messages.map((message, index) => (
                <div key={index} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`rounded-lg px-4 py-3 max-w-[85%] border ${
                      message.role === "user"
                        ? "bg-blue-50 border-blue-200 text-blue-800"
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
                  </div>
                </div>
              ))}
              {isProcessing && (
                <div className="flex justify-start">
                  <div className="rounded-lg px-4 py-3 bg-gray-50 border border-gray-200 text-gray-900">
                    <div className="flex items-center space-x-2">
                      <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-gray-600"></div>
                      <span className="text-xs">Thinking...</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-gray-200 px-4 py-6 sm:px-6 text-xs bg-gray-50">
            <div className="flex space-x-2 items-center">
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder={
                  awaitingConfirmation
                    ? "Type 'yes' to confirm or 'no' to cancel..."
                    : "Ask me to add a payee or category..."
                }
                disabled={isProcessing}
                className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                onClick={handleSendMessage}
                disabled={!inputValue.trim() || isProcessing}
                className="rounded-md bg-blue-600 px-4 py-2 text-white text-xs hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center space-x-1"
              >
                <Send className="h-3 w-3" />
                <span>Send</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
