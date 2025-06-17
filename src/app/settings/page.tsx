"use client";

import { useAuth } from "@/app/components/AuthContext";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { updateUserEmail, updateUserPassword } from "@/lib/auth";
import { XMarkIcon, PlusIcon } from "@heroicons/react/24/outline";

interface Company {
  id: string;
  name: string;
  description?: string;
}

interface CompanyUser {
  id: string;
  email: string;
  role: "Owner" | "User" | "Accountant";
  is_access_enabled: boolean;
}

interface EditCompanyModalProps {
  isOpen: boolean;
  onClose: () => void;
  company: Company;
  onUpdateCompany: (updatedData: { name: string; description: string }) => Promise<void>;
}

function EditCompanyModal({ isOpen, onClose, company, onUpdateCompany }: EditCompanyModalProps) {
  const [name, setName] = useState(company.name);
  const [description, setDescription] = useState(company.description || "");
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsUpdating(true);
    setError("");

    try {
      await onUpdateCompany({ name: name.trim(), description: description.trim() });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update company");
    } finally {
      setIsUpdating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-96 mx-4">
        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">Edit Company</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="px-6 py-4">
          <div className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
                {error}
              </div>
            )}
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Company Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 placeholder-gray-500 focus:border-black focus:outline-none focus:ring-black"
                placeholder="Enter company name"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Description (Optional)
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 placeholder-gray-500 focus:border-black focus:outline-none focus:ring-black"
                placeholder="Enter description"
              />
            </div>
          </div>
          
          <div className="flex justify-end gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isUpdating || !name.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-black rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isUpdating ? "Updating..." : "Update Company"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface AddUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  companyId: string;
  onAddUser: (email: string, role: "Owner" | "User" | "Accountant") => Promise<void>;
}

