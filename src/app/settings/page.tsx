"use client";

import { useAuthStore } from "@/zustand/authStore";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { api } from "@/lib/api";
import { Plus, CreditCard, Trash, ArrowRight, AlertTriangle } from "lucide-react";
import { Select } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface CompanyMember {
  id: string;
  email: string;
  role: "Owner" | "Member" | "Accountant";
  is_access_enabled: boolean;
  first_name?: string;
  last_name?: string;
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
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-96">
        <DialogHeader>
          <DialogTitle>Add Team Member</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">{error}</div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Email Address *</label>
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
              <label className="block text-sm font-medium text-gray-700 mb-2">Role *</label>
              <Select
                value={{ value: role, label: role }}
                onChange={(newValue) => {
                  const selectedOption = newValue as { value: string; label: string } | null;
                  setRole(selectedOption?.value as "Owner" | "Member" | "Accountant");
                }}
                options={[
                  { value: "Owner", label: "Owner" },
                  { value: "Member", label: "Member" },
                  { value: "Accountant", label: "Accountant" }
                ]}
                styles={{
                  control: (base) => ({
                      ...base,
                      minHeight: "32px",
                      height: "41px",
                      fontSize: "14px",
                      border: "1px solid #d1d5db",
                      borderRadius: "6px",
                      padding: "0 8px",
                      boxShadow: "none",
                      "&:hover": {
                        borderColor: "#d1d5db",
                      },
                    }),
                    valueContainer: (base) => ({
                      ...base,
                      padding: "0",
                    }),
                    input: (base) => ({
                      ...base,
                      margin: "0",
                      padding: "0",
                    }),
                    indicatorsContainer: (base) => ({
                      ...base,
                      height: "41px",
                    }),
                    dropdownIndicator: (base) => ({
                      ...base,
                      padding: "0 4px",
                    }),
                }}
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
              Cancel
            </button>
            <button
              type="submit"
              disabled={isAdding || !email.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-black rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isAdding ? "Adding..." : "Add"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface EditMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  member: CompanyMember | null;
  onUpdateMember: (memberId: string, updates: { role?: "Owner" | "Member" | "Accountant"; is_access_enabled?: boolean }) => Promise<void>;
}

function EditMemberModal({ isOpen, onClose, member, onUpdateMember }: EditMemberModalProps) {
  const [role, setRole] = useState<"Owner" | "Member" | "Accountant">("Member");
  const [isAccessEnabled, setIsAccessEnabled] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState("");

  // Reset form when modal opens or member changes
  useEffect(() => {
    if (isOpen && member) {
      setRole(member.role);
      setIsAccessEnabled(member.is_access_enabled);
      setError("");
    }
  }, [isOpen, member]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!member) return;

    setIsUpdating(true);
    setError("");

    try {
      const updates: { role?: "Owner" | "Member" | "Accountant"; is_access_enabled?: boolean } = {};
      
      if (role !== member.role) {
        updates.role = role;
      }
      
      if (isAccessEnabled !== member.is_access_enabled) {
        updates.is_access_enabled = isAccessEnabled;
      }

      // Only call API if there are changes
      if (Object.keys(updates).length > 0) {
        await onUpdateMember(member.id, updates);
      }
      
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update member");
    } finally {
      setIsUpdating(false);
    }
  };

  const hasChanges = () => {
    if (!member) return false;
    return role !== member.role || isAccessEnabled !== member.is_access_enabled;
  };

  if (!isOpen || !member) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-96">
        <DialogHeader>
          <DialogTitle>Edit Member</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">{error}</div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
              <input
                type="text"
                value={member.email}
                disabled
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-500 bg-gray-50"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Role</label>
              <Select
                value={{ value: role, label: role }}
                onChange={(newValue) => {
                  const selectedOption = newValue as { value: string; label: string } | null;
                  setRole(selectedOption?.value as "Owner" | "Member" | "Accountant");
                }}
                options={[
                  { value: "Member", label: "Member" },
                  { value: "Accountant", label: "Accountant" }
                ]}
                isDisabled={member.role === "Owner"} // Don't allow changing owner role through this modal
                styles={{
                  control: (base) => ({
                      ...base,
                      minHeight: "32px",
                      height: "41px",
                      fontSize: "14px",
                      border: "1px solid #d1d5db",
                      borderRadius: "6px",
                      padding: "0 8px",
                      boxShadow: "none",
                      "&:hover": {
                        borderColor: "#d1d5db",
                      },
                    }),
                    valueContainer: (base) => ({
                      ...base,
                      padding: "0",
                    }),
                    input: (base) => ({
                      ...base,
                      margin: "0",
                      padding: "0",
                    }),
                    indicatorsContainer: (base) => ({
                      ...base,
                      height: "41px",
                    }),
                    dropdownIndicator: (base) => ({
                      ...base,
                      padding: "0 4px",
                    }),
                }}
              />
              {member.role === "Owner" && (
                <p className="text-xs text-gray-500 mt-1">Use &quot;Transfer Ownership&quot; to change owner role</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Access</label>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="access-enabled"
                  checked={isAccessEnabled}
                  onChange={(e) => setIsAccessEnabled(e.target.checked)}
                  className="h-4 w-4 text-black focus:ring-black border-gray-300 rounded"
                />
                <label htmlFor="access-enabled" className="text-sm text-gray-700">
                  Enable access to the application
                </label>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
              Cancel
            </button>
            <button
              type="submit"
              disabled={isUpdating || !hasChanges()}
              className="px-4 py-2 text-sm font-medium text-white bg-black rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isUpdating ? "Updating..." : "Update"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
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

  const nonOwnerMembers = members.filter((member) => member.role !== "Owner");

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

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-96">
        <DialogHeader>
          <DialogTitle>Transfer Ownership</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">{error}</div>
            )}

            <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-md text-sm">
              <strong>Warning:</strong> This action cannot be undone. You will lose owner privileges and the selected
              member will become the new owner.
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Select New Owner *</label>
              <Select
                value={selectedMemberId ? { value: selectedMemberId, label: nonOwnerMembers.find(m => m.id === selectedMemberId)?.email + ` (${nonOwnerMembers.find(m => m.id === selectedMemberId)?.role})` || '' } : null}
                onChange={(newValue) => {
                  const selectedOption = newValue as { value: string; label: string } | null;
                  setSelectedMemberId(selectedOption?.value || "");
                }}
                options={[
                  { value: "", label: "Choose a team member...", isDisabled: true },
                  ...nonOwnerMembers.map((member) => ({
                    value: member.id,
                    label: `${member.email} (${member.role})`
                  }))
                ]}
                placeholder="Choose a team member..."
                isClearable={false}
                isDisabled={nonOwnerMembers.length === 0}
                styles={{
                  control: (base) => ({
                    ...base,
                    minHeight: '38px',
                    height: '38px',
                    fontSize: '0.875rem',
                    borderColor: '#d1d5db',
                    '&:hover': {
                      borderColor: '#d1d5db'
                    },
                    '&:focus-within': {
                      borderColor: '#000',
                      boxShadow: '0 0 0 1px #000'
                    }
                  }),
                  valueContainer: (base) => ({
                    ...base,
                    padding: '2px 12px'
                  })
                }}
              />
              {nonOwnerMembers.length === 0 && (
                <p className="text-sm text-gray-500 mt-1">
                  No other team members available. Add members first before transferring ownership.
                </p>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
              Cancel
            </button>
            <button
              type="submit"
              disabled={isTransferring || !selectedMemberId || nonOwnerMembers.length === 0}
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors hover:bg-red-700"
            >
              {isTransferring ? "Transferring..." : "Transfer"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
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
  confirmButtonStyle = "primary",
}: ConfirmationModalProps) {
  const confirmButtonClasses =
    confirmButtonStyle === "danger"
      ? "px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 transition-colors"
      : "px-4 py-2 text-sm font-medium text-white bg-black rounded-md hover:bg-gray-800 transition-colors";

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-96">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div>
          <p className="text-sm text-gray-700">{message}</p>

          <div className="flex justify-end gap-3 mt-6">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
              {cancelText}
            </button>
            <button onClick={onConfirm} className={confirmButtonClasses}>
              {confirmText}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
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

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="w-96">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-600" />
            Delete Company
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">{error}</div>
            )}

            <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-md text-sm">
              <div className="flex">
                <AlertTriangle className="w-5 h-5 text-red-600 mr-2 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">This action cannot be undone.</p>
                  <p className="mt-1">
                    This will permanently delete the company <strong>&ldquo;{companyName}&rdquo;</strong> and all of its
                    data including transactions, accounts, and team members.
                  </p>
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
            <button type="button" onClick={handleClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
              Cancel
            </button>
            <button
              type="submit"
              disabled={isDeleting || !isDeleteTextValid}
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors hover:bg-red-700"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function SettingsPage() {
  const { user, currentCompany, updateCompany, removeCompany } = useAuthStore();
  const router = useRouter();

  // Team Members State
  const [companyMembers, setCompanyMembers] = useState<CompanyMember[]>([]);
  const [addMemberModal, setAddMemberModal] = useState(false);
  const [editMemberModal, setEditMemberModal] = useState(false);
  const [memberToEdit, setMemberToEdit] = useState<CompanyMember | null>(null);

  // Inline company editing state
  const [isEditingCompany, setIsEditingCompany] = useState(false);
  const [editCompanyName, setEditCompanyName] = useState(currentCompany?.name || "");
  const [editCompanyDescription, setEditCompanyDescription] = useState(currentCompany?.description || "");
  const [isUpdatingCompany, setIsUpdatingCompany] = useState(false);
  const [companyUpdateError, setCompanyUpdateError] = useState("");
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
  const currentUserRole = user?.role;
  const isOwner = currentUserRole === "Owner";

  console.log("currentUserRole", currentUserRole);

  // Fetch company members when component mounts or current company changes
  useEffect(() => {
    if (currentCompany) {
      fetchCompanyMembers(currentCompany.id);
      // Update edit fields when currentCompany changes
      setEditCompanyName(currentCompany.name);
      setEditCompanyDescription(currentCompany.description || "");
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
      const userIds = companyUsers.map((cu) => cu.user_id);
      const { data: users, error: usersError } = await supabase
        .from("users")
        .select("id, email, is_access_enabled, first_name, last_name")
        .in("id", userIds);

      if (usersError) throw usersError;

      // Combine the data
      const members: CompanyMember[] = (users || []).map(
        (user: { id: string; email: string; is_access_enabled: boolean; first_name?: string; last_name?: string }) => {
          const companyUser = companyUsers.find((cu) => cu.user_id === user.id);
          return {
            id: user.id,
            email: user.email,
            role: companyUser?.role as "Owner" | "Member" | "Accountant",
            is_access_enabled: user.is_access_enabled,
            first_name: user.first_name,
            last_name: user.last_name,
          };
        }
      );

      setCompanyMembers(members);
    } catch (error) {
      console.error("Error fetching company members:", error);
      setCompanyMembers([]);
    }
  };

  const handleInlineCompanyEdit = () => {
    setIsEditingCompany(true);
    setEditCompanyName(currentCompany?.name || "");
    setEditCompanyDescription(currentCompany?.description || "");
    setCompanyUpdateError("");
  };

  const handleCancelCompanyEdit = () => {
    setIsEditingCompany(false);
    setEditCompanyName(currentCompany?.name || "");
    setEditCompanyDescription(currentCompany?.description || "");
    setCompanyUpdateError("");
  };

  const handleSaveCompanyEdit = async () => {
    if (!currentCompany || !editCompanyName.trim()) return;

    setIsUpdatingCompany(true);
    setCompanyUpdateError("");

    try {
      const updatedData = { 
        name: editCompanyName.trim(), 
        description: editCompanyDescription.trim() 
      };

      // Use API endpoint for better security and validation
      const response = await api.put("/api/company/update", updatedData);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to update company");
      }

      const result = await response.json();

      // Update company in Zustand state with the response data
      updateCompany(currentCompany.id, result.company);
      setIsEditingCompany(false);
    } catch (error) {
      setCompanyUpdateError(error instanceof Error ? error.message : "Failed to update company");
    } finally {
      setIsUpdatingCompany(false);
    }
  };

  const handleAddMember = async (email: string, role: "Owner" | "Member" | "Accountant") => {
    if (!currentCompany || !user) return;

    try {
      const response = await api.post("/api/member/invite", { email, role });

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

  const handleEditMember = (member: CompanyMember) => {
    setMemberToEdit(member);
    setEditMemberModal(true);
  };

  const handleUpdateMember = async (memberId: string, updates: { role?: "Owner" | "Member" | "Accountant"; is_access_enabled?: boolean }) => {
    if (!currentCompany) return;

    try {
      const response = await api.post("/api/member/update", {
        memberId,
        ...updates
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to update member");
      }

      // Refresh team members list to show the updated member
      await fetchCompanyMembers(currentCompany.id);

      setConfirmationModal({
        isOpen: true,
        title: "Member Updated",
        message: "Team member details have been updated successfully.",
        onConfirm: () => setConfirmationModal({ ...confirmationModal, isOpen: false }),
        confirmText: "OK",
      });
    } catch (error) {
      throw error; // Re-throw to let the modal handle the error display
    }
  };

  const handleDeleteMember = async (memberId: string) => {
    const member = companyMembers.find((m) => m.id === memberId);

    setConfirmationModal({
      isOpen: true,
      title: "Remove Team Member",
      message: `Are you sure you want to remove ${member?.email || "this team member"} from the company?`,
      onConfirm: async () => {
        try {
          const response = await api.delete("/api/member/remove", {
            body: JSON.stringify({ memberId }),
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || "Failed to remove member");
          }

          // Remove the member from local state
          setCompanyMembers((prev) => prev.filter((m) => m.id !== memberId));

          // Show success message
          setConfirmationModal({
            isOpen: true,
            title: "Member Removed",
            message: `${member?.email || "Team member"} has been successfully removed from the company.`,
            onConfirm: () => setConfirmationModal({ ...confirmationModal, isOpen: false }),
            confirmText: "OK",
          });
        } catch (error) {
          console.error("Error removing member:", error);
          setConfirmationModal({
            isOpen: true,
            title: "Remove Failed",
            message: error instanceof Error ? error.message : "Failed to remove member. Please try again.",
            onConfirm: () => setConfirmationModal({ ...confirmationModal, isOpen: false }),
            confirmText: "OK",
            confirmButtonStyle: "danger",
          });
        }
      },
      confirmText: "Remove",
      confirmButtonStyle: "danger",
    });
  };

  const handleTransferOwnership = async (newOwnerId: string) => {
    if (!currentCompany || !user) return;

    try {
      const response = await api.post("/api/member/transfer-ownership", { newOwnerId });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to transfer ownership");
      }

      const result = await response.json();

      // Update local state to reflect the ownership change
      setCompanyMembers((prev) =>
        prev.map((member) => {
          if (member.id === newOwnerId) {
            return { ...member, role: "Owner" };
          }
          if (member.id === user.id) {
            return { ...member, role: "Member" };
          }
          return member;
        })
      );

      // Close the transfer modal
      setTransferOwnershipModal(false);

      // Show success message
      setConfirmationModal({
        isOpen: true,
        title: "Ownership Transferred",
        message: `Ownership has been successfully transferred to ${result.newOwner.email}. You are now a Member of this company.`,
        onConfirm: () => setConfirmationModal({ ...confirmationModal, isOpen: false }),
        confirmText: "OK",
      });
    } catch (error) {
      console.error("Error transferring ownership:", error);
      setConfirmationModal({
        isOpen: true,
        title: "Transfer Failed",
        message: error instanceof Error ? error.message : "Failed to transfer ownership. Please try again.",
        onConfirm: () => setConfirmationModal({ ...confirmationModal, isOpen: false }),
        confirmText: "OK",
        confirmButtonStyle: "danger",
      });
    }
  };

  const handleDeleteCompany = async () => {
    if (!currentCompany || !isOwner || !user) return;

    try {
      console.log("Attempting to delete company:", {
        companyId: currentCompany.id,
        companyName: currentCompany.name,
        userId: user.id,
      });

      const response = await api.delete("/api/company/delete");

      console.log("Delete response status:", response.status);

      if (!response.ok) {
        const errorData = await response.json();
        console.error("Delete failed with error:", errorData);

        // If company doesn't exist, clean up localStorage anyway
        if (response.status === 404 || errorData.error?.includes("Company does not exist")) {
          console.log("Company doesn't exist in database, cleaning up localStorage");

          // Remove the non-existent company from Zustand state
          removeCompany(currentCompany.id);
          router.push("/");
          return; // Don't throw error, treat as successful cleanup
        }

        throw new Error(errorData.error || "Failed to delete company");
      }

      const result = await response.json();
      console.log("Delete successful:", result);

      // Remove the deleted company from Zustand state
      removeCompany(currentCompany.id);
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
            {!isEditingCompany ? (
              <button
                onClick={handleInlineCompanyEdit}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                Edit
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={handleCancelCompanyEdit}
                  className="text-sm text-gray-400 hover:text-gray-600"
                  disabled={isUpdatingCompany}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveCompanyEdit}
                  disabled={isUpdatingCompany || !editCompanyName.trim()}
                  className="text-sm text-blue-600 hover:text-blue-800 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isUpdatingCompany ? "Saving..." : "Save"}
                </button>
              </div>
            )}
          </div>

          {companyUpdateError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-md text-sm mb-4">
              {companyUpdateError}
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700">Company Name</label>
              {!isEditingCompany ? (
                <p className="text-sm text-gray-900 mt-1">{currentCompany.name}</p>
              ) : (
                <input
                  type="text"
                  value={editCompanyName}
                  onChange={(e) => setEditCompanyName(e.target.value)}
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:border-black focus:outline-none focus:ring-black"
                  placeholder="Enter company name"
                  disabled={isUpdatingCompany}
                />
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Description</label>
              {!isEditingCompany ? (
                currentCompany.description ? (
                  <p className="text-sm text-gray-900 mt-1">{currentCompany.description}</p>
                ) : (
                  <p className="text-sm text-gray-500 mt-1">No description</p>
                )
              ) : (
                <textarea
                  value={editCompanyDescription}
                  onChange={(e) => setEditCompanyDescription(e.target.value)}
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:border-black focus:outline-none focus:ring-black"
                  placeholder="Enter description (optional)"
                  rows={3}
                  disabled={isUpdatingCompany}
                />
              )}
            </div>
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
                    Name
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
                      {member.id === user.id && <span className="ml-2 text-xs text-blue-600">(You)</span>}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {member.first_name || member.last_name 
                        ? `${member.first_name || ''} ${member.last_name || ''}`.trim()
                        : <span className="text-gray-500">-</span>
                      }
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{member.role}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          member.is_access_enabled ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                        }`}
                      >
                        {member.is_access_enabled ? "Enabled" : "Disabled"}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {member.id !== user.id && (
                        <>
                          {(isOwner || member.role !== "Owner") && (
                            <>
                              <button 
                                onClick={() => handleEditMember(member)}
                                className="text-blue-600 hover:text-blue-800 mr-3"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDeleteMember(member.id)}
                                className="text-red-600 hover:text-red-800"
                              >
                                Remove
                              </button>
                            </>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
                {companyMembers.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-4 text-center text-sm text-gray-500">
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
                  <button className="text-sm text-blue-600 hover:text-blue-800">Update</button>
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

      {/* Add Member Modal */}
      <AddMemberModal isOpen={addMemberModal} onClose={() => setAddMemberModal(false)} onAddMember={handleAddMember} />

      {/* Edit Member Modal */}
      <EditMemberModal 
        isOpen={editMemberModal} 
        onClose={() => {
          setEditMemberModal(false);
          setMemberToEdit(null);
        }} 
        member={memberToEdit}
        onUpdateMember={handleUpdateMember} 
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
