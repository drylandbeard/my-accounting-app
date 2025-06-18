'use client'

import { useEffect, useState, useCallback, useContext } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useApiWithCompany } from '@/hooks/useApiWithCompany'
import { SharedContext } from '../components/SharedContext';

const ACCOUNT_TYPES = [
  'Asset',
  'Liability',
  'Equity',
  'Revenue',
  'COGS',
  'Expense'
]

type Category = {
  id: string
  name: string
  type: string
  subtype?: string
  parent_id?: string | null
  company_id: string
}

export default function ChartOfAccountsPage() {
  const { hasCompanyContext, currentCompany } = useApiWithCompany()
  const { categories: accounts, refreshCategories } = useContext(SharedContext)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Add new account state
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState('')
  const [newSubtype, setNewSubtype] = useState('')
  const [parentId, setParentId] = useState<string | null>(null)
  const [parentOptions, setParentOptions] = useState<Category[]>([])

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editType, setEditType] = useState('')
  const [editSubtype, setEditSubtype] = useState('')
  const [editParentId, setEditParentId] = useState<string | null>(null)

  // Real-time and focus states
  const [highlightedIds, setHighlightedIds] = useState<Set<string>>(new Set())
  const [lastActionId, setLastActionId] = useState<string | null>(null)

  useEffect(() => {
    if (accounts) {
      setLoading(false)
    }
  }, [accounts])

  const fetchParentOptions = useCallback(async () => {
    if (!hasCompanyContext || !currentCompany?.id) return
    
    const { data, error } = await supabase
      .from('chart_of_accounts')
      .select('*')
      .eq('company_id', currentCompany!.id)
      .is('parent_id', null)
    
    if (error) {
      console.error('Error fetching parent options:', error)
    } else if (data) {
      setParentOptions(data as Category[])
    }
  }, [currentCompany?.id, hasCompanyContext])

  // Highlight a category and scroll to it
  const highlightCategory = useCallback((categoryId: string) => {
    setHighlightedIds(prev => new Set([...prev, categoryId]));
    setLastActionId(categoryId);
    
    setTimeout(() => {
      const element = document.getElementById(`category-${categoryId}`);
      if (element) {
        element.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center' 
        });
      }
    }, 100);
    
    setTimeout(() => {
      setHighlightedIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(categoryId);
        return newSet;
      });
      setLastActionId(currentId => (currentId === categoryId ? null : currentId));
    }, 3000);
  }, []);

  // Fetch initial data
  useEffect(() => {
    refreshCategories()
    fetchParentOptions()
  }, [currentCompany?.id, hasCompanyContext, refreshCategories, fetchParentOptions])

  // Set up real-time subscription
  useEffect(() => {
    if (!hasCompanyContext || !currentCompany?.id) return

    console.log('Setting up real-time subscription for company:', currentCompany.id)

    const channel = supabase
      .channel(`chart_of_accounts_${currentCompany.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chart_of_accounts',
          filter: `company_id=eq.${currentCompany.id}`
        },
        (payload) => {
          console.log('Real-time change detected:', payload)
          refreshCategories()

          let recordId: string | null = null;
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            recordId = payload.new.id
          }
          
          if (recordId) {
            highlightCategory(recordId)
          }
          
          fetchParentOptions()
        }
      )
      .subscribe((status) => {
        console.log('Subscription status:', status)
      })

    return () => {
      console.log('Cleaning up real-time subscription')
      supabase.removeChannel(channel)
    }
  }, [currentCompany?.id, hasCompanyContext, highlightCategory, fetchParentOptions, refreshCategories])

  const filteredAccounts = accounts
    .filter(account => {
      const searchLower = search.toLowerCase()
      const matchesName = account.name.toLowerCase().includes(searchLower)
      const matchesType = account.type.toLowerCase().includes(searchLower)
      const matchesSubtype = account.subtype?.toLowerCase().includes(searchLower) ?? false
      
      if (matchesName || matchesType || matchesSubtype) return true
      
      if (account.parent_id === null) {
        const hasMatchingChild = accounts.some(child => 
          child.parent_id === account.id && 
          (child.name.toLowerCase().includes(searchLower) ||
           child.type.toLowerCase().includes(searchLower) ||
           (child.subtype?.toLowerCase().includes(searchLower) ?? false))
        )
        return hasMatchingChild
      }
      
      return false
    })
    .sort((a, b) => {
      if (a.id === b.parent_id) return -1
      if (b.id === a.parent_id) return 1
      if (a.parent_id === b.parent_id) {
        return a.name.localeCompare(b.name)
      }
      if (a.parent_id === null && b.parent_id !== null) return -1
      if (b.parent_id === null && a.parent_id !== null) return 1
      if (a.type !== b.type) {
        return a.type.localeCompare(b.type)
      }
      return a.name.localeCompare(b.name)
    })

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName || !newType || !hasCompanyContext || !currentCompany?.id) return
    
    const { data, error } = await supabase
      .from('chart_of_accounts')
      .insert([
        { 
          name: newName, 
          type: newType, 
          subtype: newSubtype, 
          parent_id: parentId || null,
          company_id: currentCompany!.id
        }
      ])
      .select()
      .single()
    
    if (!error && data) {
      setNewName('')
      setNewType('')
      setNewSubtype('')
      setParentId(null)
    }
  }

  const handleDelete = async (id: string) => {
    const { data: subcategories } = await supabase
      .from('chart_of_accounts')
      .select('id')
      .eq('parent_id', id)

    if (subcategories && subcategories.length > 0) {
      const subcategoryIds = subcategories.map(sub => sub.id)
      const { data: transactions, error: txError } = await supabase
        .from('transactions')
        .select('id')
        .or(`debit_account_id.in.(${subcategoryIds.join(',')}),credit_account_id.in.(${subcategoryIds.join(',')})`)
        .limit(1)

      if (txError) {
        console.error('Error checking transactions:', txError)
        return
      }

      if (transactions && transactions.length > 0) {
        alert('This category cannot be deleted because it contains subcategories that are used in existing transactions. Please reassign or delete the transactions first.')
        return
      }
    } else {
      const { data: transactions, error: txError } = await supabase
        .from('transactions')
        .select('id')
        .or(`debit_account_id.eq.${id},credit_account_id.eq.${id}`)
        .limit(1)

      if (txError) {
        console.error('Error checking transactions:', txError)
        return
      }

      if (transactions && transactions.length > 0) {
        alert('This category cannot be deleted because it is used in existing transactions. Please reassign or delete the transactions first.')
        return
      }
    }

    const { error } = await supabase
      .from('chart_of_accounts')
      .delete()
      .eq('id', id)
    
    if (!error) {
      setEditingId(null)
    }
  }

  const handleEdit = (account: Category) => {
    setEditingId(account.id)
    setEditName(account.name)
    setEditType(account.type)
    setEditSubtype(account.subtype || '')
    setEditParentId(account.parent_id || null)
  }

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingId || !hasCompanyContext || !currentCompany?.id) return

    const { data: currentAccount } = await supabase
      .from('chart_of_accounts')
      .select('plaid_account_id')
      .eq('id', editingId)
      .single()

    const { error } = await supabase
      .from('chart_of_accounts')
      .update({
        name: editName,
        type: editType,
        subtype: editSubtype || null,
        parent_id: editParentId
      })
      .eq('id', editingId)

    if (!error && currentAccount?.plaid_account_id) {
      await supabase
        .from('accounts')
        .update({
          name: editName,
          type: editType,
          subtype: editSubtype || null
        })
        .eq('plaid_account_id', currentAccount.plaid_account_id)
        .eq('company_id', currentCompany!.id)
    }

    if (!error) {
      setEditingId(null)
    }
  }

  const handleCancelEdit = () => {
    setEditingId(null)
  }

  const renderAccounts = (accounts: Category[], level = 0) => {
    const parentAccounts = accounts.filter(acc => acc.parent_id === null)
    
    return parentAccounts.flatMap(parent => {
      const subAccounts = accounts.filter(acc => acc.parent_id === parent.id)
      
      if (subAccounts.length === 0 && !accounts.includes(parent)) {
        return []
      }
      
      return [
        <tr 
          key={parent.id}
          id={`category-${parent.id}`}
          className={`transition-colors duration-1000 ${
            highlightedIds.has(parent.id) 
              ? 'bg-green-100' 
              : 'hover:bg-gray-50'
          }`}
        >
          <td style={{ paddingLeft: `${level * 16 + 4}px` }} className="border p-1 text-sm">
            <span className={highlightedIds.has(parent.id) ? 'font-bold text-green-800' : ''}>
              {parent.name}
            </span>
            {lastActionId === parent.id && (
              <span className="ml-2 inline-block text-green-600">
                ✨
              </span>
            )}
          </td>
          <td className="border p-1 text-sm">{parent.type}</td>
          <td className="border p-1 text-sm">{parent.subtype || ''}</td>
          <td className="border p-1 text-sm"></td>
          <td className="border p-1 text-sm">
            <div className="flex gap-2 justify-center">
              <button
                onClick={() => handleEdit(parent)}
                className="text-xs hover:underline"
              >
                Edit
              </button>
            </div>
          </td>
        </tr>,
        ...subAccounts.map(subAcc => (
          <tr 
            key={subAcc.id}
            id={`category-${subAcc.id}`}
            className={`transition-colors duration-1000 ${
              highlightedIds.has(subAcc.id) 
                ? 'bg-green-100' 
                : 'hover:bg-gray-50'
            }`}
          >
            <td style={{ paddingLeft: `${(level + 1) * 16 + 4}px` }} className="border p-1 text-sm">
              <span className={highlightedIds.has(subAcc.id) ? 'font-bold text-green-800' : ''}>
                {subAcc.name}
              </span>
              {lastActionId === subAcc.id && (
                <span className="ml-2 inline-block text-green-600">
                  ✨
                </span>
              )}
            </td>
            <td className="border p-1 text-sm">{subAcc.type}</td>
            <td className="border p-1 text-sm">{subAcc.subtype || ''}</td>
            <td className="border p-1 text-sm">{parent.name}</td>
            <td className="border p-1 text-sm">
              <div className="flex gap-2 justify-center">
                <button
                  onClick={() => handleEdit(subAcc)}
                  className="text-xs hover:underline"
                >
                  Edit
                </button>
              </div>
            </td>
          </tr>
        ))
      ]
    }).filter(Boolean).flat()
  }

  if (!hasCompanyContext) {
    return (
      <div className="p-4 bg-white text-gray-900 font-sans text-xs space-y-6">
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <h3 className="text-sm font-semibold text-yellow-800 mb-2">Company Selection Required</h3>
          <p className="text-sm text-yellow-700">
            Please select a company from the dropdown in the navigation bar to manage chart of accounts.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-2 max-w-3xl mx-auto mt-4 font-sans text-gray-900">
      <div className="flex justify-center mb-3">
        <input
          type="text"
          placeholder="Search Categories..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full px-2 py-1 border border-gray-900 rounded-none text-sm"
        />
      </div>

      <div className="flex justify-center mb-4">
        <form onSubmit={handleAddAccount} className="flex gap-2 items-center w-full">
          <input
            type="text"
            placeholder="Name"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            className="border px-2 py-1 text-sm flex-1"
            required
          />
          <select
            value={newType}
            onChange={e => setNewType(e.target.value)}
            className="border px-2 py-1 text-sm w-24"
            required
          >
            <option value="">Type...</option>
            {ACCOUNT_TYPES.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Subtype"
            value={newSubtype}
            onChange={e => setNewSubtype(e.target.value)}
            className="border px-2 py-1 text-sm w-24"
          />
          <select
            value={parentId || ''}
            onChange={e => setParentId(e.target.value || null)}
            className="border px-2 py-1 text-sm flex-1"
          >
            <option value="">No Parent</option>
            {parentOptions
              .filter(opt => opt.type === newType || !newType)
              .map(opt => (
                <option key={opt.id} value={opt.id}>
                  {opt.name} ({opt.type})
                </option>
              ))}
          </select>
          <button
            type="submit"
            className="border px-3 py-1 rounded text-sm w-16"
          >
            Add
          </button>
        </form>
      </div>

      <div className="bg-white rounded shadow-sm">
        {loading ? (
          <div className="p-4 text-center text-gray-500 text-sm">Loading...</div>
        ) : (
          <>
            <table className="w-full border-collapse border border-gray-300 text-sm">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border p-1 text-center font-semibold">Name</th>
                  <th className="border p-1 text-center font-semibold">Type</th>
                  <th className="border p-1 text-center font-semibold">Subtype</th>
                  <th className="border p-1 text-center font-semibold">Parent Account</th>
                  <th className="border p-1 text-center font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredAccounts.length > 0 ? (
                  renderAccounts(filteredAccounts)
                ) : (
                  <tr>
                    <td colSpan={5} className="text-center p-2 text-gray-500 text-sm">
                      No accounts found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {editingId && (
              <div 
                className="fixed inset-0 bg-black/70 flex items-center justify-center"
                onClick={(e) => {
                  if (e.target === e.currentTarget) {
                    handleCancelEdit()
                  }
                }}
              >
                <div className="bg-white p-4 rounded-lg w-96">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-lg font-bold">Edit Category</h2>
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      className="text-gray-500 hover:text-gray-700"
                    >
                      ✕
                    </button>
                  </div>
                  <form onSubmit={handleUpdate} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Name</label>
                      <input
                        type="text"
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        className="w-full border px-2 py-1 text-sm"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Type</label>
                      <select
                        value={editType}
                        onChange={e => setEditType(e.target.value)}
                        className="w-full border px-2 py-1 text-sm"
                        required
                      >
                        <option value="">Select Type</option>
                        {ACCOUNT_TYPES.map(type => (
                          <option key={type} value={type}>{type}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Subtype (Optional)</label>
                      <input
                        type="text"
                        value={editSubtype}
                        onChange={e => setEditSubtype(e.target.value)}
                        className="w-full border px-2 py-1 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Parent Category (Optional)</label>
                      <select
                        value={editParentId || ''}
                        onChange={e => setEditParentId(e.target.value || null)}
                        className="w-full border px-2 py-1 text-sm"
                      >
                        <option value="">None</option>
                        {parentOptions.map(option => (
                          <option key={option.id} value={option.id}>{option.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex justify-end space-x-2 pt-4">
                      <button
                        type="button"
                        onClick={() => handleDelete(editingId)}
                        className="px-4 py-2 text-sm text-red-600 hover:text-red-800"
                      >
                        Delete Category
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                      >
                        Update
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}