'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'
import React from 'react'
import { v4 as uuidv4 } from 'uuid'

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
  chart_account_id: string
  debit: number
  credit: number
  transaction_id: string
}

export default function Page() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [journalEntries, setJournalEntries] = useState<Transaction[]>([])
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')
  const [selectedCategory, setSelectedCategory] = useState<Account | null>(null)
  const [isMonthlyView, setIsMonthlyView] = useState(false)
  const [showPreviousPeriod, setShowPreviousPeriod] = useState(false)
  const [editModal, setEditModal] = useState<{
    isOpen: boolean
    transaction: Transaction | null
  }>({
    isOpen: false,
    transaction: null
  })
  const [viewerModal, setViewerModal] = useState<{
    isOpen: boolean
    category: Account | null
  }>({
    isOpen: false,
    category: null
  })
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null)

  // Helper: format date as YYYY-MM-DD
  const formatDate = (date: Date): string => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  // Helper: get first and last day of month
  const getMonthRange = (date: Date): { start: Date; end: Date } => {
    const start = new Date(date.getFullYear(), date.getMonth(), 1)
    const end = new Date(date.getFullYear(), date.getMonth() + 1, 0)
    return { start, end }
  }

  // Helper: get first and last day of quarter
  const getQuarterRange = (date: Date): { start: Date; end: Date } => {
    const quarter = Math.floor(date.getMonth() / 3)
    const start = new Date(date.getFullYear(), quarter * 3, 1)
    const end = new Date(date.getFullYear(), (quarter + 1) * 3, 0)
    return { start, end }
  }

  // Helper: get first and last day of year
  const getYearRange = (date: Date): { start: Date; end: Date } => {
    const start = new Date(date.getFullYear(), 0, 1)
    const end = new Date(date.getFullYear(), 11, 31)
    return { start, end }
  }

  const handleDateRangeSelect = (range: 'currentMonth' | 'currentQuarter' | 'previousMonth' | 'previousQuarter' | 'previousYear' | 'currentYear' | 'yearToLastMonth' | 'ytd') => {
    // Create a date object for the current date in local timezone
    const today = new Date()
    today.setHours(0, 0, 0, 0) // Reset time to start of day

    let start: Date
    let end: Date

    switch (range) {
      case 'currentMonth': {
        const range = getMonthRange(today)
        start = range.start
        end = range.end
        break
      }
      case 'currentQuarter': {
        const range = getQuarterRange(today)
        start = range.start
        end = range.end
        break
      }
      case 'previousMonth': {
        const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1)
        const range = getMonthRange(lastMonth)
        start = range.start
        end = range.end
        break
      }
      case 'previousQuarter': {
        const lastQuarter = new Date(today.getFullYear(), today.getMonth() - 3, 1)
        const range = getQuarterRange(lastQuarter)
        start = range.start
        end = range.end
        break
      }
      case 'previousYear': {
        const lastYear = new Date(today.getFullYear() - 1, 0, 1)
        const range = getYearRange(lastYear)
        start = range.start
        end = range.end
        break
      }
      case 'currentYear': {
        const range = getYearRange(today)
        start = range.start
        end = range.end
        break
      }
      case 'yearToLastMonth': {
        start = new Date(today.getFullYear(), 0, 1) // January 1st of current year
        const lastMonth = new Date(today.getFullYear(), today.getMonth(), 0) // Last day of previous month
        end = lastMonth
        break
      }
      case 'ytd': {
        start = new Date(today.getFullYear(), 0, 1) // January 1st of current year
        end = today // Today
        break
      }
    }

    // Ensure dates are set to start and end of day in local timezone
    start.setHours(0, 0, 0, 0)
    end.setHours(23, 59, 59, 999)

    setStartDate(formatDate(start))
    setEndDate(formatDate(end))
  }

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

      let journalQuery = supabase.from('journal').select('*')
      if (startDate && endDate) {
        journalQuery = journalQuery.gte('date', startDate).lte('date', endDate)
      }
      const { data: journalData } = await journalQuery
      setJournalEntries(journalData || [])
    }
    if (startDate && endDate) fetchData()
  }, [startDate, endDate])

  // Helper: get all subaccounts for a parent
  const getSubaccounts = (parentId: string) =>
    accounts.filter(acc => acc.parent_id === parentId)

  // Helper: calculate direct total for an account (only its own transactions)
  const calculateAccountDirectTotal = (account: Account): number => {
    if (account.type === 'Revenue') {
      return journalEntries
        .filter(tx => tx.chart_account_id === account.id)
        .reduce((sum, tx) => sum + Number(tx.credit), 0)
    } else if (account.type === 'Expense' || account.type === 'COGS') {
      return journalEntries
        .filter(tx => tx.chart_account_id === account.id)
        .reduce((sum, tx) => sum + Number(tx.debit), 0)
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

  // Helper: check if an account or its subaccounts have any transactions
  const hasTransactions = (account: Account): boolean => {
    const directTransactions = journalEntries.some(tx => tx.chart_account_id === account.id)
    if (directTransactions) return true

    const subaccounts = getSubaccounts(account.id)
    return subaccounts.some(sub => hasTransactions(sub))
  }

  // Top-level accounts (no parent) with transactions
  const topLevel = (type: string) =>
    accounts
      .filter(a => a.type === type && !a.parent_id)
      .filter(hasTransactions)

  // For COGS, Expense, Revenue
  const revenueRows = topLevel('Revenue')
  const cogsRows = topLevel('COGS')
  const expenseRows = topLevel('Expense')

  // Totals
  const totalRevenue = revenueRows.reduce((sum, a) => sum + calculateAccountTotal(a), 0)
  const totalCOGS = cogsRows.reduce((sum, a) => sum + calculateAccountTotal(a), 0)
  const totalExpenses = expenseRows.reduce((sum, a) => sum + calculateAccountTotal(a), 0)
  const grossProfit = totalRevenue - totalCOGS
  const netIncome = grossProfit - totalExpenses

  // Helper: get category name for a transaction
  const getCategoryName = (tx: Transaction, selectedCategory: Account) => {
    if (selectedCategory.type === 'Revenue') {
      return accounts.find(a => a.id === tx.chart_account_id)?.name || ''
    } else {
      return accounts.find(a => a.id === tx.chart_account_id)?.name || ''
    }
  }

  // Quick view: transactions for selected category or total line (all subaccounts included)
  const selectedCategoryTransactions = selectedCategory
    ? selectedCategory.id === 'REVENUE_GROUP'
      ? journalEntries.filter(
          tx =>
            getAllGroupAccountIds(revenueRows).includes(tx.chart_account_id)
        )
      : selectedCategory.id === 'COGS_GROUP'
      ? journalEntries.filter(
          tx =>
            getAllGroupAccountIds(cogsRows).includes(tx.chart_account_id)
        )
      : selectedCategory.id === 'EXPENSE_GROUP'
      ? journalEntries.filter(
          tx =>
            getAllGroupAccountIds(expenseRows).includes(tx.chart_account_id)
        )
      : journalEntries.filter(
          tx =>
            getAllAccountIds(selectedCategory).includes(tx.chart_account_id)
        )
    : []

  const handleSaveTransaction = async (updatedTx: Transaction) => {
    try {
      // Delete existing journal entries for this transaction
      await supabase
        .from('journal')
        .delete()
        .eq('transaction_id', updatedTx.transaction_id)

      // Create new journal entries
      const { error } = await supabase.from('journal').insert([{
        id: uuidv4(),
        transaction_id: updatedTx.transaction_id,
        date: updatedTx.date,
        description: updatedTx.description,
        chart_account_id: updatedTx.chart_account_id,
        debit: updatedTx.debit,
        credit: updatedTx.credit
      }])

      if (error) throw error

      setEditModal({ isOpen: false, transaction: null })
      
      // Refresh data
      const { data: accountsData } = await supabase
        .from('chart_of_accounts')
        .select('*')
        .in('type', ['Revenue', 'COGS', 'Expense'])
      setAccounts(accountsData || [])

      let journalQuery = supabase.from('journal').select('*')
      if (startDate && endDate) {
        journalQuery = journalQuery.gte('date', startDate).lte('date', endDate)
      }
      const { data: journalData } = await journalQuery
      setJournalEntries(journalData || [])
    } catch (error) {
      console.error('Error updating transaction:', error)
      alert('Failed to update transaction. Please try again.')
    }
  }

  // Helper: get months between start and end date
  const getMonthsInRange = () => {
    const months: string[] = []
    const start = new Date(startDate + 'T00:00:00')
    const end = new Date(endDate + 'T00:00:00')
    
    let current = new Date(start.getFullYear(), start.getMonth(), 1)
    while (current <= end) {
      months.push(current.toISOString().slice(0, 7)) // Format: YYYY-MM
      current = new Date(current.getFullYear(), current.getMonth() + 1, 1)
    }
    return months
  }

  // Helper: format month for display
  const formatMonth = (monthStr: string) => {
    const [year, month] = monthStr.split('-')
    return new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  }

  // Helper: calculate account total for a specific month
  const calculateAccountTotalForMonth = (account: Account, month: string): number => {
    if (account.type === 'Revenue') {
      return journalEntries
        .filter(tx => 
          tx.chart_account_id === account.id &&
          tx.date.startsWith(month)
        )
        .reduce((sum, tx) => sum + Number(tx.credit), 0)
    } else if (account.type === 'Expense' || account.type === 'COGS') {
      return journalEntries
        .filter(tx => 
          tx.chart_account_id === account.id &&
          tx.date.startsWith(month)
        )
        .reduce((sum, tx) => sum + Number(tx.debit), 0)
    }
    return 0
  }

  // Helper: calculate roll-up total for an account for a specific month
  const calculateAccountTotalForMonthWithSubaccounts = (account: Account, month: string): number => {
    let total = calculateAccountTotalForMonth(account, month)
    const subaccounts = getSubaccounts(account.id)
    for (const sub of subaccounts) {
      total += calculateAccountTotalForMonthWithSubaccounts(sub, month)
    }
    return total
  }

  // Helper: get previous period date range
  const getPreviousPeriodRange = (start: Date, end: Date): { start: Date; end: Date } => {
    const duration = end.getTime() - start.getTime()
    const previousStart = new Date(start.getTime() - duration)
    const previousEnd = new Date(start.getTime() - 1) // One day before current period starts
    
    // Ensure dates are set to start and end of day in local timezone
    previousStart.setHours(0, 0, 0, 0)
    previousEnd.setHours(23, 59, 59, 999)
    
    return { start: previousStart, end: previousEnd }
  }

  // Helper: calculate account total for a date range
  const calculateAccountTotalForRange = (account: Account, start: Date, end: Date): number => {
    const startStr = formatDate(start)
    const endStr = formatDate(end)

    if (account.type === 'Revenue') {
      return journalEntries
        .filter(tx => 
          tx.chart_account_id === account.id &&
          tx.date >= startStr &&
          tx.date <= endStr
        )
        .reduce((sum, tx) => sum + Number(tx.credit), 0)
    } else if (account.type === 'Expense' || account.type === 'COGS') {
      return journalEntries
        .filter(tx => 
          tx.chart_account_id === account.id &&
          tx.date >= startStr &&
          tx.date <= endStr
        )
        .reduce((sum, tx) => sum + Number(tx.debit), 0)
    }
    return 0
  }

  // Helper: calculate roll-up total for an account for a date range
  const calculateAccountTotalForRangeWithSubaccounts = (account: Account, start: Date, end: Date): number => {
    let total = calculateAccountTotalForRange(account, start, end)
    const subaccounts = getSubaccounts(account.id).filter(hasTransactions)
    for (const sub of subaccounts) {
      total += calculateAccountTotalForRangeWithSubaccounts(sub, start, end)
    }
    return total
  }

  // Calculate previous period totals for a group of accounts
  const calculatePreviousPeriodTotal = (accounts: Account[]): number => {
    const previousRange = getPreviousPeriodRange(new Date(startDate), new Date(endDate))
    return accounts.reduce((sum, a) => 
      sum + calculateAccountTotalForRangeWithSubaccounts(a, previousRange.start, previousRange.end), 0)
  }

  // Calculate previous period variance
  const calculatePreviousPeriodVariance = (currentTotal: number, accounts: Account[]): number => {
    const previousTotal = calculatePreviousPeriodTotal(accounts)
    return currentTotal - previousTotal
  }

  const formatNumber = (num: number): string => {
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  // Helper: render account row with monthly totals
  const renderAccountRowWithMonthlyTotals = (account: Account, level = 0) => {
    const subaccounts = getSubaccounts(account.id).filter(hasTransactions)
    const isParent = subaccounts.length > 0
    const months = getMonthsInRange()

    // If this account and all its subaccounts have no transactions in any month, do not render
    const hasAnyTransactions = months.some(month => 
      calculateAccountTotalForMonthWithSubaccounts(account, month) !== 0
    )
    if (!hasAnyTransactions) return null

    return (
      <React.Fragment key={account.id}>
        <tr
          className="cursor-pointer hover:bg-gray-100"
          onClick={() => {
            setSelectedCategory(account)
            setViewerModal({ isOpen: true, category: account })
          }}
        >
          <td className="border p-1" style={{ paddingLeft: `${level * 20 + 8}px` }}>
            {account.name}
          </td>
          {months.map(month => (
            <td key={month} className="border p-1 text-right">
              {formatNumber(calculateAccountTotalForMonth(account, month))}
            </td>
          ))}
          <td className="border p-1 text-right font-semibold">
            {formatNumber(calculateAccountTotal(account))}
          </td>
        </tr>
        {subaccounts.map(sub =>
          renderAccountRowWithMonthlyTotals(sub, level + 1)
        )}
        {isParent && (
          <tr
            key={`${account.id}-total`}
            className="cursor-pointer hover:bg-blue-50"
            onClick={() => {
              setSelectedCategory(account)
              setViewerModal({ isOpen: true, category: account })
            }}
          >
            <td
              className="border p-1 font-semibold bg-gray-50"
              style={{ paddingLeft: `${level * 20 + 8}px` }}
            >
              Total {account.name}
            </td>
            {months.map(month => (
              <td key={month} className="border p-1 text-right font-semibold bg-gray-50">
                {formatNumber(calculateAccountTotalForMonthWithSubaccounts(account, month))}
              </td>
            ))}
            <td className="border p-1 text-right font-semibold bg-gray-50">
              {formatNumber(calculateAccountTotal(account))}
            </td>
          </tr>
        )}
      </React.Fragment>
    )
  }

  // Helper: render account row with total
  const renderAccountRowWithTotal = (account: Account, level = 0) => {
    const subaccounts = getSubaccounts(account.id).filter(hasTransactions)
    const directTotal = calculateAccountDirectTotal(account)
    const rollupTotal = calculateAccountTotal(account)
    const isParent = subaccounts.length > 0

    // If this account and all its subaccounts have no transactions, do not render
    if (rollupTotal === 0) return null

    return (
      <React.Fragment key={account.id}>
        <tr
          className="cursor-pointer hover:bg-gray-100"
          onClick={() => {
            setSelectedCategory(account)
            setViewerModal({ isOpen: true, category: account })
          }}
        >
          <td className="border p-1" style={{ paddingLeft: `${level * 20 + 8}px` }}>
            {account.name}
          </td>
          <td className="border p-1 text-right">
            {formatNumber(directTotal)}
          </td>
        </tr>
        {subaccounts.map(sub =>
          renderAccountRowWithTotal(sub, level + 1)
        )}
        {isParent && (
          <tr
            key={`${account.id}-total`}
            className="cursor-pointer hover:bg-blue-50"
            onClick={() => {
              setSelectedCategory(account)
              setViewerModal({ isOpen: true, category: account })
            }}
          >
            <td
              className="border p-1 font-semibold bg-gray-50"
              style={{ paddingLeft: `${level * 20 + 8}px` }}
            >
              Total {account.name}
            </td>
            <td className="border p-1 text-right font-semibold bg-gray-50">
              {formatNumber(rollupTotal)}
            </td>
          </tr>
        )}
      </React.Fragment>
    )
  }

  return (
    <div className="p-4 bg-white text-gray-900 font-sans text-sm space-y-4 max-w-7xl mx-auto">
      <h1 className="text-xl font-semibold mb-4 text-center">Profit & Loss</h1>
      {/* Date Range Filter */}
      <div className="space-y-2 mb-2 text-center">
        <div className="flex items-center justify-center gap-4 mb-2">
          <label className="mr-2">Start Date:</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="border px-2 py-1 mr-4" />
          <label className="mr-2">End Date:</label>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="border px-2 py-1 mr-4" />
          <button
            onClick={() => setIsMonthlyView(!isMonthlyView)}
            className={`px-4 py-1 rounded ${
              isMonthlyView 
                ? 'bg-blue-600 text-white hover:bg-blue-700' 
                : 'bg-gray-100 hover:bg-gray-200'
            }`}
          >
            {isMonthlyView ? 'Single View' : 'Monthly View'}
          </button>
        </div>
        <div className="flex justify-center gap-2">
          <button
            onClick={() => handleDateRangeSelect('currentMonth')}
            className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded"
          >
            This Month
          </button>
          <button
            onClick={() => handleDateRangeSelect('currentQuarter')}
            className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded"
          >
            This Quarter
          </button>
          <button
            onClick={() => handleDateRangeSelect('currentYear')}
            className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded"
          >
            This Year
          </button>
          <button
            onClick={() => handleDateRangeSelect('yearToLastMonth')}
            className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded"
          >
            This Year to Last Month
          </button>
          <button
            onClick={() => handleDateRangeSelect('ytd')}
            className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded"
          >
            YTD
          </button>
          <button
            onClick={() => handleDateRangeSelect('previousMonth')}
            className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded"
          >
            Last Month
          </button>
          <button
            onClick={() => handleDateRangeSelect('previousQuarter')}
            className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded"
          >
            Last Quarter
          </button>
          <button
            onClick={() => handleDateRangeSelect('previousYear')}
            className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded"
          >
            Last Year
          </button>
        </div>
      </div>

      {/* Previous Period Toggle */}
      {!isMonthlyView && (
        <div className="flex justify-center mb-4">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={showPreviousPeriod}
              onChange={(e) => setShowPreviousPeriod(e.target.checked)}
              className="rounded border-gray-300"
            />
            Show Previous Period
          </label>
        </div>
      )}

      {/* P&L Table */}
      <div className="w-full flex justify-center">
        <div className={`${isMonthlyView ? 'w-[1200px]' : 'w-[600px]'} overflow-x-auto`}>
          <table className="border-collapse border border-gray-300 w-full" style={{ tableLayout: 'fixed' }}>
            <thead className="bg-gray-100">
              <tr>
                <th className="border p-1 text-left" style={{ width: '30%' }}>Category</th>
                {isMonthlyView ? (
                  getMonthsInRange().map(month => (
                    <th key={month} className="border p-1 text-right" style={{ width: '120px' }}>
                      {formatMonth(month)}
                    </th>
                  ))
                ) : (
                  <>
                    <th className="border p-1 text-right" style={{ width: '20%' }}>Total</th>
                    {showPreviousPeriod && (
                      <>
                        <th className="border p-1 text-right" style={{ width: '20%' }}>Previous Period</th>
                        <th className="border p-1 text-right" style={{ width: '20%' }}>Difference</th>
                      </>
                    )}
                  </>
                )}
                {isMonthlyView && <th className="border p-1 text-right" style={{ width: '120px' }}>Total</th>}
              </tr>
            </thead>
            <tbody>
              {/* Revenue */}
              <tr>
                <td colSpan={isMonthlyView ? getMonthsInRange().length + 2 : (showPreviousPeriod ? 4 : 2)} className="border p-1 font-semibold">
                  Revenue
                </td>
              </tr>
              {revenueRows.map(row => {
                if (isMonthlyView) {
                  return renderAccountRowWithMonthlyTotals(row)
                } else {
                  const currentTotal = calculateAccountTotal(row)
                  const previousRange = showPreviousPeriod ? getPreviousPeriodRange(new Date(startDate), new Date(endDate)) : null
                  const previousTotal = previousRange ? calculateAccountTotalForRangeWithSubaccounts(row, previousRange.start, previousRange.end) : 0
                  const variance = currentTotal - previousTotal

                  return (
                    <React.Fragment key={row.id}>
                      <tr
                        className="cursor-pointer hover:bg-gray-100"
                        onClick={() => {
                          setSelectedCategory(row)
                          setViewerModal({ isOpen: true, category: row })
                        }}
                      >
                        <td className="border p-1" style={{ width: '30%' }}>{row.name}</td>
                        <td className="border p-1 text-right" style={{ width: '20%' }}>{formatNumber(currentTotal)}</td>
                        {showPreviousPeriod && (
                          <>
                            <td className="border p-1 text-right" style={{ width: '20%' }}>{formatNumber(previousTotal)}</td>
                            <td className="border p-1 text-right" style={{ width: '20%' }}>
                              {formatNumber(variance)}
                            </td>
                          </>
                        )}
                      </tr>
                      {getSubaccounts(row.id).map(sub => {
                        const subCurrentTotal = calculateAccountTotal(sub)
                        const subPreviousTotal = previousRange ? calculateAccountTotalForRangeWithSubaccounts(sub, previousRange.start, previousRange.end) : 0
                        const subVariance = subCurrentTotal - subPreviousTotal

                        return (
                          <tr
                            key={sub.id}
                            className="cursor-pointer hover:bg-gray-100"
                            onClick={() => {
                              setSelectedCategory(sub)
                              setViewerModal({ isOpen: true, category: sub })
                            }}
                          >
                            <td className="border p-1" style={{ paddingLeft: '20px', width: '30%' }}>{sub.name}</td>
                            <td className="border p-1 text-right" style={{ width: '20%' }}>{formatNumber(subCurrentTotal)}</td>
                            {showPreviousPeriod && (
                              <>
                                <td className="border p-1 text-right" style={{ width: '20%' }}>{formatNumber(subPreviousTotal)}</td>
                                <td className="border p-1 text-right" style={{ width: '20%' }}>
                                  {formatNumber(subVariance)}
                                </td>
                              </>
                            )}
                          </tr>
                        )
                      })}
                    </React.Fragment>
                  )
                }
              })}
              {/* Total Revenue */}
              <tr
                className="cursor-pointer hover:bg-blue-50"
                onClick={() => {
                  setSelectedCategory({ id: 'REVENUE_GROUP', name: 'Total Revenue', type: 'Revenue', parent_id: null })
                  setViewerModal({ isOpen: true, category: { id: 'REVENUE_GROUP', name: 'Total Revenue', type: 'Revenue', parent_id: null } })
                }}
              >
                <td className="border p-1 font-semibold" style={{ width: '30%' }}>Total Revenue</td>
                {isMonthlyView ? (
                  <>
                    {getMonthsInRange().map(month => (
                      <td key={month} className="border p-1 text-right font-semibold">
                        {formatNumber(revenueRows.reduce((sum, a) => sum + calculateAccountTotalForMonthWithSubaccounts(a, month), 0))}
                      </td>
                    ))}
                    <td className="border p-1 text-right font-semibold">{formatNumber(totalRevenue)}</td>
                  </>
                ) : (
                  <>
                    <td className="border p-1 text-right font-semibold" style={{ width: '20%' }}>{formatNumber(totalRevenue)}</td>
                    {showPreviousPeriod && (
                      <>
                        <td className="border p-1 text-right font-semibold" style={{ width: '20%' }}>
                          {formatNumber(calculatePreviousPeriodTotal(revenueRows))}
                        </td>
                        <td className="border p-1 text-right font-semibold" style={{ width: '20%' }}>
                          {formatNumber(calculatePreviousPeriodVariance(totalRevenue, revenueRows))}
                        </td>
                      </>
                    )}
                  </>
                )}
              </tr>

              {/* COGS */}
              <tr><td colSpan={isMonthlyView ? getMonthsInRange().length + 2 : (showPreviousPeriod ? 4 : 2)} className="border p-1 font-semibold">Cost of Goods Sold (COGS)</td></tr>
              {cogsRows.map(row => {
                if (isMonthlyView) {
                  return renderAccountRowWithMonthlyTotals(row)
                } else {
                  const currentTotal = calculateAccountTotal(row)
                  const previousRange = showPreviousPeriod ? getPreviousPeriodRange(new Date(startDate), new Date(endDate)) : null
                  const previousTotal = previousRange ? calculateAccountTotalForRangeWithSubaccounts(row, previousRange.start, previousRange.end) : 0
                  const variance = currentTotal - previousTotal

                  return (
                    <React.Fragment key={row.id}>
                      <tr
                        className="cursor-pointer hover:bg-gray-100"
                        onClick={() => {
                          setSelectedCategory(row)
                          setViewerModal({ isOpen: true, category: row })
                        }}
                      >
                        <td className="border p-1">{row.name}</td>
                        <td className="border p-1 text-right w-[150px]">{formatNumber(currentTotal)}</td>
                        {showPreviousPeriod && (
                          <>
                            <td className="border p-1 text-right w-[150px]">{formatNumber(previousTotal)}</td>
                            <td className="border p-1 text-right w-[150px]">
                              {formatNumber(variance)}
                            </td>
                          </>
                        )}
                      </tr>
                      {getSubaccounts(row.id).map(sub => {
                        const subCurrentTotal = calculateAccountTotal(sub)
                        const subPreviousTotal = previousRange ? calculateAccountTotalForRangeWithSubaccounts(sub, previousRange.start, previousRange.end) : 0
                        const subVariance = subCurrentTotal - subPreviousTotal

                        return (
                          <tr
                            key={sub.id}
                            className="cursor-pointer hover:bg-gray-100"
                            onClick={() => {
                              setSelectedCategory(sub)
                              setViewerModal({ isOpen: true, category: sub })
                            }}
                          >
                            <td className="border p-1" style={{ paddingLeft: '20px' }}>{sub.name}</td>
                            <td className="border p-1 text-right w-[150px]">{formatNumber(subCurrentTotal)}</td>
                            {showPreviousPeriod && (
                              <>
                                <td className="border p-1 text-right w-[150px]">{formatNumber(subPreviousTotal)}</td>
                                <td className="border p-1 text-right w-[150px]">
                                  {formatNumber(subVariance)}
                                </td>
                              </>
                            )}
                          </tr>
                        )
                      })}
                    </React.Fragment>
                  )
                }
              })}
              {/* Total COGS */}
              <tr
                className="cursor-pointer hover:bg-blue-50"
                onClick={() => {
                  setSelectedCategory({ id: 'COGS_GROUP', name: 'Total COGS', type: 'COGS', parent_id: null })
                  setViewerModal({ isOpen: true, category: { id: 'COGS_GROUP', name: 'Total COGS', type: 'COGS', parent_id: null } })
                }}
              >
                <td className="border p-1 font-semibold">Total COGS</td>
                {isMonthlyView ? (
                  <>
                    {getMonthsInRange().map(month => (
                      <td key={month} className="border p-1 text-right font-semibold">
                        {formatNumber(cogsRows.reduce((sum, a) => sum + calculateAccountTotalForMonthWithSubaccounts(a, month), 0))}
                      </td>
                    ))}
                    <td className="border p-1 text-right font-semibold">{formatNumber(totalCOGS)}</td>
                  </>
                ) : (
                  <>
                    <td className="border p-1 text-right font-semibold w-[150px]">{formatNumber(totalCOGS)}</td>
                    {showPreviousPeriod && (
                      <>
                        <td className="border p-1 text-right font-semibold w-[150px]">
                          {formatNumber(calculatePreviousPeriodTotal(cogsRows))}
                        </td>
                        <td className="border p-1 text-right font-semibold w-[150px]">
                          {formatNumber(calculatePreviousPeriodVariance(totalCOGS, cogsRows))}
                        </td>
                      </>
                    )}
                  </>
                )}
              </tr>

              {/* Gross Profit */}
              <tr className="bg-gray-50 font-semibold">
                <td className="border p-1" style={{ width: '25%' }}>Gross Profit</td>
                {isMonthlyView && getMonthsInRange().map(month => (
                  <td key={month} className="border p-1 text-right" style={{ width: '15%' }}>
                    {formatNumber((
                      revenueRows.reduce((sum, a) => sum + calculateAccountTotalForMonthWithSubaccounts(a, month), 0) -
                      cogsRows.reduce((sum, a) => sum + calculateAccountTotalForMonthWithSubaccounts(a, month), 0)
                    ))}
                  </td>
                ))}
                <td className="border p-1 text-right" style={{ width: '15%' }}>{formatNumber(grossProfit)}</td>
              </tr>

              {/* Expenses */}
              <tr><td colSpan={isMonthlyView ? getMonthsInRange().length + 2 : (showPreviousPeriod ? 4 : 2)} className="border p-1 font-semibold">Expenses</td></tr>
              {expenseRows.map(row => {
                if (isMonthlyView) {
                  return renderAccountRowWithMonthlyTotals(row)
                } else {
                  const currentTotal = calculateAccountTotal(row)
                  const previousRange = showPreviousPeriod ? getPreviousPeriodRange(new Date(startDate), new Date(endDate)) : null
                  const previousTotal = previousRange ? calculateAccountTotalForRangeWithSubaccounts(row, previousRange.start, previousRange.end) : 0
                  const variance = currentTotal - previousTotal

                  return (
                    <React.Fragment key={row.id}>
                      <tr
                        className="cursor-pointer hover:bg-gray-100"
                        onClick={() => {
                          setSelectedCategory(row)
                          setViewerModal({ isOpen: true, category: row })
                        }}
                      >
                        <td className="border p-1">{row.name}</td>
                        <td className="border p-1 text-right w-[150px]">{formatNumber(currentTotal)}</td>
                        {showPreviousPeriod && (
                          <>
                            <td className="border p-1 text-right w-[150px]">{formatNumber(previousTotal)}</td>
                            <td className="border p-1 text-right w-[150px]">
                              {formatNumber(variance)}
                            </td>
                          </>
                        )}
                      </tr>
                      {getSubaccounts(row.id).map(sub => {
                        const subCurrentTotal = calculateAccountTotal(sub)
                        const subPreviousTotal = previousRange ? calculateAccountTotalForRangeWithSubaccounts(sub, previousRange.start, previousRange.end) : 0
                        const subVariance = subCurrentTotal - subPreviousTotal

                        return (
                          <tr
                            key={sub.id}
                            className="cursor-pointer hover:bg-gray-100"
                            onClick={() => {
                              setSelectedCategory(sub)
                              setViewerModal({ isOpen: true, category: sub })
                            }}
                          >
                            <td className="border p-1" style={{ paddingLeft: '20px' }}>{sub.name}</td>
                            <td className="border p-1 text-right w-[150px]">{formatNumber(subCurrentTotal)}</td>
                            {showPreviousPeriod && (
                              <>
                                <td className="border p-1 text-right w-[150px]">{formatNumber(subPreviousTotal)}</td>
                                <td className="border p-1 text-right w-[150px]">
                                  {formatNumber(subVariance)}
                                </td>
                              </>
                            )}
                          </tr>
                        )
                      })}
                    </React.Fragment>
                  )
                }
              })}
              {/* Total Expenses */}
              <tr
                className="cursor-pointer hover:bg-blue-50"
                onClick={() => {
                  setSelectedCategory({ id: 'EXPENSE_GROUP', name: 'Total Expenses', type: 'Expense', parent_id: null })
                  setViewerModal({ isOpen: true, category: { id: 'EXPENSE_GROUP', name: 'Total Expenses', type: 'Expense', parent_id: null } })
                }}
              >
                <td className="border p-1 font-semibold">Total Expenses</td>
                {isMonthlyView ? (
                  <>
                    {getMonthsInRange().map(month => (
                      <td key={month} className="border p-1 text-right font-semibold">
                        {formatNumber(expenseRows.reduce((sum, a) => sum + calculateAccountTotalForMonthWithSubaccounts(a, month), 0))}
                      </td>
                    ))}
                    <td className="border p-1 text-right font-semibold">{formatNumber(totalExpenses)}</td>
                  </>
                ) : (
                  <>
                    <td className="border p-1 text-right font-semibold w-[150px]">{formatNumber(totalExpenses)}</td>
                    {showPreviousPeriod && (
                      <>
                        <td className="border p-1 text-right font-semibold w-[150px]">
                          {formatNumber(calculatePreviousPeriodTotal(expenseRows))}
                        </td>
                        <td className="border p-1 text-right font-semibold w-[150px]">
                          {formatNumber(calculatePreviousPeriodVariance(totalExpenses, expenseRows))}
                        </td>
                      </>
                    )}
                  </>
                )}
              </tr>

              {/* Net Income */}
              <tr className="bg-gray-50 font-bold">
                <td className="border p-1" style={{ width: '25%' }}>Net Income</td>
                {isMonthlyView ? (
                  <>
                    {getMonthsInRange().map(month => (
                      <td key={month} className="border p-1 text-right" style={{ width: '15%' }}>
                        {formatNumber((
                          revenueRows.reduce((sum, a) => sum + calculateAccountTotalForMonthWithSubaccounts(a, month), 0) -
                          cogsRows.reduce((sum, a) => sum + calculateAccountTotalForMonthWithSubaccounts(a, month), 0) -
                          expenseRows.reduce((sum, a) => sum + calculateAccountTotalForMonthWithSubaccounts(a, month), 0)
                        ))}
                      </td>
                    ))}
                    <td className="border p-1 text-right" style={{ width: '15%' }}>{formatNumber(netIncome)}</td>
                  </>
                ) : (
                  <>
                    <td className="border p-1 text-right w-[150px]">{formatNumber(netIncome)}</td>
                    {showPreviousPeriod && (
                      <>
                        <td className="border p-1 text-right w-[150px]">
                          {formatNumber((() => {
                            const previousRange = getPreviousPeriodRange(new Date(startDate), new Date(endDate))
                            const previousRevenue = calculatePreviousPeriodTotal(revenueRows)
                            const previousCOGS = calculatePreviousPeriodTotal(cogsRows)
                            const previousExpenses = calculatePreviousPeriodTotal(expenseRows)
                            return previousRevenue - previousCOGS - previousExpenses
                          })())}
                        </td>
                        <td className="border p-1 text-right w-[150px]">
                          {formatNumber((() => {
                            const previousRange = getPreviousPeriodRange(new Date(startDate), new Date(endDate))
                            const previousRevenue = calculatePreviousPeriodTotal(revenueRows)
                            const previousCOGS = calculatePreviousPeriodTotal(cogsRows)
                            const previousExpenses = calculatePreviousPeriodTotal(expenseRows)
                            const previousNetIncome = previousRevenue - previousCOGS - previousExpenses
                            return netIncome - previousNetIncome
                          })())}
                        </td>
                      </>
                    )}
                  </>
                )}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Transaction Viewer Modal */}
      {viewerModal.isOpen && viewerModal.category && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-lg w-[800px] max-h-[80vh] flex flex-col">
            <div className="p-4 border-b flex justify-between items-center">
              <h2 className="text-lg font-semibold">
                {viewerModal.category.name} Transactions
              </h2>
              <button
                onClick={() => setViewerModal({ isOpen: false, category: null })}
                className="text-gray-500 hover:text-gray-700"
              >
                ×
              </button>
            </div>
            <div className="p-4 overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left p-2">Date</th>
                    <th className="text-left p-2">Description</th>
                    <th className="text-left p-2">Category</th>
                    <th className="text-right p-2">Amount</th>
                    <th className="text-center p-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedCategoryTransactions.map(tx => (
                    <tr key={tx.id} className="hover:bg-gray-50">
                      {editingTransaction?.id === tx.id ? (
                        <>
                          <td className="p-2">
                            <input
                              type="date"
                              value={editingTransaction.date}
                              onChange={(e) => setEditingTransaction(prev => prev ? { ...prev, date: e.target.value } : null)}
                              className="w-full border px-2 py-1 rounded"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              value={editingTransaction.description}
                              onChange={(e) => setEditingTransaction(prev => prev ? { ...prev, description: e.target.value } : null)}
                              className="w-full border px-2 py-1 rounded"
                            />
                          </td>
                          <td className="p-2">
                            <select
                              value={viewerModal.category?.type === 'Revenue' 
                                ? editingTransaction.chart_account_id 
                                : editingTransaction.chart_account_id}
                              onChange={(e) => {
                                const accountId = e.target.value
                                setEditingTransaction(prev => prev ? {
                                  ...prev,
                                  ...(viewerModal.category?.type === 'Revenue'
                                    ? { chart_account_id: accountId }
                                    : { chart_account_id: accountId })
                                } : null)
                              }}
                              className="w-full border px-2 py-1 rounded"
                            >
                              <option value="">Select Category</option>
                              {accounts
                                .filter(a => a.type === viewerModal.category?.type)
                                .map(account => (
                                  <option key={account.id} value={account.id}>
                                    {account.name}
                                  </option>
                                ))}
                            </select>
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={editingTransaction.debit === 0 ? '' : editingTransaction.debit.toString()}
                              onChange={(e) => {
                                const value = e.target.value;
                                if (value === '' || value === '-' || /^-?\d*\.?\d{0,2}$/.test(value)) {
                                  setEditingTransaction(prev => prev ? {
                                    ...prev,
                                    debit: value === '' || value === '-' ? 0 : parseFloat(value)
                                  } : null)
                                }
                              }}
                              className="w-full border px-2 py-1 rounded text-right"
                            />
                          </td>
                          <td className="p-2 text-center space-x-2">
                            <button
                              onClick={() => handleSaveTransaction(editingTransaction)}
                              className="text-green-600 hover:text-green-800"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingTransaction(null)}
                              className="text-gray-600 hover:text-gray-800"
                            >
                              Cancel
                            </button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="p-2">{tx.date}</td>
                          <td className="p-2">{tx.description}</td>
                          <td className="p-2">{viewerModal.category ? getCategoryName(tx, viewerModal.category) : ''}</td>
                          <td className="p-2 text-right">{formatNumber(Number(tx.debit))}</td>
                          <td className="p-2 text-center">
                            <button
                              onClick={() => setEditingTransaction(tx)}
                              className="text-blue-600 hover:text-blue-800"
                            >
                              Edit
                            </button>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                  {selectedCategoryTransactions.length > 0 && (
                    <tr className="bg-gray-50 font-semibold">
                      <td colSpan={3} className="p-2 text-right">Total</td>
                      <td className="p-2 text-right">
                        {formatNumber(selectedCategoryTransactions
                          .reduce((sum, tx) => sum + Number(tx.debit), 0))}
                      </td>
                      <td></td>
                    </tr>
                  )}
                </tbody>
              </table>
              {selectedCategoryTransactions.length === 0 && (
                <div className="text-gray-500 text-center py-4">No transactions in this category.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit Transaction Modal */}
      {editModal.isOpen && editModal.transaction && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-white p-6 rounded-lg w-[500px] shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Edit Transaction</h2>
              <button
                onClick={() => setEditModal({ isOpen: false, transaction: null })}
                className="text-gray-500 hover:text-gray-700"
              >
                ×
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Date</label>
                <input
                  type="date"
                  value={editModal.transaction.date}
                  onChange={(e) => setEditModal(prev => ({
                    ...prev,
                    transaction: prev.transaction ? {
                      ...prev.transaction,
                      date: e.target.value
                    } : null
                  }))}
                  className="w-full border px-2 py-1 rounded"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <input
                  type="text"
                  value={editModal.transaction.description}
                  onChange={(e) => setEditModal(prev => ({
                    ...prev,
                    transaction: prev.transaction ? {
                      ...prev.transaction,
                      description: e.target.value
                    } : null
                  }))}
                  className="w-full border px-2 py-1 rounded"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Category</label>
                <select
                  value={selectedCategory?.type === 'Revenue' 
                    ? editModal.transaction.chart_account_id 
                    : editModal.transaction.chart_account_id}
                  onChange={(e) => {
                    const accountId = e.target.value
                    setEditModal(prev => ({
                      ...prev,
                      transaction: prev.transaction ? {
                        ...prev.transaction,
                        ...(selectedCategory?.type === 'Revenue'
                          ? { chart_account_id: accountId }
                          : { chart_account_id: accountId })
                      } : null
                    }))
                  }}
                  className="w-full border px-2 py-1 rounded"
                >
                  <option value="">Select Category</option>
                  {accounts
                    .filter(a => a.type === selectedCategory?.type)
                    .map(account => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Amount</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={editModal.transaction.debit === 0 ? '' : editModal.transaction.debit.toString()}
                  onChange={(e) => {
                    const value = e.target.value;
                    // Allow empty string, minus sign, and numbers with up to 2 decimal places
                    if (value === '' || value === '-' || /^-?\d*\.?\d{0,2}$/.test(value)) {
                      setEditModal(prev => ({
                        ...prev,
                        transaction: prev.transaction ? {
                          ...prev.transaction,
                          debit: value === '' || value === '-' ? 0 : parseFloat(value)
                        } : null
                      }))
                    }
                  }}
                  className="w-full border px-2 py-1 rounded"
                />
              </div>
              <div className="flex justify-end space-x-2">
                <button
                  onClick={() => setEditModal({ isOpen: false, transaction: null })}
                  className="px-4 py-2 border rounded hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => editModal.transaction && handleSaveTransaction(editModal.transaction)}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}