"use client";

import { useAuth } from "@/app/components/AuthContext";
import Link from "next/link";
import { useState } from "react";
import { createCompany } from "@/lib/auth";
import { XMarkIcon, PlusIcon } from "@heroicons/react/24/outline";

interface CompanyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateCompany: (name: string, description?: string) => Promise<void>;
}

function CompanyModal({ isOpen, onClose, onCreateCompany }: CompanyModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsCreating(true);
    setError("");

    try {
      await onCreateCompany(name.trim(), description.trim());
      setName("");
      setDescription("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create company");
    } finally {
      setIsCreating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-80 mx-4">
        <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-900">Add New Company</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="px-4 py-4">
          <div className="space-y-3">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-md text-sm">
                {error}
              </div>
            )}
            
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Company Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-2 py-1 border border-gray-300 rounded-md text-gray-900 placeholder-gray-500 focus:border-black focus:outline-none focus:ring-black text-sm"
                placeholder="Enter company name"
                required
              />
            </div>
            
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Description (Optional)
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-2 py-1 border border-gray-300 rounded-md text-gray-900 placeholder-gray-500 focus:border-black focus:outline-none focus:ring-black text-sm"
                placeholder="Enter description"
              />
            </div>
          </div>
          
          <div className="flex justify-end gap-2 mt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isCreating || !name.trim()}
              className="px-3 py-1 text-sm font-medium text-white bg-black rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isCreating ? "Creating..." : "Create Company"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Homepage() {
  const { user, currentCompany, companies, setCurrentCompany, setCompanies } = useAuth();
  const [isCompanyModalOpen, setIsCompanyModalOpen] = useState(false);

  const handleCreateCompany = async (name: string, description?: string) => {
    if (!user) throw new Error("User not found");

    const result = await createCompany(user.id, name, description);
    
    if (result.error) {
      throw new Error(result.error);
    } else if (result.company) {
      // Add new company to the list
      const newUserCompany = {
        company_id: result.company.id,
        role: "Owner" as const,
        companies: result.company
      };
      
      setCompanies([...companies, newUserCompany]);
      setCurrentCompany(result.company);
    }
  };

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
        
        {!currentCompany && user && (
          <div className="mb-8 p-6 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-blue-800 mb-4">
              To get started, please select a company below:
            </p>
            
            {companies.length > 0 ? (
              <div className="space-y-3">
                <div className={`grid gap-3 ${
                  companies.length === 0 
                    ? 'grid-cols-1 max-w-md mx-auto' 
                    : companies.length === 1 
                      ? 'grid-cols-1 md:grid-cols-2 max-w-2xl mx-auto' 
                      : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
                }`}>
                  {companies.map((userCompany) => (
                    <button
                      key={userCompany.company_id}
                      onClick={() => setCurrentCompany(userCompany.companies)}
                      className="h-28 p-4 bg-white border border-blue-200 rounded-lg hover:border-blue-400 hover:shadow-md transition-all text-left"
                    >
                      <h4 className="font-semibold text-gray-900">{userCompany.companies.name}</h4>
                      {userCompany.companies.description && (
                        <p className="text-sm text-gray-600 mt-1">{userCompany.companies.description}</p>
                      )}
                      <p className="text-xs text-blue-600 mt-2">Role: {userCompany.role}</p>
                    </button>
                  ))}
                  
                  {/* Add Company Card */}
                  <button
                    onClick={() => setIsCompanyModalOpen(true)}
                    className="h-28 p-4 bg-white border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-400 hover:shadow-md transition-all flex flex-col items-center justify-center text-gray-500 hover:text-blue-600"
                  >
                    <PlusIcon className="w-8 h-8 mb-2" />
                    <span className="text-sm font-medium">Add Company</span>
                  </button>
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
        
        {user && currentCompany && (
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
      </div>

      {/* Company Modal */}
      <CompanyModal
        isOpen={isCompanyModalOpen}
        onClose={() => setIsCompanyModalOpen(false)}
        onCreateCompany={handleCreateCompany}
      />
    </main>
  );
} 