'use client';
import React, { createContext, useContext, useState, ReactNode } from 'react';

// Context type
type ImportedTransactionsContextType = {
  importedTransactions: any[];
  setImportedTransactions: React.Dispatch<React.SetStateAction<any[]>>;
};

const ImportedTransactionsContext = createContext<ImportedTransactionsContextType | undefined>(undefined);

export function ImportedTransactionsProvider({ children }: { children: ReactNode }) {
  const [importedTransactions, setImportedTransactions] = useState<any[]>([]);
  return (
    <ImportedTransactionsContext.Provider value={{ importedTransactions, setImportedTransactions }}>
      {children}
    </ImportedTransactionsContext.Provider>
  );
}

export function useImportedTransactions() {
  const context = useContext(ImportedTransactionsContext);
  if (!context) {
    throw new Error('useImportedTransactions must be used within an ImportedTransactionsProvider');
  }
  return context;
} 