import { create } from "zustand";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";

// Types
export interface Payee {
  id: string;
  name: string;
  company_id: string;
}

// Helper function to sort payees alphabetically by name
const sortPayees = (payees: Payee[]): Payee[] => {
  return [...payees].sort((a, b) => a.name.localeCompare(b.name));
};

// Store interface
interface PayeesState {
  // Payees data
  payees: Payee[];
  isLoading: boolean;
  error: string | null;

  // Highlighting for real-time updates
  highlightedPayeeIds: Set<string>;
  lastActionPayeeId: string | null;

  // Actions
  refreshPayees: () => Promise<void>;
  addPayee: (payee: { name: string }) => Promise<Payee | null>;
  createPayeeForTransaction: (payeeData: {
    name: string;
  }) => Promise<{ success: boolean; payeeId?: string; error?: string }>;
  updatePayee: (idOrName: string, updates: { name: string }) => Promise<boolean>;
  deletePayee: (idOrName: string) => Promise<boolean>;
  highlightPayee: (payeeId: string) => void;
  clearError: () => void;

  // Helper functions
  findPayeeByName: (name: string, caseSensitive?: boolean) => Payee | null;

  // Real-time subscriptions
  subscriptions: ReturnType<typeof supabase.channel>[];
  subscribeToPayees: (companyId: string) => () => void;
  unsubscribeFromPayees: () => void;
}

