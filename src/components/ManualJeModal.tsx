import React from 'react';
import { X } from 'lucide-react';
import Select from 'react-select';
import { isZeroAmount } from '@/lib/financial';

// Types
export type JournalEntryLine = {
  id: string;
  description: string;
  categoryId: string;
  payeeId: string;
  debit: string;
  credit: string;
};

export type NewJournalEntry = {
  date: string;
  description: string;
  jeName: string;
  lines: JournalEntryLine[];
};

export type EditJournalModalState = {
  isOpen: boolean;
  referenceNumber: string;
  editEntry: NewJournalEntry & { referenceNumber?: string };
  saving: boolean;
  error: string | null;
};

type SelectOption = {
  value: string;
  label: string;
};

interface ManualJeModalProps {
  // Add Modal Props
  showAddModal: boolean;
  setShowAddModal: (show: boolean) => void;
  newEntry: NewJournalEntry;
  setNewEntry: React.Dispatch<React.SetStateAction<NewJournalEntry>>;
  saving: boolean;
  isBalanced: boolean;
  totalDebits: number;
  totalCredits: number;
  addJournalLine: () => void;
  removeJournalLine: (lineId: string) => void;
  updateJournalLine: (lineId: string, field: keyof JournalEntryLine, value: string) => void;
  handleAmountChange: (lineId: string, field: 'debit' | 'credit', value: string) => void;
  handleAddEntry: () => Promise<void>;
  
  // Edit Modal Props
  editModal: EditJournalModalState;
  setEditModal: React.Dispatch<React.SetStateAction<EditJournalModalState>>;
  updateEditJournalLine: (lineId: string, field: keyof JournalEntryLine, value: string) => void;
  handleEditAmountChange: (lineId: string, field: 'debit' | 'credit', value: string) => void;
  addEditJournalLine: () => void;
  removeEditJournalLine: (lineId: string) => void;
  calculateEditTotals: () => { totalDebits: number; totalCredits: number };
  handleSaveEditEntry: () => Promise<void>;
  
  // Shared Props
  categoryOptions: SelectOption[];
  payees: Array<{ id: string; name: string }>;
  setNewCategoryModal: React.Dispatch<React.SetStateAction<{
    isOpen: boolean;
    name: string;
    type: string;
    parent_id: string | null;
    lineId: string | null;
  }>>;
}

