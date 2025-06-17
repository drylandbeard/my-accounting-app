"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { useAuth } from "./AuthContext";
import { createCompany } from "@/lib/auth";

import { ChevronDownIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { supabase } from "@/lib/supabaseClient";

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

export default function NavBar() {
  const { user, companies, currentCompany, setCurrentCompany, setCompanies, logout } = useAuth();
  const [isCompanyDropdownOpen, setIsCompanyDropdownOpen] = useState(false);
  const [isAccountDropdownOpen, setIsAccountDropdownOpen] = useState(false);

  const [isCompanyModalOpen, setIsCompanyModalOpen] = useState(false);
  const [isEditCompanyModalOpen, setIsEditCompanyModalOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<{
    id: string;
    name: string;
    description: string;
  } | null>(null);

  const companyDropdownRef = useRef<HTMLDivElement>(null);
  const accountDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (companyDropdownRef.current && !companyDropdownRef.current.contains(event.target as Node)) {
        setIsCompanyDropdownOpen(false);
      }
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

  if (!user) {
    return null; // Don't show navbar if not authenticated
  }

  return (
    <>
      <nav className="flex justify-between items-center px-6 py-2 bg-gray-100 border-b border-gray-300 text-xs font-normal">
        <div className="space-x-6 flex">
          <NavLink href="/" label="Home" />
          <NavLink href="/transactions" label="Transactions" />
          <NavLink href="/automations" label="Automations" />
          <NavLink href="/categories" label="Categories" />
          <NavLink href="/journal-table" label="Journal Table" />
          <NavLink href="/reports/pnl" label="Profit & Loss" />
          <NavLink href="/reports/balance-sheet" label="Balance Sheet" />
        </div>

        <div className="flex items-center space-x-4">
          {/* Company Dropdown */}
          <div className="relative" ref={companyDropdownRef}>
            <button
              onClick={() => setIsCompanyDropdownOpen(!isCompanyDropdownOpen)}
              className="flex items-center space-x-1 text-gray-700 hover:text-black px-2 py-1 rounded"
            >
              <span className="text-xs">
                {currentCompany ? currentCompany.name : "Select Company"}
              </span>
              <ChevronDownIcon className="w-3 h-3" />
            </button>

            {isCompanyDropdownOpen && (
              <div className="absolute right-0 mt-2 w-64 bg-white border border-gray-200 rounded-md shadow-lg z-50">
                <div className="py-1">
                  {/* Company List */}
                  {companies.map((companyUser) => (
                    <div key={companyUser.company_id} className={`flex items-center ${
                          currentCompany?.id === companyUser.companies.id
                            ? "bg-gray-100 text-gray-900 font-medium"
                            : "text-gray-700 hover:bg-gray-100"
                        }`}>
                      <button
                        onClick={() => {
                          setCurrentCompany(companyUser.companies);
                          setIsCompanyDropdownOpen(false);
                        }}
                        className="flex-1 text-left px-4 py-2 text-sm"
                      >
                        <div>{companyUser.companies.name}</div>
                        <div className="text-xs text-gray-500">{companyUser.role}</div>
                      </button>
                      <button
                        onClick={() => {
                          setEditingCompany({
                            id: companyUser.companies.id,
                            name: companyUser.companies.name,
                            description: companyUser.companies.description || ""
                          });
                          setIsEditCompanyModalOpen(true);
                          setIsCompanyDropdownOpen(false);
                        }}
                        className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700"
                        title="Edit company"
                      >
                        Edit
                      </button>
                    </div>
                  ))}
                  
                  {/* Add New Company Button */}
                  <button
                    onClick={() => {
                      setIsCompanyModalOpen(true);
                      setIsCompanyDropdownOpen(false);
                    }}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 border-t border-gray-200"
                  >
                    + Add Company
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Account Dropdown */}
          <div className="relative" ref={accountDropdownRef}>
            <button
              onClick={() => setIsAccountDropdownOpen(!isAccountDropdownOpen)}
              className="flex items-center space-x-1 text-gray-700 hover:text-black px-2 py-1 rounded"
            >
              <span className="text-xs">{user.email}</span>
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
        </div>
      </nav>



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

              // Update the companies list
              setCompanies(companies.map(companyUser => 
                companyUser.companies.id === editingCompany.id
                  ? {
                      ...companyUser,
                      companies: {
                        ...companyUser.companies,
                        name: updatedData.name,
                        description: updatedData.description
                      }
                    }
                  : companyUser
              ));

              // Update current company if it's the one being edited
              if (currentCompany?.id === editingCompany.id) {
                setCurrentCompany({
                  ...currentCompany,
                  name: updatedData.name,
                  description: updatedData.description
                });
              }

              setIsEditCompanyModalOpen(false);
              setEditingCompany(null);
            } catch (err) {
              console.error("Error updating company:", err);
              alert("Failed to update company. Please try again.");
            }
          }}
        />
      )}

      {/* Company Modal */}
      <CompanyModal
        isOpen={isCompanyModalOpen}
        onClose={() => setIsCompanyModalOpen(false)}
        onCreateCompany={handleCreateCompany}
      />
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