'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'

type Account = {
  id: string
  name: string
  type: string
  subtype?: string
  parent_id?: string | null
  _viewerType?: string
}

type Transaction = {
  id: string
  date: string
  description: string
  amount: number
  debit_account_id: string
  credit_account_id: string
}

export default function BalanceSheetPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [asOfDate, setAsOfDate] = useState<string>('')
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null)

  useEffect(() => {
    setAsOfDate(new Date().toISOString().slice(0, 10))
  }, [])

  useEffect(() => {
    const fetchData = async () => {
      const { data: accountsData } = await supabase
        .from('chart_of_accounts')
        .select('*')
        .in('type', ['Asset', 'Liability', 'Equity', 'Revenue', 'COGS', 'Expense'])
      setAccounts(accountsData || [])

      let txQuery = supabase.from('transactions').select('*')
      if (asOfDate) {
        txQuery = txQuery.lte('date', asOfDate)
      }
      const { data: transactionsData } = await txQuery
      setTransactions(transactionsData || [])
    }
    if (asOfDate) fetchData()
  }, [asOfDate])

  // Helpers for subaccounts and totals
  const getSubaccounts = (parentId: string) =>
    accounts.filter(acc => acc.parent_id === parentId)

  const calculateAccountTotal = (account: Account): number => {
    let total = 0
    if (account.type === 'Asset') {
      total = transactions
        .filter(tx => tx.debit_account_id === account.id)
        .reduce((sum, tx) => sum + Number(tx.amount), 0)
      total -= transactions
        .filter(tx => tx.credit_account_id === account.id)
        .reduce((sum, tx) => sum + Number(tx.amount), 0)
    } else if (account.type === 'Liability' || account.type === 'Equity') {
      total = transactions
        .filter(tx => tx.credit_account_id === account.id)
        .reduce((sum, tx) => sum + Number(tx.amount), 0)
      total -= transactions
        .filter(tx => tx.debit_account_id === account.id)
        .reduce((sum, tx) => sum + Number(tx.amount), 0)
    }
    // Add subaccounts' totals
    const subaccounts = getSubaccounts(account.id)
    for (const sub of subaccounts) {
      total += calculateAccountTotal(sub)
    }
    return total
  }

  const calculateAccountDirectTotal = (account: Account): number => {
    if (account.type === 'Asset') {
      return (
        transactions
          .filter(tx => tx.debit_account_id === account.id)
          .reduce((sum, tx) => sum + Number(tx.amount), 0) +
        transactions
          .filter(tx => tx.credit_account_id === account.id)
          .reduce((sum, tx) => sum + Number(tx.amount), 0)
      )
    } else if (account.type === 'Liability' || account.type === 'Equity') {
      return (
        transactions
          .filter(tx => tx.credit_account_id === account.id)
          .reduce((sum, tx) => sum + Number(tx.amount), 0) -
        transactions
          .filter(tx => tx.debit_account_id === account.id)
          .reduce((sum, tx) => sum + Number(tx.amount), 0)
      )
    }
    return 0
  }

  const getAllAccountIds = (account: Account): string[] => {
    const subaccounts = getSubaccounts(account.id)
    return [account.id, ...subaccounts.flatMap(getAllAccountIds)]
  }

  const getAllGroupAccountIds = (accounts: Account[]) =>
    accounts.flatMap(acc => getAllAccountIds(acc))

  // Render account row and its subaccounts, with a total line for each parent
  const renderAccountRowWithTotal = (account: Account, level = 0) => {
    const subaccounts = getSubaccounts(account.id)
    const directTotal = calculateAccountDirectTotal(account)
    const rollupTotal = calculateAccountTotal(account)
    const isParent = subaccounts.length > 0

    if (rollupTotal === 0) return null

    return (
      <>
        <tr
          key={account.id}
          className="cursor-pointer hover:bg-gray-100"
          onClick={() => setSelectedAccount({ ...account, _viewerType: 'direct' })}
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
            className="cursor-pointer hover:bg-blue-50"
            onClick={() => setSelectedAccount({ ...account, _viewerType: 'rollup' })}
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
      </>
    )
  }

  // Top-level accounts (no parent)
  const assetRows = accounts.filter(a => a.type === 'Asset' && !a.parent_id)
  const liabilityRows = accounts.filter(a => a.type === 'Liability' && !a.parent_id)
  const equityRows = accounts.filter(a => a.type === 'Equity' && !a.parent_id)
  const revenueAccounts = accounts.filter(a => a.type === 'Revenue')
  const cogsAccounts = accounts.filter(a => a.type === 'COGS')
  const expenseAccounts = accounts.filter(a => a.type === 'Expense')

  // Net Income calculation (from P&L logic)
  const calculatePLTotal = (accs: Account[], type: string) =>
    accs.reduce((sum, acc) => {
      if (type === 'Revenue') {
        // Revenue: sum credits
        return sum + transactions
          .filter(tx => tx.credit_account_id === acc.id)
          .reduce((s, tx) => s + Number(tx.amount), 0)
      } else if (type === 'COGS' || type === 'Expense') {
        // COGS/Expense: sum debits
        return sum + transactions
          .filter(tx => tx.debit_account_id === acc.id)
          .reduce((s, tx) => s + Number(tx.amount), 0)
      }
      return sum
    }, 0)

  const totalRevenue = calculatePLTotal(revenueAccounts, 'Revenue')
  const totalCOGS = calculatePLTotal(cogsAccounts, 'COGS')
  const totalExpenses = calculatePLTotal(expenseAccounts, 'Expense')
  const netIncome = totalRevenue + totalCOGS + totalExpenses

  // Totals
  const totalAssets = assetRows.reduce((sum, a) => sum + calculateAccountTotal(a), 0)
  const totalLiabilities = liabilityRows.reduce((sum, a) => sum + calculateAccountTotal(a), 0)
  const totalEquity = equityRows.reduce((sum, a) => sum + calculateAccountTotal(a), 0)
  const totalEquityWithNetIncome = totalEquity + netIncome
  const liabilitiesAndEquity = totalLiabilities + totalEquityWithNetIncome

  // Quick view: transactions for selected account or group
  const selectedAccountTransactions = selectedAccount
    ? selectedAccount._viewerType === 'rollup'
      ? transactions.filter(
          tx =>
            getAllAccountIds(selectedAccount).includes(tx.debit_account_id) ||
            getAllAccountIds(selectedAccount).includes(tx.credit_account_id)
        )
      : selectedAccount.id === 'ASSET_GROUP'
      ? transactions.filter(
          tx =>
            getAllGroupAccountIds(assetRows).includes(tx.debit_account_id) ||
            getAllGroupAccountIds(assetRows).includes(tx.credit_account_id)
        )
      : selectedAccount.id === 'LIABILITY_GROUP'
      ? transactions.filter(
          tx =>
            getAllGroupAccountIds(liabilityRows).includes(tx.debit_account_id) ||
            getAllGroupAccountIds(liabilityRows).includes(tx.credit_account_id)
        )
      : selectedAccount.id === 'EQUITY_GROUP'
      ? transactions.filter(
          tx =>
            getAllGroupAccountIds(equityRows).includes(tx.debit_account_id) ||
            getAllGroupAccountIds(equityRows).includes(tx.credit_account_id)
        )
      : selectedAccount.id === 'NET_INCOME'
      ? transactions.filter(
          tx =>
            ['Revenue', 'COGS', 'Expense'].includes(
              accounts.find(a => a.id === tx.debit_account_id)?.type || ''
            ) ||
            ['Revenue', 'COGS', 'Expense'].includes(
              accounts.find(a => a.id === tx.credit_account_id)?.type || ''
            )
        )
      : transactions.filter(
          tx =>
            tx.debit_account_id === selectedAccount.id ||
            tx.credit_account_id === selectedAccount.id
        )
    : []

  return (
    <div className="p-4 bg-white text-gray-900 font-sans text-sm space-y-4 max-w-7xl mx-auto">
      <h1 className="text-xl font-semibold mb-4 text-center">Balance Sheet</h1>
      <div className="space-y-2 mb-2 text-center">
        <label className="mr-2">As of Date:</label>
        <input
          type="date"
          value={asOfDate}
          onChange={e => setAsOfDate(e.target.value)}
          className="border px-2 py-1"
        />
      </div>
      <div className="flex gap-8">
        {/* Balance Sheet Table */}
        <div className="w-1/2">
          <table className="w-full border-collapse border border-gray-300">
            <thead className="bg-gray-100">
              <tr>
                <th className="border p-1 text-left">Account</th>
                <th className="border p-1 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {/* Assets */}
              <tr><td colSpan={2} className="border p-1 font-semibold">Assets</td></tr>
              {assetRows.map(row => renderAccountRowWithTotal(row))}
              <tr
                className="cursor-pointer hover:bg-blue-50"
                onClick={() => setSelectedAccount({ id: 'ASSET_GROUP', name: 'Total Assets', type: 'Asset', parent_id: null })}
              >
                <td className="border p-1 font-semibold">Total Assets</td>
                <td className="border p-1 text-right font-semibold">{totalAssets.toFixed(2)}</td>
              </tr>
              {/* Liabilities */}
              <tr><td colSpan={2} className="border p-1 font-semibold">Liabilities</td></tr>
              {liabilityRows.map(row => renderAccountRowWithTotal(row))}
              <tr
                className="cursor-pointer hover:bg-blue-50"
                onClick={() => setSelectedAccount({ id: 'LIABILITY_GROUP', name: 'Total Liabilities', type: 'Liability', parent_id: null })}
              >
                <td className="border p-1 font-semibold">Total Liabilities</td>
                <td className="border p-1 text-right font-semibold">{totalLiabilities.toFixed(2)}</td>
              </tr>
              {/* Equity */}
              <tr><td colSpan={2} className="border p-1 font-semibold">Equity</td></tr>
              {equityRows.map(row => renderAccountRowWithTotal(row))}
              <tr
                className="cursor-pointer hover:bg-blue-50"
                onClick={() => setSelectedAccount({ id: 'NET_INCOME', name: 'Net Income', type: 'Equity', parent_id: null })}
              >
                <td className="border p-1 font-semibold bg-gray-50">Net Income</td>
                <td className="border p-1 text-right font-semibold bg-gray-50">{netIncome.toFixed(2)}</td>
              </tr>
              <tr
                className="cursor-pointer hover:bg-blue-50"
                onClick={() => setSelectedAccount({ id: 'EQUITY_GROUP', name: 'Total Equity', type: 'Equity', parent_id: null })}
              >
                <td className="border p-1 font-semibold">Total Equity</td>
                <td className="border p-1 text-right font-semibold">{totalEquityWithNetIncome.toFixed(2)}</td>
              </tr>
              {/* Liabilities + Equity */}
              <tr className="bg-gray-50 font-bold">
                <td className="border p-1">Liabilities + Equity</td>
                <td className="border p-1 text-right">{liabilitiesAndEquity.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        {/* Quick View */}
        <div className="w-1/2">
          <div className="border rounded p-4 bg-gray-50 space-y-2">
            {selectedAccount ? (
              <>
                <div className="font-semibold mb-2">
                  {selectedAccount.name} Transactions
                  <button
                    className="ml-2 text-xs text-blue-600 underline"
                    onClick={() => setSelectedAccount(null)}
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
                    {selectedAccountTransactions.map(tx => (
                      <tr key={tx.id}>
                        <td>{tx.date}</td>
                        <td>{tx.description}</td>
                        <td className="text-right">{Number(tx.amount).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {selectedAccountTransactions.length === 0 && (
                  <div className="text-gray-500">No transactions in this account/group.</div>
                )}
              </>
            ) : (
              <div className="text-gray-500">Click an account or total to see its transactions.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
