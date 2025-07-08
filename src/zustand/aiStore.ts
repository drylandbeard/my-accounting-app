import { create } from 'zustand';


interface Message {
  role: "user" | "assistant";
  content: string;
  showConfirmation?: boolean;
  pendingAction?: {
    action: string;
    [key: string]: unknown;
  };
}

interface AIState {
  // AI Panel state
  isPanelOpen: boolean;
  messages: Message[];
  
  // Actions
  setPanelOpen: (isOpen: boolean) => void;
  addMessage: (message: Message) => void;
  updateMessage: (index: number, message: Message) => void;
  setMessages: (messages: Message[]) => void;
}

export const useAIStore = create<AIState>((set) => ({
  // Initial state
  isPanelOpen: false,
  messages: [],
  
  // Actions
  setPanelOpen: (isOpen) => set({ isPanelOpen: isOpen }),
  
  addMessage: (message) => set((state) => ({
    messages: [...state.messages, message]
  })),
  
  updateMessage: (index, message) => set((state) => ({
    messages: state.messages.map((msg, i) => i === index ? message : msg)
  })),
  
  setMessages: (messages) => set({ messages })
})); 