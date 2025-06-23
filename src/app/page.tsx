"use client";

import { useAuthStore } from "@/zustand/authStore";
import { useApiWithCompany } from "@/hooks/useApiWithCompany";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, Plus } from "lucide-react";
import NavBar from "@/components/NavBar";

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
            <X className="w-4 h-4" />
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
              {isCreating ? "Creating..." : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function GatewayPage() {
  const { user, companies } = useAuthStore();
  const { fetchAuthenticated } = useApiWithCompany();
  const [isCompanyModalOpen, setIsCompanyModalOpen] = useState(false);
  const [showAccountSection, setShowAccountSection] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
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

    // Use the authenticated fetch to create company
    const response = await fetchAuthenticated("/api/company/create", {
      method: "POST",
      body: JSON.stringify({ name, description }),
    });

    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(result.error || "Failed to create company");
    }

    if (result.company) {
      // Add new company to the list
      const newUserCompany = {
        company_id: result.company.id,
        role: "Owner" as const,
        companies: result.company
      };
      
      // Update the global state through Zustand
      useAuthStore.setState(state => ({
        ...state,
        companies: [...state.companies, newUserCompany],
      }));
    }
  };

  const handleUpdateProfile = async () => {
    if (!user || !isEditingProfile) return;

    // Reset errors and success states
    setEmailForm(prev => ({ ...prev, error: "", success: false }));
    setPasswordForm(prev => ({ ...prev, error: "", success: false }));

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
        const emailResult = await fetchAuthenticated("/api/user/update-email", {
          method: "POST",
          body: JSON.stringify({ email: emailForm.email }),
        });
        if (!emailResult.ok) {
          setEmailForm(prev => ({ ...prev, error: "Failed to update email", isUpdating: false }));
          if (passwordChanged) setPasswordForm(prev => ({ ...prev, isUpdating: false }));
          return;
        }
      }

      // Update password if changed
      if (passwordChanged) {
        const passwordResult = await fetchAuthenticated("/api/user/update-password", {
          method: "POST",
          body: JSON.stringify({
            currentPassword: passwordForm.currentPassword,
            newPassword: passwordForm.newPassword,
          }),
        });
        if (!passwordResult.ok) {
          setPasswordForm(prev => ({ ...prev, error: "Failed to update password", isUpdating: false }));
          if (emailChanged) setEmailForm(prev => ({ ...prev, isUpdating: false }));
          return;
        }
      }

      // Success - reset form and exit edit mode
      if (emailChanged || passwordChanged) {
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
    // Implement company selection logic
    console.log("Selected company:", company);
    router.push('/transactions');
  };

  return (
    <>
      <NavBar 
        showAccountAction={handleAccountClick}
        showAccountSection={showAccountSection}
        isGatewayPage={true}
      />
      <main className="flex items-center justify-center min-h-screen">
        <div className="text-center max-w-4xl mx-auto px-6">
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
            <div className="mb-8">
              {companies.length > 0 ? (
                <div className="space-y-4 max-w-4xl mx-auto">
                  {/* Add Company Button */}
                  <div className="flex justify-start">
                    <button
                      onClick={() => setIsCompanyModalOpen(true)}
                      className="flex items-center gap-2 px-2 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 transition-colors hover:cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      Add Company
                    </button>
                  </div>

                  {/* Search Bar */}
                  <div className="w-full">
                    <input
                      type="text"
                      placeholder="Search companies..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 placeholder-gray-500 focus:border-gray-900 focus:outline-none focus:ring-gray-900 text-sm"
                    />
                  </div>

                  {/* Company Table */}
                  <div className="border border-gray-300 rounded-md overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b border-gray-300">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                            Company
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                            Description
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                            Role
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">
                            Action
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {companies
                          .filter((userCompany) => 
                            userCompany.companies.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            (userCompany.companies.description || "").toLowerCase().includes(searchQuery.toLowerCase())
                          )
                          .map((userCompany) => (
                          <tr key={userCompany.company_id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-left text-sm font-medium text-gray-900">
                              {userCompany.companies.name}
                            </td>
                            <td className="px-4 py-3 text-left text-sm text-gray-600">
                              {userCompany.companies.description || "-"}
                            </td>
                            <td className="px-4 py-3 text-left text-sm text-gray-600">
                              {userCompany.role}
                            </td>
                            <td className="px-4 py-3 text-left">
                              <button
                                onClick={() => handleCompanySelect(userCompany.companies)}
                                className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 transition-colors ml-auto hover:cursor-pointer"
                              >
                                Enter
                                <span>→</span>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    
                    {companies.filter((userCompany) => 
                      userCompany.companies.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      (userCompany.companies.description || "").toLowerCase().includes(searchQuery.toLowerCase())
                    ).length === 0 && searchQuery && (
                      <div className="text-center py-6 bg-white">
                        <p className="text-gray-500 text-sm">No companies found matching &ldquo;{searchQuery}&rdquo;</p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-center">
                  <p className="text-gray-600 mb-4">
                    You don&apos;t have any companies yet.
                  </p>
                  <button
                    onClick={() => setIsCompanyModalOpen(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-md hover:bg-gray-800 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Create
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
    </>
  );
} 