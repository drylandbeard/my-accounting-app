'use client';
import React, { createContext, useContext, useState, ReactNode } from 'react';

// Context type
type SelectedToAddContextType = {
  selectedToAdd: Set<string>;
  setSelectedToAdd: (ids: Set<string>) => void;
};

const SelectedToAddContext = createContext<SelectedToAddContextType | undefined>(undefined);

export function SelectedToAddProvider({ children }: { children: ReactNode }) {
  const [selectedToAdd, setSelectedToAdd] = useState<Set<string>>(new Set());
  return (
    <SelectedToAddContext.Provider value={{ selectedToAdd, setSelectedToAdd }}>
      {children}
    </SelectedToAddContext.Provider>
  );
}

export function useSelectedToAdd() {
  const context = useContext(SelectedToAddContext);
  if (!context) {
    throw new Error('useSelectedToAdd must be used within a SelectedToAddProvider');
  }
  return context;
} 