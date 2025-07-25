"use client";

import React, { useState, useEffect, useRef } from "react";
import { X, RefreshCcw, ArrowUpCircle } from "lucide-react";
import { usePayeesStore } from "@/zustand/payeesStore";
import { useAuthStore } from "@/zustand/authStore";
import { useChatHistory } from "@/hooks/useChatHistory";
import { AIHandler } from "@/lib/ai/ai-handler";
import { Message, AISidePanelProps } from "@/lib/ai/types";

const MIN_PANEL_WIDTH = 320;
const MAX_PANEL_WIDTH = 600;
const DEFAULT_PANEL_WIDTH = 400;

export default function AISidePanel({ isOpen, setIsOpen }: AISidePanelProps) {
  // Component state
  const [inputMessage, setInputMessage] = useState("");
  const [panelWidth, setPanelWidth] = useState(DEFAULT_PANEL_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Refs
  const resizeRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  
  // Store hooks
  const { 
    payees, 
    refreshPayees: refreshPayeesFromStore,
    error: payeesError
  } = usePayeesStore();
  
  const { currentCompany, user } = useAuthStore();
  
  // Chat history hook
  const {
    messages,
    isLoading: historyLoading,
    error: historyError,
    addMessage,
    updateMessage,
    clearMessages
  } = useChatHistory(currentCompany?.id || null, user?.id || null);

  // AI Handler
  const [aiHandler, setAiHandler] = useState<AIHandler | null>(null);

  // Initialize AI Handler
  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_OPENAI_API_KEY;
    
    if (!apiKey) {
      console.error('OpenAI API key not found');
      return;
    }

    // Create new handler with current payees and store methods
    const handler = new AIHandler(
      {
        payees,
        error: payeesError,
        addPayee: usePayeesStore.getState().addPayee,
        updatePayee: usePayeesStore.getState().updatePayee,
        deletePayee: usePayeesStore.getState().deletePayee,
        refreshPayees: refreshPayeesFromStore
      },
      currentCompany,
      apiKey
    );

    setAiHandler(handler);
  }, [payees, payeesError, currentCompany, refreshPayeesFromStore]);

  // Load saved panel width from localStorage
  useEffect(() => {
    const savedWidth = localStorage.getItem("aiPanelWidth");
    if (savedWidth) {
      setPanelWidth(parseInt(savedWidth, 10));
    }
  }, []);

  // Save panel width to localStorage
  useEffect(() => {
    localStorage.setItem("aiPanelWidth", panelWidth.toString());
  }, [panelWidth]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    // Use a small delay to ensure DOM has updated
    const scrollTimeout = setTimeout(() => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ 
          behavior: "smooth", 
          block: "end" 
        });
      }
    }, 100);

    return () => clearTimeout(scrollTimeout);
  }, [messages]);

  // Also scroll immediately when new messages are added (for instant feedback)
  useEffect(() => {
    if (messagesEndRef.current && messages.length > 0) {
      // Immediate scroll for the latest message
      const latestMessage = messages[messages.length - 1];
      if (latestMessage?.content === "Thinking..." || latestMessage?.content === "Processing...") {
        messagesEndRef.current.scrollIntoView({ 
          behavior: "smooth", 
          block: "end" 
        });
      }
    }
  }, [messages]);

  // Scroll to bottom when panel opens and has messages
  useEffect(() => {
    if (isOpen && messages.length > 0 && messagesEndRef.current) {
      // Small delay to ensure panel animation is complete
      const openScrollTimeout = setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ 
          behavior: "smooth", 
          block: "end" 
        });
      }, 350); // Wait for panel transition to complete

      return () => clearTimeout(openScrollTimeout);
    }
  }, [isOpen, messages.length]);

  // Panel resize handlers
  const handleResizeStart = (e: React.MouseEvent) => {
    setIsResizing(true);
    e.preventDefault();
    document.body.style.userSelect = "none";
    document.body.style.cursor = "ew-resize";
  };

  useEffect(() => {
    if (isResizing) {
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
      
      window.addEventListener("mousemove", handleResizeMove);
      window.addEventListener("mouseup", handleResizeEnd);
      
      return () => {
        window.removeEventListener("mousemove", handleResizeMove);
        window.removeEventListener("mouseup", handleResizeEnd);
      };
    }
  }, [isResizing]);

  // Function to refresh/clear chat context
  const handleRefreshContext = async () => {
    await clearMessages();
  };

  // Handle message sending
  const handleSendMessage = async () => {
    if (!inputMessage.trim() || !aiHandler || isProcessing) return;

    const userMessage = inputMessage.trim();
    setInputMessage("");
    setIsProcessing(true);

    // Add user message
    const userMsg: Message = {
      role: "user",
      content: userMessage,
    };
    addMessage(userMsg);

    // Add thinking message and get its index
    const thinkingMsg: Message = {
      role: "assistant",
      content: "Thinking...",
    };
    addMessage(thinkingMsg);
    const thinkingMessageIndex = messages.length + 1; // +1 for the user message we just added

    try {
      // Refresh payees to ensure we have the latest state from database
      console.log('🔄 Refreshing payees before AI processing...');
      await refreshPayeesFromStore();
      
      // Get fresh payees from store after refresh
      const freshPayees = usePayeesStore.getState().payees;
      console.log(`✅ Using fresh payees for AI: ${freshPayees.length} payees`);
      
      // Process with AI Handler using fresh payees
      const result = await aiHandler.processUserMessage(
        userMessage,
        messages,
        freshPayees
      );

      if (result.success && result.response) {
        // Replace thinking message with AI response
        updateMessage(thinkingMessageIndex, result.response);
      } else {
        // Show error message
        updateMessage(thinkingMessageIndex, {
          role: "assistant",
          content: `❌ ${result.error || 'Sorry, there was an error processing your request.'}`,
          isError: true
        });
      }
    } catch (error) {
      console.error('Error processing message:', error);
      updateMessage(thinkingMessageIndex, {
        role: "assistant",
        content: "❌ Sorry, there was an error contacting the AI service.",
        isError: true
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle confirmation
  const handleConfirm = async (messageIndex: number) => {
    if (!aiHandler) return;

    const message = messages[messageIndex];
    if (!message.pendingAction) return;

    // Add user confirmation message
    addMessage({ role: "user", content: "Confirmed" });

    // Remove confirmation UI from the message
    updateMessage(messageIndex, { 
      showConfirmation: false, 
      pendingAction: undefined 
    });

    // Add processing message and get its index
    const processingMsg: Message = {
      role: "assistant",
      content: "Processing...",
    };
    addMessage(processingMsg);
    const processingMessageIndex = messages.length + 1; // +1 for the "Confirmed" message we just added

    setIsProcessing(true);

    try {
      // Execute the action
      const result = await aiHandler.executeAction(message.pendingAction);
      
      // Replace processing message with result
      updateMessage(processingMessageIndex, {
        role: "assistant",
        content: result
      });

      // Refresh payees after successful operations
      await refreshPayeesFromStore();
    } catch (error) {
      console.error('Error executing action:', error);
      // Replace processing message with error
      updateMessage(processingMessageIndex, {
        role: "assistant",
        content: `❌ Failed to execute action: ${error instanceof Error ? error.message : 'Unknown error'}`,
        isError: true
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle cancellation
  const handleCancel = (messageIndex: number) => {
    // Add user cancellation message
    addMessage({ role: "user", content: "Cancelled" });

    // Remove confirmation UI from the message
    updateMessage(messageIndex, { 
      showConfirmation: false, 
      pendingAction: undefined 
    });
  };

  // Panel styling
  const panelStyle = {
    width: isOpen ? panelWidth : 0,
    transition: isResizing ? "none" : "width 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
    minWidth: isOpen ? MIN_PANEL_WIDTH : 0,
    maxWidth: MAX_PANEL_WIDTH,
    overflow: "hidden",
    boxShadow: isOpen ? "rgba(0,0,0,0.1) 0px 0px 16px" : "none",
    background: "white",
    height: "calc(100vh - 2.75rem)", // Account for navbar height (h-11 = 2.75rem)
    display: "flex",
    flexDirection: "column" as const,
    borderLeft: isOpen ? "1px solid #e5e7eb" : "none",
    position: "sticky" as const,
    top: "2.75rem", // Position below navbar (h-11 = 2.75rem)
    zIndex: 30, // Lower than navbar but above content
  };

  return (
    <div style={panelStyle} className={isResizing ? "select-none" : ""}>
      {isOpen && (
        <div className="flex h-full flex-col bg-white shadow-xl font-sans text-xs">
        {/* Header */}
        <div className="px-4 py-6 sm:px-6 bg-gray-50 border-b border-gray-200">
          <div className="flex items-start justify-between">
            <div className="font-semibold leading-6 text-gray-900 text-xs">
              AI Assistant
              {historyLoading && <span className="ml-2 text-gray-500">(Loading...)</span>}
              {historyError && <span className="ml-2 text-red-500">(Error)</span>}
            </div>
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
            {messages.map((message: Message, index: number) => (
              <div key={index} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`rounded-lg px-4 py-3 max-w-[85%] border ${
                    message.role === "user" 
                      ? "bg-white border-gray-200 text-gray-800" 
                      : message.isError
                      ? "bg-red-50 border-red-200 text-red-900"
                      : "bg-gray-50 border-gray-200 text-gray-900"
                  }`}
                >
                  <div
                    className={`whitespace-pre-line leading-relaxed text-xs ${
                      message.role === "user" ? "font-medium" : "font-normal"
                    }`}
                  >
                    {/* Show animated dots for thinking/processing messages */}
                    {(message.content === "Thinking..." || message.content === "Processing...") ? (
                      <div className="flex items-center space-x-1">
                        <span>{message.content.replace("...", "")}</span>
                        <div className="flex space-x-1">
                          <div className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                          <div className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                          <div className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                        </div>
                      </div>
                    ) : (
                      message.content
                    )}
                  </div>

                  {/* Confirmation buttons */}
                  {message.showConfirmation && message.pendingAction && (
                    <div className="mt-4 flex gap-3 border-t border-gray-100 pt-3">
                      <button
                        onClick={() => handleConfirm(index)}
                        disabled={isProcessing}
                        className="px-4 py-2 bg-gray-900 text-white rounded-md text-xs font-medium hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-1 transition-colors duration-200 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        ✓ Confirm
                      </button>
                      <button
                        onClick={() => handleCancel(index)}
                        disabled={isProcessing}
                        className="px-4 py-2 bg-gray-100 text-gray-700 border border-gray-300 rounded-md text-xs font-medium hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-1 transition-colors duration-200 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
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

        {/* Input */}
        <div className="border-t border-gray-200 px-4 py-6 sm:px-6 text-xs bg-gray-50">
          <div className="flex space-x-2 items-center">
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && !e.shiftKey && handleSendMessage()}
              placeholder="Message AI Assistant..."
              disabled={isProcessing || !aiHandler}
              className="flex-1 rounded-md border border-gray-300 px-3 py-2 bg-white focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <button
              onClick={handleSendMessage}
              disabled={isProcessing || !aiHandler || !inputMessage.trim()}
              className="rounded-md bg-gray-900 px-4 py-2 text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 text-xs flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Send message"
            >
              <ArrowUpCircle className="w-5 h-5" />
            </button>
            <button
              onClick={handleRefreshContext}
              disabled={isProcessing}
              className="rounded-md bg-gray-100 text-gray-700 border border-gray-300 px-3 py-2 hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 text-xs flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
              title="Clear chat history"
            >
              <RefreshCcw className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
      )}

      {/* Resize handle - only show when panel is open */}
      {isOpen && (
        <div
          ref={resizeRef}
          className={`absolute left-0 top-0 h-full w-0.5 cursor-ew-resize group ${
            isResizing ? "bg-gray-500" : "bg-gray-200 hover:bg-gray-400"
          } transition-colors duration-200`}
          onMouseDown={handleResizeStart}
          title="Drag to resize panel"
        />
      )}
      
      {isResizing && (
        <div className="fixed inset-0 z-50 cursor-ew-resize" style={{ background: "transparent" }} />
      )}
    </div>
  );
}
