'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'
import React from 'react'

type Account = {
  id: string
  name: string
  type: string
  subtype?: string
  parent_id?: string | null
}

type Transaction = {
  id: string
  date: string
  description: string
  amount: number
  debit_account_id: string
  credit_account_id: string
}

export default function Page() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')
  const [selectedCategory, setSelectedCategory] = useState<Account | null>(null)

  useEffect(() => {
    setStartDate('2025-01-01')
    setEndDate(new Date().toISOString().slice(0, 10))
  }, [])

  useEffect(() => {
    const fetchData = async () => {
      const { data: accountsData } = await supabase
        .from('chart_of_accounts')
        .select('*')
        .in('type', ['Revenue', 'COGS', 'Expense'])
      setAccounts(accountsData || [])

      let txQuery = supabase.from('transactions').select('*')
      if (startDate && endDate) {
        txQuery = txQuery.gte('date', startDate).lte('date', endDate)
      }
      const { data: transactionsData } = await txQuery
      setTransactions(transactionsData || [])
    }
    if (startDate && endDate) fetchData()
  }, [startDate, endDate])

  // Helper: get all subaccounts for a parent
  const getSubaccounts = (parentId: string) =>
    accounts.filter(acc => acc.parent_id === parentId)

  // Helper: calculate direct total for an account (only its own transactions)
  const calculateAccountDirectTotal = (account: Account): number => {
    if (account.type === 'Revenue') {
      return transactions
        .filter(tx => tx.credit_account_id === account.id)
        .reduce((sum, tx) => sum + Number(tx.amount), 0)
    } else if (account.type === 'Expense' || account.type === 'COGS') {
      return transactions
        .filter(tx => tx.debit_account_id === account.id)
        .reduce((sum, tx) => sum + Number(tx.amount), 0)
    }
    return 0
  }

  // Helper: calculate roll-up total for an account (including subaccounts)
  const calculateAccountTotal = (account: Account): number => {
    let total = calculateAccountDirectTotal(account)
    const subaccounts = getSubaccounts(account.id)
    for (const sub of subaccounts) {
      total += calculateAccountTotal(sub)
    }
    return total
  }

  // Helper: get all account IDs in a subtree (for viewer)
  const getAllAccountIds = (account: Account): string[] => {
    const subaccounts = getSubaccounts(account.id)
    return [account.id, ...subaccounts.flatMap(getAllAccountIds)]
  }

  // Helper: get all account IDs for a group (e.g., all revenue accounts)
  const getAllGroupAccountIds = (accounts: Account[]) =>
    accounts.flatMap(acc => getAllAccountIds(acc))

  // Helper: render account row and its subaccounts, with a total line for each parent
  const renderAccountRowWithTotal = (account: Account, level = 0) => {
    const subaccounts = getSubaccounts(account.id)
    const directTotal = calculateAccountDirectTotal(account)
    const rollupTotal = calculateAccountTotal(account)
    const isParent = subaccounts.length > 0

    // If this account and all its subaccounts have no transactions, do not render
    if (rollupTotal === 0) return null

    return (
      <React.Fragment key={account.id}>
        <tr
          className="cursor-pointer hover:bg-gray-100"
          onClick={() => setSelectedCategory(account)}
        >
          <td className="border p-1" style={{ paddingLeft: `${level * 20 + 8}px` }}>
            {account.name}
          </td>
          <td className="border p-1 text-right">
            {directTotal !== 0 ? directTotal.toFixed(2) : ''}
          </td>
        </tr>
        {subaccounts.map(sub =>
          renderAccountRowWithTotal(sub, level + 1)
        )}
        {isParent && (
          <tr
            key={`${account.id}-total`}
            className="cursor-pointer hover:bg-blue-50"
            onClick={() => setSelectedCategory(account)}
          >
            <td
              className="border p-1 font-semibold bg-gray-50"
              style={{ paddingLeft: `${level * 20 + 8}px` }}
            >
              Total {account.name}
            </td>
            <td className="border p-1 text-right font-semibold bg-gray-50">
              {rollupTotal.toFixed(2)}
            </td>
          </tr>
        )}
      </React.Fragment>
    )
  }

  // Top-level accounts (no parent)
  const topLevel = (type: string) =>
    accounts.filter(a => a.type === type && !a.parent_id)

  // For COGS, Expense, Revenue
  const revenueRows = topLevel('Revenue')
  const cogsRows = topLevel('COGS')
  const expenseRows = topLevel('Expense')

  // Totals
  const totalRevenue = revenueRows.reduce((sum, a) => sum + calculateAccountTotal(a), 0)
  const totalCOGS = cogsRows.reduce((sum, a) => sum + calculateAccountTotal(a), 0)
  const totalExpenses = expenseRows.reduce((sum, a) => sum + calculateAccountTotal(a), 0)
  const grossProfit = totalRevenue - totalCOGS
  const netIncome = totalRevenue + totalCOGS + totalExpenses

  // Quick view: transactions for selected category or total line (all subaccounts included)
  const selectedCategoryTransactions = selectedCategory
    ? selectedCategory.id === 'REVENUE_GROUP'
      ? transactions.filter(
          tx =>
            getAllGroupAccountIds(revenueRows).includes(tx.debit_account_id) ||
            getAllGroupAccountIds(revenueRows).includes(tx.credit_account_id)
        )
      : selectedCategory.id === 'COGS_GROUP'
      ? transactions.filter(
          tx =>
            getAllGroupAccountIds(cogsRows).includes(tx.debit_account_id) ||
            getAllGroupAccountIds(cogsRows).includes(tx.credit_account_id)
        )
      : selectedCategory.id === 'EXPENSE_GROUP'
      ? transactions.filter(
          tx =>
            getAllGroupAccountIds(expenseRows).includes(tx.debit_account_id) ||
            getAllGroupAccountIds(expenseRows).includes(tx.credit_account_id)
        )
      : transactions.filter(
          tx =>
            getAllAccountIds(selectedCategory).includes(tx.debit_account_id) ||
            getAllAccountIds(selectedCategory).includes(tx.credit_account_id)
        )
    : []

  return (
    <div className="p-4 bg-white text-gray-900 font-sans text-sm space-y-4 max-w-7xl mx-auto">
      <h1 className="text-xl font-semibold mb-4 text-center">Profit & Loss</h1>
      {/* Date Range Filter */}
      <div className="space-y-2 mb-2 text-center">
        <label className="mr-2">Start Date:</label>
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="border px-2 py-1 mr-4" />
        <label className="mr-2">End Date:</label>
        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="border px-2 py-1" />
      </div>
      <div className="flex gap-8">
        {/* P&L Table */}
        <div className="w-1/2">
          <table className="w-full border-collapse border border-gray-300">
            <thead className="bg-gray-100">
              <tr>
                <th className="border p-1 text-left">Category</th>
                <th className="border p-1 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {/* Revenue */}
              <tr><td colSpan={2} className="border p-1 font-semibold">Revenue</td></tr>
              {revenueRows.map(row => renderAccountRowWithTotal(row))}
              <tr
                className="cursor-pointer hover:bg-blue-50"
                onClick={() => setSelectedCategory({ id: 'REVENUE_GROUP', name: 'Total Revenue', type: 'Revenue', parent_id: null })}
              >
                <td className="border p-1 font-semibold">Total Revenue</td>
                <td className="border p-1 text-right font-semibold">{totalRevenue.toFixed(2)}</td>
              </tr>
              {/* COGS */}
              <tr><td colSpan={2} className="border p-1 font-semibold">Cost of Goods Sold (COGS)</td></tr>
              {cogsRows.map(row => renderAccountRowWithTotal(row))}
              <tr
                className="cursor-pointer hover:bg-blue-50"
                onClick={() => setSelectedCategory({ id: 'COGS_GROUP', name: 'Total COGS', type: 'COGS', parent_id: null })}
              >
                <td className="border p-1 font-semibold">Total COGS</td>
                <td className="border p-1 text-right font-semibold">{totalCOGS.toFixed(2)}</td>
              </tr>
              {/* Gross Profit */}
              <tr className="bg-gray-50 font-semibold">
                <td className="border p-1">Gross Profit</td>
                <td className="border p-1 text-right">{grossProfit.toFixed(2)}</td>
              </tr>
              {/* Expenses */}
              <tr><td colSpan={2} className="border p-1 font-semibold">Expenses</td></tr>
              {expenseRows.map(row => renderAccountRowWithTotal(row))}
              <tr
                className="cursor-pointer hover:bg-blue-50"
                onClick={() => setSelectedCategory({ id: 'EXPENSE_GROUP', name: 'Total Expenses', type: 'Expense', parent_id: null })}
              >
                <td className="border p-1 font-semibold">Total Expenses</td>
                <td className="border p-1 text-right font-semibold">{totalExpenses.toFixed(2)}</td>
              </tr>
              {/* Net Income */}
              <tr className="bg-gray-50 font-bold">
                <td className="border p-1">Net Income</td>
                <td className="border p-1 text-right">{netIncome.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        {/* Quick View */}
        <div className="w-1/2">
          <div className="border rounded p-4 bg-gray-50 space-y-2">
            {selectedCategory ? (
              <>
                <div className="font-semibold mb-2">
                  {selectedCategory.name} Transactions
                  <button
                    className="ml-2 text-xs text-blue-600 underline"
                    onClick={() => setSelectedCategory(null)}
                  >
                    Clear
                  </button>
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr>
                      <th className="text-left">Date</th>
                      <th className="text-left">Description</th>
                      <th className="text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedCategoryTransactions.map(tx => (
                      <tr key={tx.id}>
                        <td>{tx.date}</td>
                        <td>{tx.description}</td>
                        <td className="text-right">{Number(tx.amount).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {selectedCategoryTransactions.length === 0 && (
                  <div className="text-gray-500">No transactions in this category.</div>
                )}
              </>
            ) : (
              <div className="text-gray-500">Click a category to see its transactions.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}