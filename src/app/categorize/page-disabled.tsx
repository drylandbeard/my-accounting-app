'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../my-accounting-app/src/app/lib/supabaseClient'
import Papa from 'papaparse'
import Select from 'react-select'

type Transaction = {
  id: string
  date: string
  description: string
  amount: number
  category_id: string | null
}

type Category = {
  id: string
  name: string
  type: string
}

export default function Page() {

  const [importedTransactions, setImportedTransactions] = useState<Transaction[]>([])
  const [confirmedTransactions, setConfirmedTransactions] = useState<Transaction[]>([])
  const [categories, setCategories] = useState<Category[]>([])

  const fetchImportedTransactions = async () => {
    const { data } = await supabase.from('imported_transactions').select('*')
    setImportedTransactions(data || [])
  }

  const fetchConfirmedTransactions = async () => {
    const { data } = await supabase.from('transactions').select('*')
    setConfirmedTransactions(data || [])
  }

  const fetchCategories = async () => {
    const { data } = await supabase.from('chart_of_accounts').select('*')
    setCategories(data || [])
  }

  const refreshAll = () => {
    fetchImportedTransactions()
    fetchConfirmedTransactions()
    fetchCategories()
  }

  useEffect(() => {
    refreshAll()
  }, [])

  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async function (results: Papa.ParseResult<any>) {
        const rows = results.data as { date: string, description: string, amount: string }[]

        for (const row of rows) {
          const { date, description, amount } = row
          if (date && description && amount) {
            await supabase.from('imported_transactions').insert([{
              date,
              description,
              amount: parseFloat(amount),
              category_id: null
            }])
          }
        }

        fetchImportedTransactions()
      }
    })
  }

  const addTransaction = async (tx: Transaction) => {
    await supabase.from('transactions').insert([{
      date: tx.date,
      description: tx.description,
      amount: tx.amount,
      category_id: tx.category_id
    }])

    await supabase.from('imported_transactions').delete().eq('id', tx.id)
    refreshAll()
  }

  const undoTransaction = async (tx: Transaction) => {
    await supabase.from('imported_transactions').insert([{
      date: tx.date,
      description: tx.description,
      amount: tx.amount,
      category_id: tx.category_id
    }])

    await supabase.from('transactions').delete().eq('id', tx.id)
    refreshAll()
  }

  // ---- DATE FORMATTER ----
  function formatDate(dateString: string) {
    const date = new Date(dateString)
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const year = date.getFullYear()
    return `${month}-${day}-${year}`
  }

  return (
    <div className="p-4 bg-white text-gray-900 font-sans text-sm space-y-8">

      {/* CSV Upload */}
      <div>
        <h2 className="text-lg font-semibold mb-2">Upload Transactions CSV</h2>
        <input type="file" accept=".csv" onChange={handleCSVUpload} />
      </div>

      {/* Main Row: To Add (left) and Added (right) */}
      <div className="flex gap-8">

        {/* To Add */}
        <div className="w-1/2 space-y-2">
          <h2 className="text-lg font-semibold mb-2">To Add (Imported Transactions)</h2>
          <table className="w-full border-collapse border border-gray-300">
            <thead className="bg-gray-100">
              <tr>
                <th className="border p-1">Date</th>
                <th className="border p-1">Description</th>
                <th className="border p-1">Amount</th>
                <th className="border p-1">Category</th>
                <th className="border p-1">Action</th>
              </tr>
            </thead>
            <tbody>
              {importedTransactions.map(tx => (
                <tr key={tx.id}>
                  <td className="border p-1">{formatDate(tx.date)}</td>
                  <td className="border p-1">{tx.description}</td>
                  <td className="border p-1">{tx.amount}</td>
                  <td className="border p-1" style={{ minWidth: '200px' }}>
                    <Select
                      options={[
                        { value: '', label: 'Uncategorized' },
                        ...categories.map(c => ({
                          value: c.id,
                          label: c.name
                        }))
                      ]}
                      value={
                        tx.category_id
                          ? {
                              value: tx.category_id,
                              label:
                                categories.find(c => c.id === tx.category_id)?.name || ''
                            }
                          : { value: '', label: 'Uncategorized' }
                      }
                      onChange={async (selected) => {
                        const newCategoryId = selected?.value || null
                        const { error } = await supabase.from('imported_transactions').update({ category_id: newCategoryId }).eq('id', tx.id)
                        if (!error) {
                          setImportedTransactions(prev =>
                            prev.map(item =>
                              item.id === tx.id ? { ...item, category_id: newCategoryId } : item
                            )
                          )
                        }
                      }}
                      isClearable
                      filterOption={(option, inputValue) =>
                        option.label.toLowerCase().includes(inputValue.toLowerCase())
                      }
                    />
                  </td>
                  <td className="border p-1">
                    <button onClick={() => addTransaction(tx)} className="border px-2 py-1 rounded bg-gray-100 hover:bg-gray-200">Add</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Added */}
        <div className="w-1/2 space-y-2">
          <h2 className="text-lg font-semibold mb-2">Added (Confirmed Transactions)</h2>
          <table className="w-full border-collapse border border-gray-300">
            <thead className="bg-gray-100">
              <tr>
                <th className="border p-1">Date</th>
                <th className="border p-1">Description</th>
                <th className="border p-1">Amount</th>
                <th className="border p-1">Category</th>
                <th className="border p-1">Undo</th>
              </tr>
            </thead>
            <tbody>
              {confirmedTransactions.map(tx => {
                const category = categories.find(c => c.id === tx.category_id)
                return (
                  <tr key={tx.id}>
                    <td className="border p-1">{formatDate(tx.date)}</td>
                    <td className="border p-1">{tx.description}</td>
                    <td className="border p-1">{tx.amount}</td>
                    <td className="border p-1">{category ? category.name : 'Uncategorized'}</td>
                    <td className="border p-1">
                      <button onClick={() => undoTransaction(tx)} className="border px-2 py-1 rounded bg-gray-100 hover:bg-gray-200">Undo</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
