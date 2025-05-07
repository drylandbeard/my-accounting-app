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
      
      // Find parent account if this is a subcategory
      const parentAccount = account.parent_id ? accounts.find(acc => acc.id === account.parent_id) : null;
      const matchesParent = parentAccount?.name.toLowerCase().includes(searchLower) ?? false;
      
      return matchesName || matchesType || matchesSubtype || matchesParent;
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
    const { error } = await supabase.from('chart_of_accounts').delete().eq('id', id)
    if (!error) {
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
    // First get all parent accounts (those without a parent)
    const parentAccounts = accounts.filter(acc => acc.parent_id === null);
    
    return parentAccounts.map(parent => (
      <>
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
                className="text-blue-600 hover:underline text-xs"
              >
                Edit
              </button>
              <button
                onClick={() => handleDelete(parent.id)}
                className="text-red-600 hover:underline text-xs"
              >
                Delete
              </button>
            </div>
          </td>
        </tr>
        {/* Render subaccounts */}
        {accounts
          .filter(acc => acc.parent_id === parent.id)
          .map(subAcc => (
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
                    className="text-blue-600 hover:underline text-xs"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(subAcc.id)}
                    className="text-red-600 hover:underline text-xs"
                  >
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          ))}
      </>
    ));
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
            className="bg-blue-600 text-white px-3 py-1 rounded text-sm w-16"
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
              <div className="p-4 border-t border-gray-200">
                <div className="text-sm font-semibold mb-2">Edit Category</div>
                <form onSubmit={handleUpdate} className="flex gap-2 items-center w-full">
                  <input
                    type="text"
                    placeholder="Name"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    className="border px-2 py-1 text-sm flex-1"
                    required
                  />
                  <select
                    value={editType}
                    onChange={e => setEditType(e.target.value)}
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
                    value={editSubtype}
                    onChange={e => setEditSubtype(e.target.value)}
                    className="border px-2 py-1 text-sm w-24"
                  />
                  <select
                    value={editParentId || ''}
                    onChange={e => setEditParentId(e.target.value || null)}
                    className="border px-2 py-1 text-sm flex-1"
                  >
                    <option value="">No Parent</option>
                    {parentOptions
                      .filter(opt => opt.type === editType || !editType)
                      .map(opt => (
                        <option key={opt.id} value={opt.id}>
                          {opt.name} ({opt.type})
                        </option>
                      ))}
                  </select>
                  <button
                    type="submit"
                    className="bg-blue-600 text-white px-3 py-1 rounded text-sm w-16"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    className="border px-3 py-1 rounded text-sm w-16"
                  >
                    Cancel
                  </button>
                </form>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
