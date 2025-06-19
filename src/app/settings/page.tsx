"use client";

import { useAuth } from "@/components/AuthContext";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useApiWithCompany } from "@/hooks/useApiWithCompany";
import { X, Plus, CreditCard, Trash, ArrowRight, AlertTriangle } from "lucide-react";

interface CompanyMember {
  id: string;
  email: string;
  role: "Owner" | "Member" | "Accountant";
  is_access_enabled: boolean;
}

interface EditCompanyModalProps {
  isOpen: boolean;
  onClose: () => void;
  company: { id: string; name: string; description?: string };
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
          <h2 className="text-base font-semibold text-gray-900">Edit Company Info</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
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

interface AddMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddMember: (email: string, role: "Owner" | "Member" | "Accountant") => Promise<void>;
}

function AddMemberModal({ isOpen, onClose, onAddMember }: AddMemberModalProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"Owner" | "Member" | "Accountant">("Member");
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setIsAdding(true);
    setError("");

    try {
      await onAddMember(email.trim(), role);
      setEmail("");
      setRole("Member");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add member");
    } finally {
      setIsAdding(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-96 mx-4">
        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">Add Team Member</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
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
                onChange={(e) => setRole(e.target.value as "Owner" | "Member" | "Accountant")}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:border-black focus:outline-none focus:ring-black"
              >
                <option value="Owner">Owner</option>
                <option value="Member">Member</option>
                <option value="Accountant">Accountant</option>
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
              {isAdding ? "Adding..." : "Add Member"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface TransferOwnershipModalProps {
  isOpen: boolean;
  onClose: () => void;
  members: CompanyMember[];
  onTransferOwnership: (newOwnerId: string) => Promise<void>;
}

function TransferOwnershipModal({ isOpen, onClose, members, onTransferOwnership }: TransferOwnershipModalProps) {
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [isTransferring, setIsTransferring] = useState(false);
  const [error, setError] = useState("");

  const nonOwnerMembers = members.filter(member => member.role !== "Owner");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMemberId) return;

    setIsTransferring(true);
    setError("");

    try {
      await onTransferOwnership(selectedMemberId);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to transfer ownership");
    } finally {
      setIsTransferring(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-96 mx-4">
        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">Transfer Ownership</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="px-6 py-4">
          <div className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
                {error}
              </div>
            )}
            
            <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-md text-sm">
              <strong>Warning:</strong> This action cannot be undone. You will lose owner privileges and the selected member will become the new owner.
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select New Owner *
              </label>
              <select
                value={selectedMemberId}
                onChange={(e) => setSelectedMemberId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:border-black focus:outline-none focus:ring-black"
                required
              >
                <option value="">Choose a team member...</option>
                {nonOwnerMembers.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.email} ({member.role})
                  </option>
                ))}
              </select>
              {nonOwnerMembers.length === 0 && (
                <p className="text-sm text-gray-500 mt-1">
                  No other team members available. Add members first before transferring ownership.
                </p>
              )}
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
              disabled={isTransferring || !selectedMemberId || nonOwnerMembers.length === 0}
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors hover:bg-red-700"
            >
              {isTransferring ? "Transferring..." : "Transfer Ownership"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  confirmButtonStyle?: "primary" | "danger";
}

function ConfirmationModal({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title, 
  message, 
  confirmText = "Confirm", 
  cancelText = "Cancel",
  confirmButtonStyle = "primary"
}: ConfirmationModalProps) {
  if (!isOpen) return null;

  const confirmButtonClasses = confirmButtonStyle === "danger" 
    ? "px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 transition-colors"
    : "px-4 py-2 text-sm font-medium text-white bg-black rounded-md hover:bg-gray-800 transition-colors";

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-96 mx-4">
        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="px-6 py-4">
          <p className="text-sm text-gray-700">{message}</p>
          
          <div className="flex justify-end gap-3 mt-6">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
            >
              {cancelText}
            </button>
            <button
              onClick={onConfirm}
              className={confirmButtonClasses}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface DeleteCompanyModalProps {
  isOpen: boolean;
  onClose: () => void;
  companyName: string;
  onDeleteCompany: () => Promise<void>;
}

function DeleteCompanyModal({ isOpen, onClose, companyName, onDeleteCompany }: DeleteCompanyModalProps) {
  const [deleteText, setDeleteText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState("");

  const isDeleteTextValid = deleteText === "DELETE";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isDeleteTextValid) return;

    setIsDeleting(true);
    setError("");

    try {
      await onDeleteCompany();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete company");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleClose = () => {
    setDeleteText("");
    setError("");
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-96 mx-4">
        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-600" />
            <h2 className="text-base font-semibold text-gray-900">Delete Company</h2>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="px-6 py-4">
          <div className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
                {error}
              </div>
            )}
            
            <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-md text-sm">
              <div className="flex">
                <AlertTriangle className="w-5 h-5 text-red-600 mr-2 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">This action cannot be undone.</p>
                  <p className="mt-1">This will permanently delete the company <strong>&ldquo;{companyName}&rdquo;</strong> and all of its data including transactions, accounts, and team members.</p>
                </div>
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Type <strong>DELETE</strong> to confirm deletion
              </label>
              <input
                type="text"
                value={deleteText}
                onChange={(e) => setDeleteText(e.target.value)}
                className="w-full text-sm px-3 py-2 border border-gray-300 rounded-md text-gray-900 placeholder-gray-500 focus:border-red-500 focus:outline-none focus:ring-red-500"
                placeholder="Type DELETE here"
                required
              />
              {deleteText && !isDeleteTextValid && (
                <p className="text-sm text-red-600 mt-1">Please type &ldquo;DELETE&rdquo; exactly as shown</p>
              )}
            </div>
          </div>
          
          <div className="flex justify-end gap-3 mt-6">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isDeleting || !isDeleteTextValid}
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors hover:bg-red-700"
            >
              {isDeleting ? "Deleting..." : "Delete Company"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { user, currentCompany, setCurrentCompany, companies, setCompanies } = useAuth();
  const router = useRouter();
  const { fetchWithCompany } = useApiWithCompany();
  
  // Team Members State
  const [companyMembers, setCompanyMembers] = useState<CompanyMember[]>([]);
  const [editCompanyModal, setEditCompanyModal] = useState<{
    isOpen: boolean;
    company: { id: string; name: string; description?: string } | null;
  }>({
    isOpen: false,
    company: null
  });
  const [addMemberModal, setAddMemberModal] = useState(false);
  const [transferOwnershipModal, setTransferOwnershipModal] = useState(false);
  const [deleteCompanyModal, setDeleteCompanyModal] = useState(false);
  const [confirmationModal, setConfirmationModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    confirmText?: string;
    confirmButtonStyle?: "primary" | "danger";
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });

  // Get current user's role in the company
  const currentUserRole = user?.role || "Member";
  const isOwner = currentUserRole === "Owner";

  // Fetch company members when component mounts or current company changes
  useEffect(() => {
    if (currentCompany) {
      fetchCompanyMembers(currentCompany.id);
    }
  }, [currentCompany]);

  const fetchCompanyMembers = async (companyId: string) => {
    try {
      // First get company users
      const { data: companyUsers, error: companyUsersError } = await supabase
        .from("company_users")
        .select("user_id, role")
        .eq("company_id", companyId)
        .eq("is_active", true);

      if (companyUsersError) throw companyUsersError;

      if (!companyUsers || companyUsers.length === 0) {
        setCompanyMembers([]);
        return;
      }

      // Then get user details
      const userIds = companyUsers.map(cu => cu.user_id);
      const { data: users, error: usersError } = await supabase
        .from("users")
        .select("id, email, is_access_enabled")
        .in("id", userIds);

      if (usersError) throw usersError;

      // Combine the data
      const members: CompanyMember[] = (users || []).map((user: { id: string; email: string; is_access_enabled: boolean }) => {
        const companyUser = companyUsers.find(cu => cu.user_id === user.id);
        return {
          id: user.id,
          email: user.email,
          role: companyUser?.role as "Owner" | "Member" | "Accountant",
          is_access_enabled: user.is_access_enabled
        };
      });

      setCompanyMembers(members);
    } catch (error) {
      console.error("Error fetching company members:", error);
      setCompanyMembers([]);
    }
  };

  const handleUpdateCompany = async (updatedData: { name: string; description: string }) => {
    if (!currentCompany) return;

    try {
      const { error } = await supabase
        .from("companies")
        .update(updatedData)
        .eq("id", currentCompany.id);

      if (error) throw error;

      // Update current company
        setCurrentCompany({ ...currentCompany, ...updatedData });
      setEditCompanyModal({ isOpen: false, company: null });
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "Failed to update company");
    }
  };

  const handleAddMember = async (email: string, role: "Owner" | "Member" | "Accountant") => {
    if (!currentCompany) return;

    try {
      const response = await fetchWithCompany("/api/member/invite-member", {
        method: "POST",
        body: JSON.stringify({ email, role }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to send invitation");
      }

      // Refresh team members list to show the newly added member
      await fetchCompanyMembers(currentCompany.id);

      setConfirmationModal({
        isOpen: true,
        title: "Invitation Sent",
        message: `An invitation has been sent to ${email}. They will receive an email with instructions to join your company as ${role}. The member has been added to your team and will have access once they accept the invitation.`,
        onConfirm: () => setConfirmationModal({ ...confirmationModal, isOpen: false }),
        confirmText: "OK",
      });
    } catch (error) {
      setConfirmationModal({
        isOpen: true,
        title: "Invitation Failed",
        message: error instanceof Error ? error.message : "Failed to send invitation. Please try again.",
        onConfirm: () => setConfirmationModal({ ...confirmationModal, isOpen: false }),
        confirmText: "OK",
        confirmButtonStyle: "danger",
      });
    }
  };

  const handleDeleteMember = async (memberId: string) => {
    const member = companyMembers.find(m => m.id === memberId);
    
    setConfirmationModal({
      isOpen: true,
      title: "Remove Team Member",
      message: `Are you sure you want to remove ${member?.email || 'this team member'} from the company?`,
      onConfirm: () => {
        // For now, just show a success message since we're keeping this static
        setConfirmationModal({
          isOpen: true,
          title: "Member Removed",
          message: `Team member ${member?.email || 'Unknown'} would be removed from the company.`,
          onConfirm: () => setConfirmationModal({ ...confirmationModal, isOpen: false }),
          confirmText: "OK",
        });
      },
      confirmText: "Remove",
      confirmButtonStyle: "danger",
    });
  };

  const handleTransferOwnership = async (newOwnerId: string) => {
    const newOwner = companyMembers.find(m => m.id === newOwnerId);
    setConfirmationModal({
      isOpen: true,
      title: "Ownership Transferred",
      message: `Ownership would be transferred to ${newOwner?.email || 'Unknown'}.`,
      onConfirm: () => setConfirmationModal({ ...confirmationModal, isOpen: false }),
      confirmText: "OK",
    });
  };

  const handleDeleteCompany = async () => {
    if (!currentCompany || !isOwner) return;

    try {
      console.log("Attempting to delete company:", {
        companyId: currentCompany.id,
        companyName: currentCompany.name,
        userId: user?.id,
      });

      const response = await fetchWithCompany("/api/delete-company", {
        method: "DELETE",
      });

      console.log("Delete response status:", response.status);

      if (!response.ok) {
        const errorData = await response.json();
        console.error("Delete failed with error:", errorData);
        
        // If company doesn't exist, clean up localStorage anyway
        if (response.status === 404 || errorData.error?.includes("Company does not exist")) {
          console.log("Company doesn't exist in database, cleaning up localStorage");
          
          // Remove the non-existent company from the companies list
          const updatedCompanies = companies.filter(c => c.companies.id !== currentCompany.id);
          setCompanies(updatedCompanies);
          
          // Clear current company and redirect to home page
          setCurrentCompany(null);
          router.push("/");
          return; // Don't throw error, treat as successful cleanup
        }
        
        throw new Error(errorData.error || "Failed to delete company");
      }

      const result = await response.json();
      console.log("Delete successful:", result);

      // Remove the deleted company from the companies list
      const updatedCompanies = companies.filter(c => c.companies.id !== currentCompany.id);
      setCompanies(updatedCompanies);

      // Clear current company and redirect to home page
      setCurrentCompany(null);
      router.push("/");
    } catch (error) {
      console.error("Error deleting company:", error);
      throw new Error(error instanceof Error ? error.message : "Failed to delete company. Please try again.");
    }
  };

  if (!user || !currentCompany) {
    return (
      <div className="p-6 text-center">
        <p className="text-gray-600">Please select a company to access settings.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-lg font-bold text-gray-900 mb-6">Settings</h1>

      <div className="space-y-8">
        {/* Info Section */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-base font-semibold text-gray-900">Company Info</h2>
                <button
              onClick={() => setEditCompanyModal({ 
                          isOpen: true, 
                company: currentCompany 
              })}
              className="text-sm text-blue-600 hover:text-blue-800"
                    >
                      Edit
                    </button>
                  </div>
          
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700">Company Name</label>
              <p className="text-sm text-gray-900 mt-1">{currentCompany.name}</p>
            </div>
            {currentCompany.description && (
              <div>
                <label className="block text-sm font-medium text-gray-700">Description</label>
                <p className="text-sm text-gray-900 mt-1">{currentCompany.description}</p>
              </div>
            )}
            </div>
          </div>

        {/* Team Section */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex justify-between items-center mb-4">
            <h2 className="text-base font-semibold text-gray-900">Team Members</h2>
            <div className="flex gap-2">
              {isOwner && (
                <button
                  onClick={() => setTransferOwnershipModal(true)}
                  className="text-sm text-orange-600 hover:text-orange-800 flex items-center gap-1"
                >
                  <ArrowRight className="w-4 h-4" />
                  Transfer Ownership
                </button>
              )}
              <button
                onClick={() => setAddMemberModal(true)}
                className="bg-gray-100 hover:bg-gray-200 border px-3 py-1 rounded text-sm flex items-center space-x-1"
              >
                <Plus className="w-4 h-4" />
                <span>Add Member</span>
              </button>
            </div>
            </div>

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
                {companyMembers.map((member) => (
                  <tr key={member.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {member.email}
                      {member.id === user.id && (
                        <span className="ml-2 text-xs text-blue-600">(You)</span>
                      )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {member.role}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        member.is_access_enabled 
                              ? "bg-green-100 text-green-800" 
                              : "bg-red-100 text-red-800"
                          }`}>
                        {member.is_access_enabled ? "Enabled" : "Disabled"}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      {member.id !== user.id && (
                        <>
                          <button className="text-blue-600 hover:text-blue-900 mr-3">
                            Edit
                          </button>
                          <button 
                            onClick={() => handleDeleteMember(member.id)}
                            className="text-red-600 hover:text-red-900"
                          >
                            Remove
                          </button>
                        </>
                      )}
                        </td>
                      </tr>
                    ))}
                {companyMembers.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-6 py-4 text-center text-sm text-gray-500">
                      No team members found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
          </div>
        </div>

        {/* Billing Section */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Billing</h2>
          
          <div className="space-y-6">
            {/* Payment Method */}
            <div>
              <h3 className="text-sm font-medium text-gray-900 mb-3">Payment Method</h3>
              <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CreditCard className="w-8 h-8 text-gray-400" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">**** **** **** 4242</p>
                      <p className="text-xs text-gray-500">Expires 12/2028</p>
                    </div>
                </div>
                  <button className="text-sm text-blue-600 hover:text-blue-800">
                    Update
                  </button>
                </div>
              </div>
            </div>

            {/* Current Plan */}
            <div>
              <h3 className="text-sm font-medium text-gray-900 mb-3">Current Plan</h3>
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">Professional Plan</p>
                    <p className="text-xs text-gray-500">$29/month • Billed monthly</p>
                  </div>
                  <button className="text-sm text-blue-600 hover:text-blue-800">
                    Manage Plan
                  </button>
                </div>
              </div>
            </div>

            {/* Danger Zone */}
            {isOwner && (
              <div>
                <h3 className="text-sm font-medium text-red-900 mb-3">Danger Zone</h3>
                <div className="border border-red-200 rounded-lg p-4 bg-red-50">
                  <div className="flex items-center justify-between">
                  <div>
                      <p className="text-sm font-medium text-red-900">Delete Company</p>
                      <p className="text-xs text-red-700">
                        Permanently delete this company and all associated data. This action cannot be undone.
                      </p>
                  </div>
                    <button
                      onClick={() => setDeleteCompanyModal(true)}
                      className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-red-700 bg-red-100 border border-red-300 rounded-md hover:bg-red-200 transition-colors"
                    >
                      <Trash className="w-4 h-4" />
                      Delete Company
                    </button>
                  </div>
                </div>
                </div>
              )}
          </div>
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

      {/* Add Member Modal */}
      <AddMemberModal
        isOpen={addMemberModal}
        onClose={() => setAddMemberModal(false)}
        onAddMember={handleAddMember}
      />

      {/* Transfer Ownership Modal */}
      <TransferOwnershipModal
        isOpen={transferOwnershipModal}
        onClose={() => setTransferOwnershipModal(false)}
        members={companyMembers}
        onTransferOwnership={handleTransferOwnership}
      />

      {/* Delete Company Modal */}
      <DeleteCompanyModal
        isOpen={deleteCompanyModal}
        onClose={() => setDeleteCompanyModal(false)}
        companyName={currentCompany.name}
        onDeleteCompany={handleDeleteCompany}
      />

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={confirmationModal.isOpen}
        onClose={() => setConfirmationModal({ ...confirmationModal, isOpen: false })}
        onConfirm={confirmationModal.onConfirm}
        title={confirmationModal.title}
        message={confirmationModal.message}
        confirmText={confirmationModal.confirmText}
        confirmButtonStyle={confirmationModal.confirmButtonStyle}
      />
    </div>
  );
} 