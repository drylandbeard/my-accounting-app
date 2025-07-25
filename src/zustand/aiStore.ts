import { create } from "zustand";

interface Message {
  role: "user" | "assistant";
  content: string;
  showConfirmation?: boolean;
  pendingAction?: {
    type: "createPayee" | "createCategory";
    data: {
      name: string;
      type?: "income" | "expense";
    };
  };
}

interface AIState {
  // AI Panel state
  isPanelOpen: boolean;
  messages: Message[];
  awaitingConfirmation: boolean;
  pendingAction: {
    type: "createPayee" | "createCategory";
    data: {
      name: string;
      type?: "income" | "expense";
    };
  } | null;

  // Actions
  setPanelOpen: (isOpen: boolean) => void;
  addMessage: (message: Message) => void;
  updateMessage: (index: number, message: Message) => void;
  setMessages: (messages: Message[]) => void;
  setPendingAction: (action: AIState["pendingAction"]) => void;
  setAwaitingConfirmation: (awaiting: boolean) => void;
  clearPendingAction: () => void;
}

export const useAIStore = create<AIState>((set) => ({
  // Initial state
  isPanelOpen: false,
  messages: [],
  awaitingConfirmation: false,
  pendingAction: null,

  // Actions
  setPanelOpen: (isOpen) => set({ isPanelOpen: isOpen }),

  addMessage: (message) =>
    set((state) => ({
      messages: [...state.messages, message],
    })),

  updateMessage: (index, message) =>
    set((state) => ({
      messages: state.messages.map((msg, i) => (i === index ? message : msg)),
    })),

  setMessages: (messages) => set({ messages }),

  setPendingAction: (action) =>
    set({
      pendingAction: action,
      awaitingConfirmation: !!action && (action.type === "createPayee" || !!action.data.type),
    }),

  setAwaitingConfirmation: (awaiting) => set({ awaitingConfirmation: awaiting }),

  clearPendingAction: () =>
    set({
      pendingAction: null,
      awaitingConfirmation: false,
    }),
}));