function AddUserModal({ isOpen, onClose, onAddUser }: AddUserModalProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"Owner" | "User" | "Accountant">("User");
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setIsAdding(true);
    setError("");

    try {
      await onAddUser(email.trim(), role);
      setEmail("");
      setRole("User");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add user");
    } finally {
      setIsAdding(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-96 mx-4">
        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">Add User</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="px-6 py-4">
          <div className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
                {error}
              </div>
            )}
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email Address *
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 placeholder-gray-500 focus:border-black focus:outline-none focus:ring-black"
                placeholder="Enter email address"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Role *
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as "Owner" | "User" | "Accountant")}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:border-black focus:outline-none focus:ring-black"
              >
                <option value="User">User</option>
                <option value="Accountant">Accountant</option>
                <option value="Owner">Owner</option>
              </select>
            </div>
          </div>
          
          <div className="flex justify-end gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isAdding || !email.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-black rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isAdding ? "Adding..." : "Add User"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { user, companies, setCompanies, currentCompany, setCurrentCompany } = useAuth();
  
  // Company Settings States
  const [selectedCompanyForUsers, setSelectedCompanyForUsers] = useState<Company | null>(currentCompany);
  const [companyUsers, setCompanyUsers] = useState<CompanyUser[]>([]);
  const [editCompanyModal, setEditCompanyModal] = useState<{
    isOpen: boolean;
    company: Company | null;
  }>({
    isOpen: false,
    company: null
  });
  const [addUserModal, setAddUserModal] = useState<{
    isOpen: boolean;
    companyId: string;
  }>({
    isOpen: false,
    companyId: ""
  });

  // Profile Settings States
  const [isEditingProfile, setIsEditingProfile] = useState(false);
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

  // Fetch company users when selected company changes
  useEffect(() => {
    if (selectedCompanyForUsers) {
      fetchCompanyUsers(selectedCompanyForUsers.id);
    }
  }, [selectedCompanyForUsers]);

  const fetchCompanyUsers = async (companyId: string) => {
    try {
      const { data, error } = await supabase
        .from("users")
        .select("id, email, role, is_access_enabled")
        .in("id", 
          await supabase
            .from("company_users")
            .select("user_id")
            .eq("company_id", companyId)
            .eq("is_active", true)
            .then(({ data }) => (data || []).map(item => item.user_id))
        );

      if (error) throw error;

      const users: CompanyUser[] = (data || []).map((user: { id: string; email: string; role: string; is_access_enabled: boolean }) => ({
        id: user.id,
        email: user.email,
        role: (user.role as "Owner" | "User" | "Accountant"),
        is_access_enabled: user.is_access_enabled
      }));

      setCompanyUsers(users);
    } catch (error) {
      console.error("Error fetching company users:", error);
      setCompanyUsers([]);
    }
  };

  const handleUpdateCompany = async (updatedData: { name: string; description: string }) => {
    if (!editCompanyModal.company) return;

    try {
      const { error } = await supabase
        .from("companies")
        .update(updatedData)
        .eq("id", editCompanyModal.company.id);

      if (error) throw error;

      // Update the companies list
      const updatedCompanies = companies.map(userCompany => ({
        ...userCompany,
        companies: userCompany.companies.id === editCompanyModal.company!.id
          ? { ...userCompany.companies, ...updatedData }
          : userCompany.companies
      }));
      setCompanies(updatedCompanies);

      // Update current company if it's the one being edited
      if (currentCompany?.id === editCompanyModal.company.id) {
        setCurrentCompany({ ...currentCompany, ...updatedData });
      }

      // Update selected company for users if it's the one being edited
      if (selectedCompanyForUsers?.id === editCompanyModal.company.id) {
        setSelectedCompanyForUsers({ ...selectedCompanyForUsers, ...updatedData });
      }

      setEditCompanyModal({ isOpen: false, company: null });
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "Failed to update company");
    }
  };

  const handleDeleteCompany = async (companyId: string) => {
    if (!window.confirm("Are you sure you want to delete this company? This action cannot be undone.")) {
      return;
    }

    try {
      const { error } = await supabase
        .from("companies")
        .delete()
        .eq("id", companyId);

      if (error) throw error;

      // Update the companies list
      const updatedCompanies = companies.filter(userCompany => userCompany.companies.id !== companyId);
      setCompanies(updatedCompanies);

      // If the deleted company was the current company, clear it
      if (currentCompany?.id === companyId) {
        setCurrentCompany(null);
      }

      // If the deleted company was selected for users, clear it
      if (selectedCompanyForUsers?.id === companyId) {
        setSelectedCompanyForUsers(null);
        setCompanyUsers([]);
      }
    } catch (error) {
      console.error("Error deleting company:", error);
      alert("Failed to delete company. Please try again.");
    }
  };

  const handleAddUser = async (email: string, role: "Owner" | "User" | "Accountant") => {
    // For now, just show a success message since we're keeping this static
    alert(`User ${email} with role ${role} would be added to the company.`);
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

  if (!user) {
    return (
      <div className="p-6 text-center">
        <p className="text-gray-600">Please sign in to access settings.</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-lg font-bold text-gray-900 mb-4">Settings</h1>

      {/* Single Container for Both Sections */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-8">
        
        {/* Company Settings */}
        <div>
          <h2 className="text-base font-semibold text-gray-900 mb-6">Company Settings</h2>
          
          {/* Companies List */}
          <div className="mb-6">
            <h3 className="text-sm font-medium text-gray-900 mb-3">Companies</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {companies.map((userCompany) => (
                <button
                  key={userCompany.company_id}
                  onClick={() => setSelectedCompanyForUsers(userCompany.companies)}
                  className={`h-20 p-3 bg-white border rounded-lg hover:shadow-md transition-all text-left relative ${
                    selectedCompanyForUsers?.id === userCompany.companies.id
                      ? 'border-blue-400 shadow-md bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="absolute top-2 right-2 flex gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditCompanyModal({ 
                          isOpen: true, 
                          company: userCompany.companies 
                        });
                      }}
                      className="text-xs text-blue-600 hover:text-blue-800"
                    >
                      Edit
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteCompany(userCompany.company_id);
                      }}
                      className="text-xs text-red-600 hover:text-red-800"
                    >
                      Delete
                    </button>
                  </div>
                  <h4 className="font-semibold text-gray-900 pr-12 text-sm">{userCompany.companies.name}</h4>
                  {userCompany.companies.description && (
                    <p className="text-xs text-gray-600 mt-1">{userCompany.companies.description}</p>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Users Management */}
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-medium text-gray-900">
                {selectedCompanyForUsers ? `${selectedCompanyForUsers.name} Users` : 'Company Users'}
              </h3>
              <button
                onClick={() => {
                  if (selectedCompanyForUsers) {
                    setAddUserModal({ isOpen: true, companyId: selectedCompanyForUsers.id });
                  }
                }}
                disabled={!selectedCompanyForUsers}
                className="bg-gray-100 hover:bg-gray-200 border px-3 py-1 rounded text-xs flex items-center space-x-1"
              >
                <PlusIcon className="w-4 h-4" />
                Add User
              </button>
            </div>

            {selectedCompanyForUsers ? (
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Email
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Role
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Access
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {companyUsers.map((companyUser) => (
                      <tr key={companyUser.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {companyUser.email}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {companyUser.role}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            companyUser.is_access_enabled 
                              ? "bg-green-100 text-green-800" 
                              : "bg-red-100 text-red-800"
                          }`}>
                            {companyUser.is_access_enabled ? "Enabled" : "Disabled"}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <button className="text-blue-600 hover:text-blue-900 mr-3">
                            Edit
                          </button>
                          <button className="text-red-600 hover:text-red-900">
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                    {companyUsers.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-6 py-4 text-center text-sm text-gray-500">
                          No users found for this company.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500 border border-gray-200 rounded-lg">
                Please select a company above to view its users.
              </div>
            )}
          </div>
        </div>

        {/* Profile Settings */}
        <div className="border-t border-gray-200 pt-8">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-base font-semibold text-gray-900">Profile Settings</h2>
            <button
              type="button"
              onClick={() => {
                setIsEditingProfile(!isEditingProfile);
                setEmailForm(prev => ({ ...prev, error: "", success: false }));
                setPasswordForm(prev => ({ 
                  ...prev, 
                  error: "", 
                  success: false,
                  currentPassword: "",
                  newPassword: "",
                  confirmPassword: ""
                }));
              }}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              {isEditingProfile ? "Cancel" : "Edit Profile"}
            </button>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Email Address */}
            <div>
              <h3 className="text-sm font-medium text-gray-900 mb-4">Email Address</h3>

              {emailForm.error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm mb-4">
                  {emailForm.error}
                </div>
              )}
              {emailForm.success && (
                <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-md text-sm mb-4">
                  Email address updated successfully!
                </div>
              )}

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
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <h3 className="text-sm font-medium text-gray-900 mb-4">Password</h3>

              {passwordForm.error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm mb-4">
                  {passwordForm.error}
                </div>
              )}
              {passwordForm.success && (
                <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-md text-sm mb-4">
                  Password updated successfully!
                </div>
              )}

              {isEditingProfile ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Current Password
                    </label>
                    <input
                      type="password"
                      value={passwordForm.currentPassword}
                      onChange={(e) => setPasswordForm(prev => ({ ...prev, currentPassword: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:border-black focus:outline-none focus:ring-black"
                      required
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
                      required
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
                      required
                      minLength={6}
                    />
                  </div>
                </div>
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
          </div>
          
          {/* Single Update Button */}
          {isEditingProfile && (
            <div className="mt-6 pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={handleUpdateProfile}
                disabled={emailForm.isUpdating || passwordForm.isUpdating}
                className="w-full px-4 py-2 bg-black text-white rounded-md hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {emailForm.isUpdating || passwordForm.isUpdating ? "Updating Profile..." : "Update Profile"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Edit Company Modal */}
      {editCompanyModal.company && (
        <EditCompanyModal
          isOpen={editCompanyModal.isOpen}
          onClose={() => setEditCompanyModal({ isOpen: false, company: null })}
          company={editCompanyModal.company}
          onUpdateCompany={handleUpdateCompany}
        />
      )}

      {/* Add User Modal */}
      <AddUserModal
        isOpen={addUserModal.isOpen}
        onClose={() => setAddUserModal({ isOpen: false, companyId: "" })}
        companyId={addUserModal.companyId}
        onAddUser={handleAddUser}
      />
    </div>
  );
} 