"use client";

import { useAuth } from "@/app/components/AuthContext";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createCompany, updateUserEmail, updateUserPassword } from "@/lib/auth-client";
import { XMarkIcon, PlusIcon, UserIcon, ArrowRightOnRectangleIcon } from "@heroicons/react/24/outline";

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
  const { user, currentCompany, companies, setCurrentCompany, setCompanies, logout } = useAuth();
  const [isCompanyModalOpen, setIsCompanyModalOpen] = useState(false);
  const [showAccountSection, setShowAccountSection] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const router = useRouter();
  
  // Profile form states
  const [emailForm, setEmailForm] = useState({
    email: user?.email || "",
    isUpdating: false,
    error: "",
    success: false
  });
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
    isUpdating: false,
    error: "",
    success: false
  });

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

  const handleUpdateProfile = async () => {
    if (!user || !isEditingProfile) return;

    // Reset errors and success states
    setEmailForm(prev => ({ ...prev, error: "", success: false }));
    setPasswordForm(prev => ({ ...prev, error: "", success: false }));

    let hasChanges = false;
    let hasErrors = false;

    // Check if email changed
    const emailChanged = emailForm.email !== user.email;
    
    // Check if password fields are filled
    const passwordChanged = passwordForm.currentPassword || passwordForm.newPassword || passwordForm.confirmPassword;

    if (!emailChanged && !passwordChanged) {
      return; // No changes to save
    }

    // Validate password if being changed
    if (passwordChanged) {
      if (!passwordForm.currentPassword) {
        setPasswordForm(prev => ({ ...prev, error: "Current password is required" }));
        hasErrors = true;
      }
      if (!passwordForm.newPassword) {
        setPasswordForm(prev => ({ ...prev, error: "New password is required" }));
        hasErrors = true;
      }
      if (passwordForm.newPassword !== passwordForm.confirmPassword) {
        setPasswordForm(prev => ({ ...prev, error: "New passwords do not match" }));
        hasErrors = true;
      }
      if (passwordForm.newPassword.length < 6) {
        setPasswordForm(prev => ({ ...prev, error: "Password must be at least 6 characters long" }));
        hasErrors = true;
      }
    }

    if (hasErrors) return;

    // Set updating state
    if (emailChanged) setEmailForm(prev => ({ ...prev, isUpdating: true }));
    if (passwordChanged) setPasswordForm(prev => ({ ...prev, isUpdating: true }));

    try {
      // Update email if changed
      if (emailChanged) {
        const emailResult = await updateUserEmail(user.id, emailForm.email);
        if (emailResult.error) {
          setEmailForm(prev => ({ ...prev, error: emailResult.error, isUpdating: false }));
          if (passwordChanged) setPasswordForm(prev => ({ ...prev, isUpdating: false }));
          return;
        }
        hasChanges = true;
      }

      // Update password if changed
      if (passwordChanged) {
        const passwordResult = await updateUserPassword(user.id, passwordForm.currentPassword, passwordForm.newPassword);
        if (passwordResult.error) {
          setPasswordForm(prev => ({ ...prev, error: passwordResult.error, isUpdating: false }));
          if (emailChanged) setEmailForm(prev => ({ ...prev, isUpdating: false }));
          return;
        }
        hasChanges = true;
      }

      // Success - reset form and exit edit mode
      if (hasChanges) {
        setEmailForm(prev => ({ ...prev, isUpdating: false, success: true }));
        setPasswordForm({
          currentPassword: "",
          newPassword: "",
          confirmPassword: "",
          isUpdating: false,
          error: "",
          success: true
        });
        setIsEditingProfile(false);

        // Clear success message after 3 seconds
        setTimeout(() => {
          setEmailForm(prev => ({ ...prev, success: false }));
          setPasswordForm(prev => ({ ...prev, success: false }));
        }, 3000);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to update profile";
      setEmailForm(prev => ({ ...prev, error: errorMessage, isUpdating: false }));
      setPasswordForm(prev => ({ ...prev, error: errorMessage, isUpdating: false }));
    }
  };

  const handleLogout = () => {
    logout();
  };

  const handleAccountClick = () => {
    setShowAccountSection(!showAccountSection);
    // Reset form when showing account section
    if (!showAccountSection && user) {
      setEmailForm({
        email: user.email,
        isUpdating: false,
        error: "",
        success: false
      });
      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
        isUpdating: false,
        error: "",
        success: false
      });
      setIsEditingProfile(false);
    }
  };

  const handleCompanySelect = (company: { id: string; name: string; description?: string }) => {
    setCurrentCompany(company);
    router.push('/transactions');
  };

  return (
    <main className="flex items-center justify-center min-h-screen">
      <div className="text-center max-w-4xl mx-auto px-6">
        {/* Header with action buttons */}
        {user && (
          <div className="flex justify-end gap-3 mb-8">
            <button
              onClick={handleAccountClick}
              className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md hover:border-gray-400 transition-colors"
            >
              <UserIcon className="w-4 h-4" />
              {showAccountSection ? "Back to Companies" : "Account"}
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md hover:border-gray-400 transition-colors"
            >
              <ArrowRightOnRectangleIcon className="w-4 h-4" />
              Logout
            </button>
          </div>
        )}

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

        {/* Account Section */}
        {showAccountSection && user && (
          <div className="mb-8 p-6 bg-gray-50 border border-gray-200 rounded-lg max-w-md mx-auto">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Account Details</h3>
            
            {emailForm.error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm mb-4">
                {emailForm.error}
              </div>
            )}
            {passwordForm.error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm mb-4">
                {passwordForm.error}
              </div>
            )}
            {(emailForm.success || passwordForm.success) && (
              <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-md text-sm mb-4">
                Profile updated successfully!
              </div>
            )}

            <div className="space-y-4 text-left">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  value={emailForm.email}
                  onChange={(e) => setEmailForm(prev => ({ ...prev, email: e.target.value }))}
                  disabled={!isEditingProfile}
                  className={`w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:border-black focus:outline-none focus:ring-black ${
                    !isEditingProfile ? "bg-gray-50 text-gray-500" : ""
                  }`}
                />
              </div>

              {isEditingProfile ? (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Current Password
                    </label>
                    <input
                      type="password"
                      value={passwordForm.currentPassword}
                      onChange={(e) => setPasswordForm(prev => ({ ...prev, currentPassword: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:border-black focus:outline-none focus:ring-black"
                      placeholder="Enter current password"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      New Password
                    </label>
                    <input
                      type="password"
                      value={passwordForm.newPassword}
                      onChange={(e) => setPasswordForm(prev => ({ ...prev, newPassword: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:border-black focus:outline-none focus:ring-black"
                      placeholder="Enter new password"
                      minLength={6}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Confirm New Password
                    </label>
                    <input
                      type="password"
                      value={passwordForm.confirmPassword}
                      onChange={(e) => setPasswordForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:border-black focus:outline-none focus:ring-black"
                      placeholder="Confirm new password"
                      minLength={6}
                    />
                  </div>
                </>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Password
                  </label>
                  <input
                    type="password"
                    value="••••••••"
                    disabled
                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-500"
                  />
                </div>
              )}
            </div>

            <div className="mt-6">
              {isEditingProfile ? (
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setIsEditingProfile(false);
                      setEmailForm(prev => ({ ...prev, email: user.email, error: "", success: false }));
                      setPasswordForm({
                        currentPassword: "",
                        newPassword: "",
                        confirmPassword: "",
                        isUpdating: false,
                        error: "",
                        success: false
                      });
                    }}
                    className="flex-1 px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleUpdateProfile}
                    disabled={emailForm.isUpdating || passwordForm.isUpdating}
                    className="flex-1 px-4 py-2 text-sm font-medium text-white bg-black rounded-md hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {emailForm.isUpdating || passwordForm.isUpdating ? "Saving..." : "Save"}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setIsEditingProfile(true)}
                  className="w-full px-4 py-2 text-sm font-medium text-white bg-black rounded-md hover:bg-gray-800"
                >
                  Edit Profile
                </button>
              )}
            </div>
          </div>
        )}
        
        {/* Company Selection - only show when not in account section */}
        {user && !showAccountSection && (
          <div className="mb-8 p-6 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-blue-800 mb-4">
              {currentCompany ? "Switch company or create a new one:" : "Select a company to get started:"}
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
                      onClick={() => handleCompanySelect(userCompany.companies)}
                      className={`p-4 bg-white border rounded-lg hover:shadow-md transition-all text-left ${
                        currentCompany?.id === userCompany.companies.id
                          ? 'border-blue-400 shadow-md ring-2 ring-blue-200'
                          : 'border-blue-200 hover:border-blue-400'
                      }`}
                    >
                      <h4 className="font-semibold text-gray-900">{userCompany.companies.name}</h4>
                      {userCompany.companies.description && (
                        <p className="text-sm text-gray-600 mt-1">{userCompany.companies.description}</p>
                      )}
                      <p className="text-xs text-blue-600 mt-2">Role: {userCompany.role}</p>
                      {currentCompany?.id === userCompany.companies.id && (
                        <p className="text-xs text-green-600 mt-1 font-medium">✓ Currently selected</p>
                      )}
                    </button>
                  ))}
                  
                  {/* Add Company Card */}
                  <button
                    onClick={() => setIsCompanyModalOpen(true)}
                    className="p-4 bg-white border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-400 hover:shadow-md transition-all flex flex-col items-center justify-center text-gray-500 hover:text-blue-600"
                  >
                    <PlusIcon className="w-8 h-8 mb-2" />
                    <span className="text-sm font-medium">Add Company</span>
                  </button>
                </div>
                {currentCompany ? (
                  <p className="text-sm text-blue-600 mt-4">
                    You can access the accounting features from the navigation menu above, or switch to a different company.
                  </p>
                ) : (
                  <p className="text-sm text-blue-600 mt-4">
                    Click on a company above to start managing your accounting, or create a new company.
                  </p>
                )}
              </div>
            ) : (
              <div className="text-center">
                <p className="text-blue-700 mb-3">
                  You don&apos;t have any companies yet. Get started by creating your first company.
                </p>
                <button
                  onClick={() => setIsCompanyModalOpen(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                >
                  <PlusIcon className="w-4 h-4" />
                  Create Company
                </button>
              </div>
            )}
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