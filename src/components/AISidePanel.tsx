"use client";

import React from "react";
import { X } from "lucide-react";

interface AISidePanelProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

const DEFAULT_PANEL_WIDTH = 400;

export default function AISidePanel({ isOpen, setIsOpen }: AISidePanelProps) {
  // Static sample messages for display
  const staticMessages = [
    { role: "user", content: "Hello AI Assistant" },
    { role: "assistant", content: "Hello! I'm your AI assistant. I can help you with accounting tasks, but I'm currently in static mode." },
    { role: "user", content: "Can you help me categorize transactions?" },
    { role: "assistant", content: "I'd be happy to help with transaction categorization once the AI functionality is properly configured!" }
  ];

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
              <div className="font-semibold leading-6 text-gray-900 text-xs">
                AI Assistant (Static Mode)
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
              {staticMessages.map((message, index) => (
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
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Static Input (non-functional) */}
          <div className="border-t border-gray-200 px-4 py-6 sm:px-6 text-xs bg-gray-50">
            <div className="flex space-x-2 items-center">
              <input
                type="text"
                placeholder="AI functionality disabled in static mode..."
                disabled={true}
                className="flex-1 rounded-md border border-gray-300 px-3 py-2 bg-gray-100 text-xs opacity-50 cursor-not-allowed"
              />
              <button
                disabled={true}
                className="rounded-md bg-gray-300 px-4 py-2 text-gray-500 text-xs cursor-not-allowed opacity-50"
                aria-label="Send message (disabled)"
              >
                Send
              </button>
            </div>
            <div className="mt-2 text-gray-500 text-xs">
              AI Assistant is currently in static display mode
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