export const usePayeesStore = create<PayeesState>((set, get) => ({
  // Initial state
  payees: [],
  isLoading: false,
  error: null,
  highlightedPayeeIds: new Set(),
  lastActionPayeeId: null,
  subscriptions: [],

  // Actions
  refreshPayees: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.get("/api/payee");

      if (!response.ok) {
        const errorData = await response.json();
        console.error("API error refreshing payees:", errorData.error);
        set({ error: errorData.error || "Failed to refresh payees", isLoading: false });
        return;
      }

      const result = await response.json();
      set({ payees: result.payees || [], isLoading: false });
    } catch (err) {
      console.error("Error in refreshPayees:", err);
      const errorMessage = err instanceof Error ? err.message : "Failed to refresh payees";
      set({ error: errorMessage, isLoading: false });
    }
  },

  addPayee: async (payeeData) => {
    try {
      console.log("addPayee called with:", payeeData); // Debug log
      // Prepare data for API call
      const requestData = {
        name: payeeData.name.trim(),
      };
      console.log("API request data:", requestData); // Debug log

      // Call the API route
      const response = await api.post("/api/payee/create", requestData);

      if (!response.ok) {
        const errorData = await response.json();
        console.error("API error adding payee:", errorData.error);
        set({ error: errorData.error || "Failed to add payee" });
        return null;
      }

      const result = await response.json();
      const newPayee = result.payee as Payee;

      // Update the store with the sorted payees from the API
      if (result.payees) {
        set({
          payees: result.payees,
          error: null,
        });
      } else {
        // Fallback: add to existing payees with proper sorting if sorted list not available
        const updatedPayees = [...get().payees, newPayee];
        const sortedPayees = sortPayees(updatedPayees);
        set({
          payees: sortedPayees,
          error: null,
        });
      }

      // Highlight the new payee
      get().highlightPayee(newPayee.id);

      return newPayee;
    } catch (err) {
      console.error("Error in addPayee:", err);
      const errorMessage = err instanceof Error ? err.message : "Network error occurred";
      set({ error: errorMessage });
      return null;
    }
  },

  createPayeeForTransaction: async (payeeData) => {
    try {
      set({ isLoading: true, error: null });

      if (!payeeData.name.trim()) {
        return { success: false, error: "Payee name is required" };
      }

      // Make the API call directly like the working version in the page
      const response = await api.post("/api/payee/create", {
        name: payeeData.name.trim(),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error("Error creating payee:", errorData.error);
        set({ error: errorData.error || "Failed to create payee" });
        return { success: false, error: errorData.error || "Failed to create payee" };
      }

      const data = await response.json();
      const payeeId = data.payee.id;

      // Update the store with the new payee data
      if (data.payees) {
        set({
          payees: data.payees,
          error: null,
        });
      } else {
        // Refresh payees to get the latest list
        await get().refreshPayees();
      }

      // Highlight the new payee
      get().highlightPayee(payeeId);

      return { success: true, payeeId };
    } catch (error) {
      console.error("Error creating payee for transaction:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to create payee";
      set({ error: errorMessage });
      return { success: false, error: errorMessage };
    } finally {
      set({ isLoading: false });
    }
  },

  updatePayee: async (idOrName: string, updates) => {
    // Determine if we have an ID or name
    let payeeId = idOrName;

    // Check if it looks like a UUID (ID) or a name
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrName);

    if (!isUUID) {
      // It's likely a name, find the payee by name
      const payee = get().findPayeeByName(idOrName);
      if (!payee) {
        set({ error: `Payee not found: ${idOrName}` });
        return false;
      }
      payeeId = payee.id;
    }

    try {
      // Optimistic update with proper sorting
      const { payees } = get();
      const updatedPayees = payees.map((payee) => (payee.id === payeeId ? { ...payee, ...updates } : payee));

      // Sort the payees to keep them alphabetically arranged
      const sortedPayees = sortPayees(updatedPayees);
      set({ payees: sortedPayees, error: null });

      // Highlight immediately with optimistic update
      get().highlightPayee(payeeId);

      // Prepare data for API call
      const requestData = {
        id: payeeId,
        name: updates.name.trim(),
      };

      // Call the API route
      const response = await api.put("/api/payee/update", requestData);

      if (!response.ok) {
        const errorData = await response.json();
        console.error("API error updating payee:", errorData.error);
        // Revert optimistic update
        set({ payees, error: errorData.error || "Failed to update payee" });
        return false;
      }

      const result = await response.json();

      // Update the store with the sorted payees from the API if available
      if (result.payees) {
        set({
          payees: result.payees,
          error: null,
        });
      }

      return true;
    } catch (err) {
      console.error("Error in updatePayee:", err);
      // Revert optimistic update
      const { payees } = get();
      const errorMessage = err instanceof Error ? err.message : "Network error occurred";
      set({ payees, error: errorMessage });
      return false;
    }
  },

  deletePayee: async (idOrName: string) => {
    // Determine if we have an ID or name
    let payeeId = idOrName;

    // Check if it looks like a UUID (ID) or a name
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrName);

    if (!isUUID) {
      // It's likely a name, find the payee by name
      const payee = get().findPayeeByName(idOrName);
      if (!payee) {
        set({ error: `Payee not found: ${idOrName}` });
        return false;
      }
      payeeId = payee.id;
    }

    try {
      // Capture original payees before optimistic delete
      const { payees: originalPayees } = get();
      const updatedPayees = originalPayees.filter((payee) => payee.id !== payeeId);

      // Optimistic delete
      set({ payees: updatedPayees, error: null });

      // Call the API route
      const response = await api.delete("/api/payee/delete", {
        body: JSON.stringify({ payeeId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error("API error deleting payee:", errorData.error);
        // Revert optimistic delete
        set({ payees: originalPayees, error: errorData.error || "Failed to delete payee" });
        return false;
      }

      const result = await response.json();

      // Update the store with the sorted payees from the API if available
      if (result.payees) {
        set({
          payees: result.payees,
          error: null,
        });
      }

      return true;
    } catch (err) {
      console.error("Error in deletePayee:", err);
      // Revert optimistic delete by refreshing from API
      get().refreshPayees();
      set({ error: "Failed to delete payee" });
      return false;
    }
  },

  highlightPayee: (payeeId: string) => {
    const { highlightedPayeeIds } = get();
    const newHighlightedIds = new Set(highlightedPayeeIds);
    newHighlightedIds.add(payeeId);

    set({
      highlightedPayeeIds: newHighlightedIds,
      lastActionPayeeId: payeeId,
    });

    // Remove highlight after 3 seconds
    setTimeout(() => {
      const currentState = get();
      const updatedIds = new Set(currentState.highlightedPayeeIds);
      updatedIds.delete(payeeId);

      set({
        highlightedPayeeIds: updatedIds,
        lastActionPayeeId: currentState.lastActionPayeeId === payeeId ? null : currentState.lastActionPayeeId,
      });
    }, 3000);
  },

  clearError: () => {
    set({ error: null });
  },

  // Helper functions
  findPayeeByName: (name: string, caseSensitive?: boolean) => {
    const { payees } = get();
    const foundPayee = payees.find((payee) =>
      caseSensitive ? payee.name === name : payee.name.toLowerCase() === name.toLowerCase()
    );
    return foundPayee || null;
  },

  // Real-time subscription functions
  subscribeToPayees: (companyId: string) => {
    // Clean up existing subscriptions first
    get().unsubscribeFromPayees();

    const subscriptions: ReturnType<typeof supabase.channel>[] = [];

    // Subscribe to payees changes
    const payeesSubscription = supabase
      .channel("payees_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "payees",
          filter: `company_id=eq.${companyId}`,
        },
        (payload) => {
          console.log("Payees changed:", payload.eventType);
          get().refreshPayees();
        }
      )
      .subscribe();

    subscriptions.push(payeesSubscription);
    set({ subscriptions });

    // Return cleanup function
    return () => {
      subscriptions.forEach((subscription) => {
        supabase.removeChannel(subscription);
      });
      set({ subscriptions: [] });
    };
  },

  unsubscribeFromPayees: () => {
    const { subscriptions } = get();
    subscriptions.forEach((subscription) => {
      supabase.removeChannel(subscription);
    });
    set({ subscriptions: [] });
  },
}));
