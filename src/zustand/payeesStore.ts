import { create } from 'zustand';
import { supabase } from '@/lib/supabase';

// Types
export interface Payee {
  id: string;
  name: string;
  company_id: string;
}

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
  refreshPayees: (companyId: string) => Promise<void>;
  addPayee: (payee: Omit<Payee, 'id'>) => Promise<Payee | null>;
  updatePayee: (id: string, updates: Partial<Payee>) => Promise<boolean>;
  deletePayee: (id: string) => Promise<boolean>;
  highlightPayee: (payeeId: string) => void;
  clearError: () => void;
}

export const usePayeesStore = create<PayeesState>((set, get) => ({
  // Initial state
  payees: [],
  isLoading: false,
  error: null,
  highlightedPayeeIds: new Set(),
  lastActionPayeeId: null,
  
  // Actions
  refreshPayees: async (companyId: string) => {
    set({ isLoading: true, error: null });
    try {
      const { data, error } = await supabase
        .from('payees')
        .select('*')
        .eq('company_id', companyId)
        .order('name');
      
      if (error) {
        console.error('Error refreshing payees:', error);
        set({ error: error.message, isLoading: false });
        return;
      }
      
      set({ payees: data || [], isLoading: false });
    } catch (err) {
      console.error('Error in refreshPayees:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to refresh payees';
      set({ error: errorMessage, isLoading: false });
    }
  },
  
  addPayee: async (payeeData) => {
    try {
      // Check for duplicate names (case-insensitive)
      const { payees } = get();
      const existingPayee = payees.find(
        (payee) => payee.name.toLowerCase() === payeeData.name.toLowerCase()
      );
      
      if (existingPayee) {
        set({ error: `Payee "${payeeData.name}" already exists.` });
        return null;
      }
      
      const { data, error } = await supabase
        .from('payees')
        .insert([payeeData])
        .select()
        .single();
      
      if (error) {
        console.error('Error adding payee:', error);
        set({ error: `Failed to add payee: ${error.message}` });
        return null;
      }
      
      // Optimistically update the store
      const newPayee = data as Payee;
      set((state) => ({
        payees: [...state.payees, newPayee].sort((a, b) => a.name.localeCompare(b.name)),
        error: null
      }));
      
      // Highlight the new payee
      get().highlightPayee(newPayee.id);
      
      return newPayee;
    } catch (err) {
      console.error('Error in addPayee:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to add payee';
      set({ error: errorMessage });
      return null;
    }
  },
  
  updatePayee: async (id: string, updates) => {
    try {
      // Check for duplicate names (case-insensitive, excluding current)
      const { payees } = get();
      if (updates.name) {
        const existingPayee = payees.find(
          (payee) => payee.id !== id && payee.name.toLowerCase() === updates.name!.toLowerCase()
        );
        
        if (existingPayee) {
          set({ error: `Payee "${updates.name}" already exists.` });
          return false;
        }
      }
      
      // Optimistic update
      const updatedPayees = payees.map((payee) =>
        payee.id === id ? { ...payee, ...updates } : payee
      );
      set({ payees: updatedPayees, error: null });
      
      const { error } = await supabase
        .from('payees')
        .update(updates)
        .eq('id', id);
      
      if (error) {
        console.error('Error updating payee:', error);
        // Revert optimistic update
        set({ payees, error: `Failed to update payee: ${error.message}` });
        return false;
      }
      
      // Highlight the updated payee
      get().highlightPayee(id);
      
      return true;
    } catch (err) {
      console.error('Error in updatePayee:', err);
      // Revert optimistic update
      const { payees } = get();
      set({ payees, error: 'Failed to update payee' });
      return false;
    }
  },
  
  deletePayee: async (id: string) => {
    try {
      // Check if payee is used in transactions
      const { data: transactions, error: txError } = await supabase
        .from('transactions')
        .select('id')
        .eq('payee_id', id)
        .limit(1);
      
      if (txError) {
        console.error('Error checking transactions:', txError);
        set({ error: 'Error checking if payee is in use. Please try again.' });
        return false;
      }
      
      if (transactions && transactions.length > 0) {
        set({ error: 'Cannot delete payee because it is used in existing transactions. Please reassign or delete the transactions first.' });
        return false;
      }
      
      // Optimistic delete
      const { payees } = get();
      const updatedPayees = payees.filter((payee) => payee.id !== id);
      set({ payees: updatedPayees, error: null });
      
      const { error } = await supabase
        .from('payees')
        .delete()
        .eq('id', id);
      
      if (error) {
        console.error('Error deleting payee:', error);
        // Revert optimistic delete
        set({ payees, error: `Failed to delete payee: ${error.message}` });
        return false;
      }
      
      return true;
    } catch (err) {
      console.error('Error in deletePayee:', err);
      set({ error: 'Failed to delete payee' });
      return false;
    }
  },
  
  highlightPayee: (payeeId: string) => {
    const { highlightedPayeeIds } = get();
    const newHighlightedIds = new Set(highlightedPayeeIds);
    newHighlightedIds.add(payeeId);
    
    set({ 
      highlightedPayeeIds: newHighlightedIds,
      lastActionPayeeId: payeeId 
    });
    
    // Remove highlight after 3 seconds
    setTimeout(() => {
      const currentState = get();
      const updatedIds = new Set(currentState.highlightedPayeeIds);
      updatedIds.delete(payeeId);
      
      set({
        highlightedPayeeIds: updatedIds,
        lastActionPayeeId: currentState.lastActionPayeeId === payeeId ? null : currentState.lastActionPayeeId
      });
    }, 3000);
  },
  
  clearError: () => {
    set({ error: null });
  }
})); 