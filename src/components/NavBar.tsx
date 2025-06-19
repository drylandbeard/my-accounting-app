"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { useAuth } from "./AuthContext";
import { createCompany } from "@/lib/auth-client";

import { ChevronDownIcon, XMarkIcon, CogIcon, UserIcon, ArrowRightStartOnRectangleIcon } from "@heroicons/react/24/outline";
import { supabase } from "@/lib/supabase";

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

function NavLink({ href, label }: { href: string, label: string }) {
  const pathname = usePathname();
  const isActive = pathname === href;

  return (
    <Link
      href={href}
      className={`px-2 py-1 rounded ${
        isActive ? "font-semibold text-black" : "text-gray-700 hover:text-black"
      }`}
    >
      {label}
    </Link>
  );
}

interface NavBarProps {
  showAccountAction?: () => void;
  showAccountSection?: boolean;
  isGatewayPage?: boolean;
}

export default function NavBar({ showAccountAction, showAccountSection, isGatewayPage = false }: NavBarProps) {
  const { user, companies, currentCompany, setCurrentCompany, setCompanies, logout } = useAuth();
  const [isAccountDropdownOpen, setIsAccountDropdownOpen] = useState(false);
  const router = useRouter();

  const [isCompanyModalOpen, setIsCompanyModalOpen] = useState(false);
  const [isEditCompanyModalOpen, setIsEditCompanyModalOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<{
    id: string;
    name: string;
    description: string;
  } | null>(null);

  const accountDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (accountDropdownRef.current && !accountDropdownRef.current.contains(event.target as Node)) {
        setIsAccountDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleCreateCompany = async (name: string, description?: string) => {
    if (!user) throw new Error("User not found");

    // Use client-safe createCompany function (no email imports)
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

  const handleSwitchCompany = () => {
    router.push('/');
  };

  if (!user) {
    return null; // Don't show navbar if not authenticated
  }

  return (
    <>
      <nav className="flex justify-between items-center px-6 py-2 bg-gray-100 border-b border-gray-300 text-xs font-normal">
        {/* Left side - Navigation or Empty for Gateway */}
        <div className="space-x-6 flex">
          {!isGatewayPage && (
            <>
              <NavLink href="/transactions" label="Transactions" />
              <NavLink href="/automations" label="Automations" />
              <NavLink href="/categories" label="Categories" />
              <NavLink href="/journal-table" label="Journal Table" />
              <NavLink href="/reports/pnl" label="Profit & Loss" />
              <NavLink href="/reports/balance-sheet" label="Balance Sheet" />
            </>
          )}
        </div>

        {/* Right side - Actions */}
        <div className="flex items-center space-x-4">
          {/* Gateway page specific buttons */}
          {isGatewayPage && showAccountAction && (
            <button
              onClick={showAccountAction}
              className="flex items-center space-x-2 text-gray-700 hover:text-black px-3 py-1 rounded border border-gray-300 hover:border-gray-400 transition-colors"
            >
              <UserIcon className="w-4 h-4" />
              <span className="text-xs">
                {showAccountSection ? "Back to Companies" : "Account"}
              </span>
            </button>
          )}

          {/* Switch Company Button - only show when not on gateway page */}
          {!isGatewayPage && (
            <button
              onClick={handleSwitchCompany}
              className="flex items-center space-x-2 text-gray-700 hover:text-black px-3 py-1 rounded border border-gray-300 hover:border-gray-400 transition-colors"
            >
              <span className="text-xs">
                Switch Company
              </span>
              {currentCompany && (
                <span className="text-xs font-medium text-blue-600">
                  ({currentCompany.name})
                </span>
              )}
            </button>
          )}

          {/* Logout button for gateway page */}
          {isGatewayPage && (
            <button
              onClick={logout}
              className="flex items-center space-x-2 text-gray-700 hover:text-black px-3 py-1 rounded border border-gray-300 hover:border-gray-400 transition-colors"
            >
              <ArrowRightStartOnRectangleIcon className="w-4 h-4" />
              <span className="text-xs">
                Logout
              </span>
            </button>
          )}

          {/* Account Dropdown - only show when not on gateway page */}
          {!isGatewayPage && (
            <div className="relative" ref={accountDropdownRef}>
              <button
                onClick={() => setIsAccountDropdownOpen(!isAccountDropdownOpen)}
                className="flex items-center space-x-1 text-gray-700 hover:text-black px-2 py-1 rounded"
              >
                <CogIcon className="w-4 h-4" />
                <ChevronDownIcon className="w-3 h-3" />
              </button>

              {isAccountDropdownOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-md shadow-lg z-50">
                  <div className="py-1">
                    {/* Settings Option */}
                    <Link
                      href="/settings"
                      onClick={() => setIsAccountDropdownOpen(false)}
                      className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    >
                      Settings
                    </Link>
                    
                    {/* Logout */}
                    <button
                      onClick={() => {
                        logout();
                        setIsAccountDropdownOpen(false);
                      }}
                      className="block w-full text-left px-4 py-2 text-sm text-gray-900 hover:bg-gray-100 font-medium"
                    >
                      Logout
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </nav>

      {/* Company Modal */}
      <CompanyModal
        isOpen={isCompanyModalOpen}
        onClose={() => setIsCompanyModalOpen(false)}
        onCreateCompany={handleCreateCompany}
      />

      {/* Edit Company Modal */}
      {isEditCompanyModalOpen && editingCompany && (
        <EditCompanyModal
          isOpen={isEditCompanyModalOpen}
          onClose={() => {
            setIsEditCompanyModalOpen(false);
            setEditingCompany(null);
          }}
          company={editingCompany}
          onUpdateCompany={async (updatedData) => {
            try {
              const { error } = await supabase
                .from("companies")
                .update({
                  name: updatedData.name,
                  description: updatedData.description
                })
                .eq("id", editingCompany.id);

              if (error) {
                throw new Error(error.message);
              }

              // Update the companies list in context
              const updatedCompanies = companies.map(userCompany => ({
                ...userCompany,
                companies: userCompany.companies.id === editingCompany.id
                  ? { ...userCompany.companies, ...updatedData }
                  : userCompany.companies
              }));
              setCompanies(updatedCompanies);

              // Update current company if it's the one being edited
              if (currentCompany?.id === editingCompany.id) {
                setCurrentCompany({ ...currentCompany, ...updatedData });
              }

              setIsEditCompanyModalOpen(false);
              setEditingCompany(null);
            } catch (error) {
              throw new Error(error instanceof Error ? error.message : "Failed to update company");
            }
          }}
        />
      )}
    </>
  );
}

interface EditCompanyModalProps {
  isOpen: boolean;
  onClose: () => void;
  company: {
    id: string;
    name: string;
    description: string;
  };
  onUpdateCompany: (updatedData: { name: string; description: string }) => Promise<void>;
}

function EditCompanyModal({ isOpen, onClose, company, onUpdateCompany }: EditCompanyModalProps) {
  const [name, setName] = useState(company.name);
  const [description, setDescription] = useState(company.description);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsUpdating(true);
    setError("");

    try {
      await onUpdateCompany({
        name: name.trim(),
        description: description.trim()
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update company");
    } finally {
      setIsUpdating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-80 mx-4">
        <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-900">Edit Company</h2>
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
              disabled={isUpdating || !name.trim()}
              className="px-3 py-1 text-sm font-medium text-white bg-black rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isUpdating ? "Updating..." : "Update Company"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
} 