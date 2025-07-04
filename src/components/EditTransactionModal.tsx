import React from 'react';
import { X, Loader2 } from 'lucide-react';
import Select from 'react-select';

export type JournalEntryLine = {
  id: string;
  description: string;
  categoryId: string;
  payeeId: string;
  debit: string;
  credit: string;
};

export type EditJournalEntry = {
  date: string;
  description: string;
  lines: JournalEntryLine[];
};

export type EditJournalModalState = {
  isOpen: boolean;
  isLoading: boolean;
  saving: boolean;
  error: string | null;
  transactionId: string;
  isManualEntry: boolean;
  editEntry: EditJournalEntry;
  transaction?: unknown; // Optional transaction object for compatibility
};

type SelectOption = {
  value: string;
  label: string;
};

interface EditTransactionModalProps {
  modalState: EditJournalModalState;
  categories: Array<{ id: string; name: string; type?: string }>;
  payees: Array<{ id: string; name: string }>;
  accounts: Array<{ plaid_account_id: string | null; name: string }>;
  selectedAccountId: string | null;
  selectedAccountCategoryId?: string | null; // Chart of accounts ID for the selected account
  isZeroAmount?: (amount: string) => boolean;
  onClose: () => void;
  onUpdateLine: (lineId: string, field: keyof JournalEntryLine, value: string) => void;
  onAmountChange: (lineId: string, field: 'debit' | 'credit', value: string) => void;
  /** Add a new line at the end of the list */
  onAddLine: () => void;
  onSave: () => void;
  onDateChange: (date: string) => void;
  onAccountChange: (accountId: string) => void;
  onOpenCategoryModal: (lineId: string, defaultType?: string) => void;
  calculateTotals: () => { totalDebits: number; totalCredits: number };
}

export default function EditTransactionModal({
  modalState,
  categories,
  payees,
  accounts,
  selectedAccountId,
  selectedAccountCategoryId,
  isZeroAmount = (amount: string) => !amount || parseFloat(amount) === 0,
  onClose,
  onUpdateLine,
  onAmountChange,
  onAddLine,
  onSave,
  onDateChange,
  onAccountChange,
  onOpenCategoryModal,
  calculateTotals
}: EditTransactionModalProps) {
  if (!modalState.isOpen) return null;

  const categoryOptions = [
    { value: '', label: 'Select category...' },
    { value: 'add_new', label: '+ Add new category' },
    ...categories.map(c => ({ value: c.id, label: c.name }))
  ];

  const accountOptions = [
    { value: '', label: 'Select account...' },
    ...accounts.map(acc => ({ 
      value: acc.plaid_account_id || '', 
      label: acc.name 
    }))
  ];

  // Filter out lines that represent the account itself (show only category lines)
  const categoryLines = modalState.editEntry.lines.filter(line => 
    line.categoryId !== selectedAccountCategoryId
  );

  const { totalDebits, totalCredits } = calculateTotals();
  const isBalanced = Math.abs(totalDebits - totalCredits) < 0.01;

  return (
    <div 
      className="fixed inset-0 bg-black/70 flex items-center justify-center h-full z-50"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-lg p-6 w-[800px] overflow-y-auto shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">Edit Transaction</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-xl"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        
        {modalState.error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700">
            {modalState.error}
          </div>
        )}

        {modalState.isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="ml-2">Loading journal entries...</span>
          </div>
        ) : (
          <>
            {/* Date and Source/Account selectors */}
            <div className="mb-4 grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Date</label>
                <input
                  type="date"
                  value={modalState.editEntry.date}
                  onChange={(e) => onDateChange(e.target.value)}
                  className="border px-3 py-2 rounded text-sm w-full"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Source/Account</label>
                <Select
                  options={accountOptions}
                  value={accounts.find(acc => acc.plaid_account_id === selectedAccountId) ? 
                    { 
                      value: selectedAccountId || '', 
                      label: accounts.find(acc => acc.plaid_account_id === selectedAccountId)?.name || '' 
                    } :
                    { value: '', label: 'Select account...' }
                  }
                  onChange={(selectedOption) => {
                    const option = selectedOption as SelectOption | null;
                    onAccountChange(option?.value || '');
                  }}
                  isSearchable
                  menuPortalTarget={document.body}
                  styles={{
                    control: (base) => ({
                      ...base,
                      fontSize: '14px'
                    }),
                    menu: (base) => ({ 
                      ...base, 
                      zIndex: 9999,
                      fontSize: '14px'
                    }),
                    menuPortal: (base) => ({ 
                      ...base, 
                      zIndex: 9999 
                    })
                  }}
                />
              </div>
            </div>
            
            {/* Journal Entry Table */}
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full border-collapse">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="border px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                    <th className="border px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Payee</th>
                    <th className="border px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                    <th className="border px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Debit</th>
                    <th className="border px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Credit</th>
                  </tr>
                </thead>
                <tbody className="bg-white">
                  {categoryLines.map((line) => {
                    return (
                      <tr key={line.id}>
                        <td className="border px-4 py-2">
                          <input
                            type="text"
                            value={line.description}
                            onChange={(e) => onUpdateLine(line.id, 'description', e.target.value)}
                            className="w-full border-0 px-0 py-0 text-xs focus:ring-0 focus:outline-none"
                            placeholder="Enter description"
                          />
                        </td>
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
                              onUpdateLine(line.id, 'payeeId', option?.value || '');
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
                          <Select
                            options={categoryOptions}
                            value={categories.find(c => c.id === line.categoryId) ? 
                              { value: line.categoryId, label: categories.find(c => c.id === line.categoryId)?.name || '' } :
                              { value: '', label: 'Select category...' }
                            }
                            onChange={(selectedOption) => {
                              const option = selectedOption as SelectOption | null;
                              if (option?.value === 'add_new') {
                                onOpenCategoryModal(line.id, 'Expense');
                              } else {
                                onUpdateLine(line.id, 'categoryId', option?.value || '');
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
                            onChange={(e) => onAmountChange(line.id, 'debit', e.target.value)}
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
                            onChange={(e) => onAmountChange(line.id, 'credit', e.target.value)}
                            className="w-full border-0 px-0 py-0 text-xs text-right focus:ring-0 focus:outline-none"
                            placeholder="0.00"
                          />
                        </td>
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
                onClick={onAddLine}
                className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded border"
              >
                Split
              </button>
              
              <div className="flex space-x-3">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={onSave}
                  disabled={modalState.saving || !isBalanced}
                  className={`px-4 py-2 text-sm rounded disabled:opacity-50 ${
                    !isBalanced 
                      ? 'bg-gray-400 text-gray-200 cursor-not-allowed' 
                      : 'bg-gray-900 text-white hover:bg-gray-800'
                  }`}
                >
                  {modalState.saving ? 'Saving...' : (!isBalanced ? 'Must Balance' : 'Save')}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
} 