export default function ManualJeModal({
  // Add Modal Props
  showAddModal,
  setShowAddModal,
  newEntry,
  setNewEntry,
  saving,
  isBalanced,
  totalDebits,
  totalCredits,
  addJournalLine,
  removeJournalLine,
  updateJournalLine,
  handleAmountChange,
  handleAddEntry,
  
  // Edit Modal Props
  editModal,
  setEditModal,
  updateEditJournalLine,
  handleEditAmountChange,
  addEditJournalLine,
  removeEditJournalLine,
  calculateEditTotals,
  handleSaveEditEntry,
  
  // Shared Props
  categoryOptions,
  payees,
  setNewCategoryModal
}: ManualJeModalProps) {
  
  return (
    <>
      {/* Add Journal Entry Modal */}
      {showAddModal && (
        <div 
          className="fixed inset-0 bg-black/70 flex items-center justify-center h-full z-50"
          onClick={() => setShowAddModal(false)}
        >
          <div 
            className="bg-white rounded-lg p-6 w-[80%] overflow-y-auto shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Add Journal Entry</h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-gray-500 hover:text-gray-700 text-xl"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            {/* Date and JE Name selectors */}
            <div className="mb-4 grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Date</label>
                <input
                  type="date"
                  value={newEntry.date}
                  onChange={(e) => setNewEntry(prev => ({ ...prev, date: e.target.value }))}
                  className="border px-3 py-2 rounded text-sm w-full"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">JE Name</label>
                <input
                  type="text"
                  value={newEntry.jeName}
                  onChange={(e) => setNewEntry(prev => ({ ...prev, jeName: e.target.value }))}
                  className="border px-3 py-2 rounded text-sm w-full"
                  placeholder="Enter journal entry name"
                />
              </div>
            </div>
            
            {/* Journal Entry Table */}
            <div className="border rounded-lg overflow-visible relative">
              <table className="w-full border-collapse">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="border px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Payee</th>
                    <th className="border px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                    <th className="border px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                    <th className="border px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Spent (Debit)</th>
                    <th className="border px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Received (Credit)</th>
                  </tr>
                </thead>
                <tbody className="bg-white">
                  {newEntry.lines.map((line) => {
                    // Determine if we can remove lines (only if there are more than 1 line)
                    const canRemoveLines = newEntry.lines.length > 1;
                    
                    return (
                      <tr key={line.id} className="relative">
                        <td className="border px-4 py-2">
                          <Select
                            options={[
                              { value: '', label: 'Select payee...' },
                              ...payees.map(payee => ({ value: payee.id, label: payee.name }))
                            ]}
                            value={payees.find(p => p.id === line.payeeId) ? 
                              { value: line.payeeId, label: payees.find(p => p.id === line.payeeId)?.name || '' } :
                              { value: '', label: 'Select payee...' }
                            }
                            onChange={(selectedOption) => {
                              const option = selectedOption as SelectOption | null;
                              updateJournalLine(line.id, 'payeeId', option?.value || '');
                            }}
                            isSearchable
                            menuPortalTarget={document.body}
                            styles={{
                              control: (base) => ({
                                ...base,
                                border: 'none',
                                boxShadow: 'none',
                                minHeight: 'auto',
                                fontSize: '12px',
                                '&:hover': {
                                  border: 'none'
                                }
                              }),
                              menu: (base) => ({ 
                                ...base, 
                                zIndex: 9999,
                                fontSize: '12px'
                              }),
                              menuPortal: (base) => ({ 
                                ...base, 
                                zIndex: 9999 
                              })
                            }}
                          />
                        </td>
                        <td className="border px-4 py-2">
                          <input
                            type="text"
                            value={line.description}
                            onChange={(e) => updateJournalLine(line.id, 'description', e.target.value)}
                            className="w-full border-0 px-0 py-0 text-xs focus:ring-0 focus:outline-none"
                            placeholder="Enter description"
                          />
                        </td>
                        <td className="border px-4 py-2">
                          <Select
                            options={categoryOptions}
                            value={categoryOptions.find(opt => opt.value === line.categoryId) || categoryOptions[0]}
                            onChange={(selectedOption) => {
                              const option = selectedOption as SelectOption | null;
                              if (option?.value === 'add_new') {
                                setNewCategoryModal({
                                  isOpen: true,
                                  name: '',
                                  type: 'Expense',
                                  parent_id: null,
                                  lineId: line.id
                                });
                              } else {
                                updateJournalLine(line.id, 'categoryId', option?.value || '');
                              }
                            }}
                            isSearchable
                            menuPortalTarget={document.body}
                            styles={{
                              control: (base) => ({
                                ...base,
                                border: 'none',
                                boxShadow: 'none',
                                minHeight: 'auto',
                                fontSize: '12px',
                                '&:hover': {
                                  border: 'none'
                                }
                              }),
                              menu: (base) => ({ 
                                ...base, 
                                zIndex: 9999,
                                fontSize: '12px'
                              }),
                              menuPortal: (base) => ({ 
                                ...base, 
                                zIndex: 9999 
                              })
                            }}
                          />
                        </td>
                        <td className="border px-4 py-2">
                          <input
                            type="text"
                            value={(() => {
                              const debit = line.debit;
                              return (debit && !isZeroAmount(debit)) ? debit : '';
                            })()}
                            onChange={(e) => handleAmountChange(line.id, 'debit', e.target.value)}
                            className="w-full border-0 px-0 py-0 text-xs text-right focus:ring-0 focus:outline-none"
                            placeholder="0.00"
                          />
                        </td>
                        <td className="border px-4 py-2">
                          <input
                            type="text"
                            value={(() => {
                              const credit = line.credit;
                              return (credit && !isZeroAmount(credit)) ? credit : '';
                            })()}
                            onChange={(e) => handleAmountChange(line.id, 'credit', e.target.value)}
                            className="w-full border-0 px-0 py-0 text-xs text-right focus:ring-0 focus:outline-none"
                            placeholder="0.00"
                          />
                        </td>
                        {canRemoveLines && (
                          <button
                            onClick={() => removeJournalLine(line.id)}
                            className="absolute -left-4 top-1/2 transform -translate-y-1/2 w-6 h-6 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-full flex items-center justify-center shadow-lg border-2 border-gray-300 z-20"
                            title="Remove this line"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-gray-50">
                  <tr>
                    <td className="border px-4 py-2 text-sm font-medium" colSpan={3}>
                      Total
                    </td>
                    <td className={`border px-4 py-2 text-sm font-medium text-right ${
                      !isBalanced ? 'text-red-600' : 'text-gray-900'
                    }`}>
                      ${totalDebits.toFixed(2)}
                    </td>
                    <td className={`border px-4 py-2 text-sm font-medium text-right ${
                      !isBalanced ? 'text-red-600' : 'text-gray-900'
                    }`}>
                      ${totalCredits.toFixed(2)}
                    </td>
                  </tr>
                  {!isBalanced && (
                    <tr>
                      <td colSpan={5} className="border px-4 py-1 text-xs text-red-600 text-center bg-red-50">
                        ⚠️ Total debits must equal total credits
                      </td>
                    </tr>
                  )}
                </tfoot>
              </table>
            </div>
            
            <div className="flex justify-between items-center mt-4">
              <button
                onClick={addJournalLine}
                className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded border"
              >
                Add lines
              </button>
              
              <button
                onClick={handleAddEntry}
                disabled={saving || !isBalanced}
                className={`px-4 py-2 text-sm rounded disabled:opacity-50 ${
                  !isBalanced 
                    ? 'bg-gray-400 text-gray-200 cursor-not-allowed' 
                    : 'bg-gray-900 text-white hover:bg-gray-800'
                }`}
              >
                {saving ? 'Saving...' : !isBalanced ? 'Must Balance' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Journal Entry Modal */}
      {editModal.isOpen && (
        <div 
          className="fixed inset-0 bg-black/70 flex items-center justify-center h-full z-50"
          onClick={() => setEditModal(prev => ({ ...prev, isOpen: false }))}
        >
          <div 
            className="bg-white rounded-lg p-6 w-[80%] overflow-y-auto shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Edit Journal Entry</h2>
              <button
                onClick={() => setEditModal(prev => ({ ...prev, isOpen: false }))}
                className="text-gray-500 hover:text-gray-700 text-xl"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            {editModal.error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700">
                {editModal.error}
              </div>
            )}
            
            {/* Date and JE Name selectors */}
            <div className="mb-4 grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Date</label>
                <input
                  type="date"
                  value={editModal.editEntry.date}
                  onChange={(e) => setEditModal(prev => ({
                    ...prev,
                    editEntry: { ...prev.editEntry, date: e.target.value }
                  }))}
                  className="border px-3 py-2 rounded text-sm w-full"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">JE Name</label>
                <input
                  type="text"
                  value={editModal.editEntry.jeName}
                  onChange={(e) => setEditModal(prev => ({
                    ...prev,
                    editEntry: { ...prev.editEntry, jeName: e.target.value }
                  }))}
                  className="border px-3 py-2 rounded text-sm w-full"
                  placeholder="Enter journal entry name"
                />
              </div>
            </div>
            
            {/* Journal Entry Table */}
            <div className="border rounded-lg overflow-visible relative">
              <table className="w-full border-collapse">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="border px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Payee</th>
                    <th className="border px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                    <th className="border px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                    <th className="border px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Spent (Debit)</th>
                    <th className="border px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Received (Credit)</th>
                  </tr>
                </thead>
                <tbody className="bg-white">
                  {editModal.editEntry.lines.map((line) => {
                    // Determine if we can remove lines (only if there are more than 1 line)
                    const canRemoveLines = editModal.editEntry.lines.length > 1;
                    
                    return (
                      <tr key={line.id} className="relative">
                        <td className="border px-4 py-2">
                          <Select
                            options={[
                              { value: '', label: 'Select payee...' },
                              ...payees.map(payee => ({ value: payee.id, label: payee.name }))
                            ]}
                            value={payees.find(p => p.id === line.payeeId) ? 
                              { value: line.payeeId, label: payees.find(p => p.id === line.payeeId)?.name || '' } :
                              { value: '', label: 'Select payee...' }
                            }
                            onChange={(selectedOption) => {
                              const option = selectedOption as SelectOption | null;
                              updateEditJournalLine(line.id, 'payeeId', option?.value || '');
                            }}
                            isSearchable
                            menuPortalTarget={document.body}
                            styles={{
                              control: (base) => ({
                                ...base,
                                border: 'none',
                                boxShadow: 'none',
                                minHeight: 'auto',
                                fontSize: '12px',
                                '&:hover': {
                                  border: 'none'
                                }
                              }),
                              menu: (base) => ({ 
                                ...base, 
                                zIndex: 9999,
                                fontSize: '12px'
                              }),
                              menuPortal: (base) => ({ 
                                ...base, 
                                zIndex: 9999 
                              })
                            }}
                          />
                        </td>
                        <td className="border px-4 py-2">
                          <input
                            type="text"
                            value={line.description}
                            onChange={(e) => updateEditJournalLine(line.id, 'description', e.target.value)}
                            className="w-full border-0 px-0 py-0 text-xs focus:ring-0 focus:outline-none"
                            placeholder="Enter description"
                          />
                        </td>
                        <td className="border px-4 py-2">
                          <Select
                            options={categoryOptions}
                            value={categoryOptions.find(opt => opt.value === line.categoryId) || categoryOptions[0]}
                            onChange={(selectedOption) => {
                              const option = selectedOption as SelectOption | null;
                              if (option?.value === 'add_new') {
                                setNewCategoryModal({
                                  isOpen: true,
                                  name: '',
                                  type: 'Expense',
                                  parent_id: null,
                                  lineId: line.id
                                });
                              } else {
                                updateEditJournalLine(line.id, 'categoryId', option?.value || '');
                              }
                            }}
                            isSearchable
                            menuPortalTarget={document.body}
                            styles={{
                              control: (base) => ({
                                ...base,
                                border: 'none',
                                boxShadow: 'none',
                                minHeight: 'auto',
                                fontSize: '12px',
                                '&:hover': {
                                  border: 'none'
                                }
                              }),
                              menu: (base) => ({ 
                                ...base, 
                                zIndex: 9999,
                                fontSize: '12px'
                              }),
                              menuPortal: (base) => ({ 
                                ...base, 
                                zIndex: 9999 
                              })
                            }}
                          />
                        </td>
                        <td className="border px-4 py-2">
                          <input
                            type="text"
                            value={(() => {
                              const debit = line.debit;
                              return (debit && !isZeroAmount(debit)) ? debit : '';
                            })()}
                            onChange={(e) => handleEditAmountChange(line.id, 'debit', e.target.value)}
                            className="w-full border-0 px-0 py-0 text-xs text-right focus:ring-0 focus:outline-none"
                            placeholder="0.00"
                          />
                        </td>
                        <td className="border px-4 py-2">
                          <input
                            type="text"
                            value={(() => {
                              const credit = line.credit;
                              return (credit && !isZeroAmount(credit)) ? credit : '';
                            })()}
                            onChange={(e) => handleEditAmountChange(line.id, 'credit', e.target.value)}
                            className="w-full border-0 px-0 py-0 text-xs text-right focus:ring-0 focus:outline-none"
                            placeholder="0.00"
                          />
                        </td>
                        {canRemoveLines && (
                          <button
                            onClick={() => removeEditJournalLine(line.id)}
                            className="absolute -left-4 top-1/2 transform -translate-y-1/2 w-6 h-6 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-full flex items-center justify-center shadow-lg border-2 border-gray-300 z-20"
                            title="Remove this line"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-gray-50">
                  <tr>
                    <td className="border px-4 py-2 text-sm font-medium" colSpan={3}>
                      Total
                    </td>
                    <td className={`border px-4 py-2 text-sm font-medium text-right ${
                      (() => {
                        const { totalDebits, totalCredits } = calculateEditTotals();
                        const isBalanced = Math.abs(totalDebits - totalCredits) < 0.01;
                        return !isBalanced ? 'text-red-600' : 'text-gray-900';
                      })()
                    }`}>
                      ${(() => {
                        const { totalDebits } = calculateEditTotals();
                        return totalDebits.toFixed(2);
                      })()}
                    </td>
                    <td className={`border px-4 py-2 text-sm font-medium text-right ${
                      (() => {
                        const { totalDebits, totalCredits } = calculateEditTotals();
                        const isBalanced = Math.abs(totalDebits - totalCredits) < 0.01;
                        return !isBalanced ? 'text-red-600' : 'text-gray-900';
                      })()
                    }`}>
                      ${(() => {
                        const { totalCredits } = calculateEditTotals();
                        return totalCredits.toFixed(2);
                      })()}
                    </td>
                  </tr>
                  {(() => {
                    const { totalDebits, totalCredits } = calculateEditTotals();
                    const isBalanced = Math.abs(totalDebits - totalCredits) < 0.01;
                    return !isBalanced && (
                      <tr>
                        <td colSpan={5} className="border px-4 py-1 text-xs text-red-600 text-center bg-red-50">
                          ⚠️ Total debits must equal total credits
                        </td>
                      </tr>
                    );
                  })()}
                </tfoot>
              </table>
            </div>
            
            <div className="flex justify-between items-center mt-4">
              <button
                onClick={addEditJournalLine}
                className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded border"
              >
                Split (Add Line)
              </button>
              
              <div className="flex space-x-3">
                <button
                  onClick={handleSaveEditEntry}
                  disabled={editModal.saving || (() => {
                    const { totalDebits, totalCredits } = calculateEditTotals();
                    return Math.abs(totalDebits - totalCredits) >= 0.01;
                  })()}
                  className={`px-4 py-2 text-sm rounded disabled:opacity-50 ${
                    (() => {
                      const { totalDebits, totalCredits } = calculateEditTotals();
                      const isBalanced = Math.abs(totalDebits - totalCredits) < 0.01;
                      return !isBalanced 
                        ? 'bg-gray-400 text-gray-200 cursor-not-allowed' 
                        : 'bg-gray-900 text-white hover:bg-gray-800';
                    })()
                  }`}
                >
                  {editModal.saving ? 'Saving...' : (() => {
                    const { totalDebits, totalCredits } = calculateEditTotals();
                    const isBalanced = Math.abs(totalDebits - totalCredits) < 0.01;
                    return !isBalanced ? 'Must Balance' : 'Save';
                  })()}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
