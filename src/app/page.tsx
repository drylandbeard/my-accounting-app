"use client";

import { useAuth } from "@/app/components/AuthContext";
import Link from "next/link";

export default function Homepage() {
  const { user, currentCompany, companies, setCurrentCompany } = useAuth();

  return (
    <main className="flex items-center justify-center min-h-screen">
      <div className="text-center max-w-2xl mx-auto px-6">
        <h1 className="text-4xl font-bold mb-6">Welcome to SWITCH</h1>
        
        {user && (
          <div className="mb-6">
            <p className="text-lg text-gray-600 mb-2">
              Hello, {user.email}!
            </p>
            {currentCompany && (
              <p className="text-sm text-gray-500">
                Current company: <span className="font-semibold">{currentCompany.name}</span>
              </p>
            )}
          </div>
        )}
        
        <p className="text-lg text-gray-600 mb-8">
          Your comprehensive accounting solution for managing transactions, automations, and financial reporting.
        </p>
        
        {user && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Link
              href="/transactions"
              className="p-6 bg-white border border-gray-200 rounded-lg hover:shadow-md transition-shadow"
            >
              <h3 className="text-lg font-semibold mb-2">Transactions</h3>
              <p className="text-sm text-gray-600">
                View and manage your financial transactions
              </p>
            </Link>
            
            <Link
              href="/automations"
              className="p-6 bg-white border border-gray-200 rounded-lg hover:shadow-md transition-shadow"
            >
              <h3 className="text-lg font-semibold mb-2">Automations</h3>
              <p className="text-sm text-gray-600">
                Set up automated rules and processes
              </p>
            </Link>
            
            <Link
              href="/categories"
              className="p-6 bg-white border border-gray-200 rounded-lg hover:shadow-md transition-shadow"
            >
              <h3 className="text-lg font-semibold mb-2">Categories</h3>
              <p className="text-sm text-gray-600">
                Organize transactions with categories
              </p>
            </Link>
            
            <Link
              href="/journal-table"
              className="p-6 bg-white border border-gray-200 rounded-lg hover:shadow-md transition-shadow"
            >
              <h3 className="text-lg font-semibold mb-2">Journal Table</h3>
              <p className="text-sm text-gray-600">
                Review your accounting journal entries
              </p>
            </Link>
            
            <Link
              href="/reports/pnl"
              className="p-6 bg-white border border-gray-200 rounded-lg hover:shadow-md transition-shadow"
            >
              <h3 className="text-lg font-semibold mb-2">Profit & Loss</h3>
              <p className="text-sm text-gray-600">
                Generate profit and loss reports
              </p>
            </Link>
            
            <Link
              href="/reports/balance-sheet"
              className="p-6 bg-white border border-gray-200 rounded-lg hover:shadow-md transition-shadow"
            >
              <h3 className="text-lg font-semibold mb-2">Balance Sheet</h3>
              <p className="text-sm text-gray-600">
                View your company&apos;s balance sheet
              </p>
            </Link>
          </div>
        )}
        
        {!currentCompany && user && (
          <div className="mt-8 p-6 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-blue-800 mb-4">
              To get started, please select a company below:
            </p>
            
            {companies.length > 0 ? (
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {companies.map((userCompany) => (
                    <button
                      key={userCompany.company_id}
                      onClick={() => setCurrentCompany(userCompany.companies)}
                      className="p-4 bg-white border border-blue-200 rounded-lg hover:border-blue-400 hover:shadow-md transition-all text-left"
                    >
                      <h4 className="font-semibold text-gray-900">{userCompany.companies.name}</h4>
                      {userCompany.companies.description && (
                        <p className="text-sm text-gray-600 mt-1">{userCompany.companies.description}</p>
                      )}
                      <p className="text-xs text-blue-600 mt-2">Role: {userCompany.role}</p>
                    </button>
                  ))}
                </div>
                <p className="text-sm text-blue-600 mt-4">
                  Click on a company above to start managing your accounting, or create a new company using the navigation menu.
                </p>
              </div>
            ) : (
              <div className="text-center">
                <p className="text-blue-700 mb-3">
                  You don&apos;t have any companies yet. Get started by selecting &quot;My Company&quot; from the navigation menu above.
                </p>
                <p className="text-sm text-blue-600">
                  Once you&apos;ve selected or created a company, you&apos;ll be able to access all accounting features.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
} 