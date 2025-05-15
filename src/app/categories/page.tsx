'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

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
}

export default function ChartOfAccountsPage() {
  const [accounts, setAccounts] = useState<Category[]>([])
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

  useEffect(() => {
    fetchAccounts()
    fetchParentOptions()
    // eslint-disable-next-line
  }, [])

  const fetchAccounts = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('chart_of_accounts')
      .select('*')
      .order('parent_id', { ascending: true, nullsFirst: true })
      .order('type', { ascending: true })
      .order('name', { ascending: true })
    if (!error && data) setAccounts(data)
    setLoading(false)
  }

  const fetchParentOptions = async () => {
    const { data } = await supabase
      .from('chart_of_accounts')
      .select('id, name, type')
      .is('parent_id', null)
    if (data) setParentOptions(data)
  }

  const filteredAccounts = accounts
    .filter(account => {
      const searchLower = search.toLowerCase();
      const matchesName = account.name.toLowerCase().includes(searchLower);
      const matchesType = account.type.toLowerCase().includes(searchLower);
      const matchesSubtype = account.subtype?.toLowerCase().includes(searchLower) ?? false;
      
      // If this account matches the search, include it
      if (matchesName || matchesType || matchesSubtype) return true;
      
      // If this is a parent account, check if any of its children match
      if (account.parent_id === null) {
        const hasMatchingChild = accounts.some(child => 
          child.parent_id === account.id && 
          (child.name.toLowerCase().includes(searchLower) ||
           child.type.toLowerCase().includes(searchLower) ||
           (child.subtype?.toLowerCase().includes(searchLower) ?? false))
        );
        return hasMatchingChild;
      }
      
      return false;
    })
    .sort((a, b) => {
      // If one is a parent of the other, parent comes first
      if (a.id === b.parent_id) return -1;
      if (b.id === a.parent_id) return 1;
      
      // If they have the same parent, sort by name
      if (a.parent_id === b.parent_id) {
        return a.name.localeCompare(b.name);
      }
      
      // If one has a parent and the other doesn't, parent comes first
      if (a.parent_id === null && b.parent_id !== null) return -1;
      if (b.parent_id === null && a.parent_id !== null) return 1;
      
      // Otherwise sort by type and name
      if (a.type !== b.type) {
        return a.type.localeCompare(b.type);
      }
      return a.name.localeCompare(b.name);
    });

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName || !newType) return
    const { error } = await supabase.from('chart_of_accounts').insert([
      { name: newName, type: newType, subtype: newSubtype, parent_id: parentId || null }
    ])
    if (!error) {
      setNewName('')
      setNewType('')
      setNewSubtype('')
      setParentId(null)
      fetchAccounts()
      fetchParentOptions()
    }
  }

  const handleDelete = async (id: string) => {
    // First check if this is a parent category
    const { data: subcategories } = await supabase
      .from('chart_of_accounts')
      .select('id')
      .eq('parent_id', id);

    if (subcategories && subcategories.length > 0) {
      // This is a parent category, check if any subcategories have transactions
      const subcategoryIds = subcategories.map(sub => sub.id);
      const { data: transactions, error: txError } = await supabase
        .from('transactions')
        .select('id')
        .or(`debit_account_id.in.(${subcategoryIds.join(',')}),credit_account_id.in.(${subcategoryIds.join(',')})`)
        .limit(1);

      if (txError) {
        console.error('Error checking transactions:', txError);
        return;
      }

      if (transactions && transactions.length > 0) {
        alert('This category cannot be deleted because it contains subcategories that are used in existing transactions. Please reassign or delete the transactions first.');
        return;
      }
    } else {
      // This is a regular category, check if it has transactions
      const { data: transactions, error: txError } = await supabase
        .from('transactions')
        .select('id')
        .or(`debit_account_id.eq.${id},credit_account_id.eq.${id}`)
        .limit(1);

      if (txError) {
        console.error('Error checking transactions:', txError);
        return;
      }

      if (transactions && transactions.length > 0) {
        alert('This category cannot be deleted because it is used in existing transactions. Please reassign or delete the transactions first.');
        return;
      }
    }

    const { error } = await supabase.from('chart_of_accounts').delete().eq('id', id)
    if (!error) {
      setEditingId(null)
      fetchAccounts()
      fetchParentOptions()
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
    if (!editingId) return

    const { error } = await supabase
      .from('chart_of_accounts')
      .update({
        name: editName,
        type: editType,
        subtype: editSubtype || null,
        parent_id: editParentId
      })
      .eq('id', editingId)

    if (!error) {
      setEditingId(null)
      fetchAccounts()
      fetchParentOptions()
    }
  }

  const handleCancelEdit = () => {
    setEditingId(null)
  }

  // Helper to display subaccounts indented
  const renderAccounts = (accounts: Category[], parentId: string | null = null, level = 0) => {
    // Get all parent accounts
    const parentAccounts = accounts.filter(acc => acc.parent_id === null);
    
    return parentAccounts.flatMap(parent => {
      // Get subaccounts for this parent
      const subAccounts = accounts.filter(acc => acc.parent_id === parent.id);
      
      // If there are no subaccounts and parent doesn't match search, don't show parent
      if (subAccounts.length === 0 && !accounts.includes(parent)) {
        return [];
      }
      
      // Return an array of <tr> elements: parent row + subaccount rows
      return [
        <tr key={parent.id}>
          <td style={{ paddingLeft: `${level * 16 + 4}px` }} className="border p-1 text-sm">
            {parent.name}
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
          <tr key={subAcc.id}>
            <td style={{ paddingLeft: `${(level + 1) * 16 + 4}px` }} className="border p-1 text-sm">
              {subAcc.name}
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
      ];
    }).filter(Boolean).flat(); // Remove null entries and flatten
  }

  return (
    <div className="p-2 max-w-3xl mx-auto font-sans text-gray-900">
      <h1 className="text-xl font-bold mb-3 text-center">Categories</h1>
      <div className="flex justify-center mb-3">
        <input
          type="text"
          placeholder="Search Categories..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full px-2 py-1 border border-gray-900 rounded-none text-sm"
        />
      </div>

      {/* Add Category Form */}
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
                className="fixed inset-0 backdrop-blur-sm flex items-center justify-center"
                onClick={(e) => {
                  // Only close if clicking the overlay, not its children
                  if (e.target === e.currentTarget) {
                    handleCancelEdit();
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
