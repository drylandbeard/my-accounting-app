"use client";

import { useAuthStore } from "@/zustand/authStore";
import { api } from "@/lib/api";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import NavBar from "@/components/NavBar";
import { showSuccessToast, showErrorToast } from "@/components/ui/toast";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2 } from "lucide-react";

interface CompanyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateCompany: (name: string, description?: string) => Promise<void>;
}

interface TeamMember {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  is_access_enabled: boolean;
  userId?: string; // The actual user_id for API calls
}

interface TeamMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddTeamMember: (firstName: string, lastName: string, email: string) => Promise<void>;
}

interface ManageMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  member: TeamMember | null;
  onMemberChanged: () => void;
}

interface CompanyAccess {
  company: {
    id: string;
    name: string;
    description?: string;
  };
  hasAccess: boolean;
  accountantRole: string;
}

function CompanyModal({ isOpen, onClose, onCreateCompany }: CompanyModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsCreating(true);

    try {
      await onCreateCompany(name.trim(), description.trim());
      setName("");
      setDescription("");
      showSuccessToast("Company created successfully!");
      onClose();
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : "Failed to create company");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-80 max-w-80">
        <DialogHeader>
          <DialogTitle>Add New Company</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit}>
          <div className="space-y-3">
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
      </DialogContent>
    </Dialog>
  );
}

function TeamMemberModal({ isOpen, onClose, onAddTeamMember }: TeamMemberModalProps) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim() || !email.trim()) return;

    setIsAdding(true);

    try {
      await onAddTeamMember(firstName.trim(), lastName.trim(), email.trim());
      setFirstName("");
      setLastName("");
      setEmail("");
      showSuccessToast("Team member invited successfully!");
      onClose();
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : "Failed to add team member");
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-80 max-w-80">
        <DialogHeader>
          <DialogTitle>Add Team Member</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="px-4 py-4">
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                First Name *
              </label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full px-2 py-1 border border-gray-300 rounded-md text-gray-900 placeholder-gray-500 focus:border-black focus:outline-none focus:ring-black text-sm"
                placeholder="Enter first name"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Last Name *
              </label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full px-2 py-1 border border-gray-300 rounded-md text-gray-900 placeholder-gray-500 focus:border-black focus:outline-none focus:ring-black text-sm"
                placeholder="Enter last name"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Email Address *
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-2 py-1 border border-gray-300 rounded-md text-gray-900 placeholder-gray-500 focus:border-black focus:outline-none focus:ring-black text-sm"
                placeholder="Enter email address"
                required
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
              disabled={isAdding || !firstName.trim() || !lastName.trim() || !email.trim()}
              className="px-3 py-1 text-sm font-medium text-white bg-black rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isAdding ? "Adding..." : "Add"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ManageMemberModal({ isOpen, onClose, member, onMemberChanged }: ManageMemberModalProps) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [companyAccess, setCompanyAccess] = useState<CompanyAccess[]>([]);
  const [memberUserId, setMemberUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const fetchMemberData = useCallback(async () => {
    if (!member?.id) return;

    setIsLoading(true);
    setMemberUserId(null);

    try {
      const response = await api.get(`/api/accountant/member-company-access/${member.id}`);
      
      if (response.ok) {
        const data = await response.json();
        setMemberUserId(data.teamMember?.userId || null);
        
        // Transform available companies into CompanyAccess format
        const companyAccessList: CompanyAccess[] = data.availableCompanies?.map((comp: {
          company: { id: string; name: string; description?: string };
          hasAccess: boolean;
          accountantRole: string;
        }) => ({
          company: comp.company,
          hasAccess: comp.hasAccess,
          accountantRole: comp.accountantRole
        })) || [];
        
        setCompanyAccess(companyAccessList);
      } else {
        const errorData = await response.json();
        showErrorToast(errorData.error || "Failed to fetch member data");
      }
    } catch (error) {
      console.error("Error fetching member data:", error);
      showErrorToast("Failed to fetch member data");
    } finally {
      setIsLoading(false);
    }
  }, [member?.id]);

  // Initialize form when modal opens
  useEffect(() => {
    if (isOpen && member) {
      setFirstName(member.firstName);
      setLastName(member.lastName);
      setEmail(member.email);
      fetchMemberData();
    }
  }, [isOpen, member, fetchMemberData]);

  const handleToggleAccess = (companyId: string) => {
    setCompanyAccess(prev => 
      prev.map(comp => 
        comp.company.id === companyId 
          ? { ...comp, hasAccess: !comp.hasAccess }
          : comp
      )
    );
  };

  const handleSave = async () => {
    if (!member?.id || !memberUserId) return;

    setIsSaving(true);

    try {
      // Create the payload for the combined save operation
      const payload = {
        memberId: member.id,
        memberUserId: memberUserId,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        companyAccess: companyAccess.map(comp => ({
          companyId: comp.company.id,
          hasAccess: comp.hasAccess
        }))
      };

      const response = await api.post("/api/accountant/save-member", payload);

      if (response.ok) {
        showSuccessToast("Member saved successfully!");
        onMemberChanged(); // Notify parent to refresh team list
        onClose(); // Close modal
      } else {
        const errorData = await response.json();
        showErrorToast(errorData.error || "Failed to save member");
      }
    } catch (error) {
      console.error("Error saving member:", error);
      showErrorToast("Failed to save member");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveMember = async () => {
    if (!member?.id) return;

    // Use toast for confirmation - we can use a promise-based approach
    toast.promise(
      new Promise<void>((resolve, reject) => {
        const confirmRemove = confirm(`Are you sure you want to remove ${member.firstName} ${member.lastName} from your team? This action cannot be undone.`);
        if (!confirmRemove) {
          reject(new Error("Cancelled"));
          return;
        }

        setIsSaving(true);
        
        api.delete("/api/accountant/remove-member", {
          body: JSON.stringify({ memberId: member.id }),
        })
          .then(async (response) => {
            if (response.ok) {
              onMemberChanged(); // Notify parent to refresh team list
              onClose(); // Close modal
              resolve();
            } else {
              const errorData = await response.json();
              reject(new Error(errorData.error || "Failed to remove member"));
            }
          })
          .catch((error) => {
            console.error("Error removing member:", error);
            reject(new Error("Failed to remove member"));
          })
          .finally(() => {
            setIsSaving(false);
          });
      }),
      {
        loading: 'Removing member...',
        success: `${member.firstName} ${member.lastName} has been removed from your team`,
        error: (err) => err.message === "Cancelled" ? "" : err.message || "Failed to remove member",
      }
    );
  };

  if (!member) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-full max-w-2xl max-h-[80vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>Manage Member</DialogTitle>
        </DialogHeader>
        
        <div className="p-6 overflow-y-auto max-h-[calc(80vh-180px)]">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 relative">
                <div className="w-6 h-6 border-2 border-gray-200 rounded-full"></div>
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
              <span className="ml-2 text-gray-600">Loading member data...</span>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Member Details */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    First Name
                  </label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:border-black focus:outline-none focus:ring-black text-sm"
                    disabled={!memberUserId}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Last Name
                  </label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:border-black focus:outline-none focus:ring-black text-sm"
                    disabled={!memberUserId}
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:border-black focus:outline-none focus:ring-black text-sm"
                  disabled={!memberUserId}
                />
              </div>

              {!memberUserId ? (
                <div className="text-center py-4 bg-yellow-50 border border-yellow-200 rounded-md">
                  <p className="text-yellow-800 text-sm">
                    {member.firstName} {member.lastName} hasn&apos;t accepted their team invitation yet.
                    <br />
                    Company access and details can be managed once they complete their account setup.
                  </p>
                </div>
              ) : (
                <>
                  {/* Company Access Table */}
                  <div>
                    <h3 className="text-md font-medium text-gray-900 mb-3">
                      Company Access
                    </h3>
                    {companyAccess.length > 0 ? (
                      <div className="border border-gray-200 rounded-md overflow-hidden">
                        <table className="w-full">
                          <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                                Company
                              </th>
                              <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase tracking-wider">
                                Access
                              </th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {companyAccess.map((comp) => (
                              <tr key={comp.company.id} className="hover:bg-gray-50">
                                <td className="px-4 py-3">
                                  <div>
                                    <p className="font-medium text-gray-900">{comp.company.name}</p>
                                    {comp.company.description && (
                                      <p className="text-sm text-gray-500">{comp.company.description}</p>
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <button
                                    onClick={() => handleToggleAccess(comp.company.id)}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                      comp.hasAccess ? 'bg-blue-600' : 'bg-gray-300'
                                    }`}
                                  >
                                    <span
                                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                        comp.hasAccess ? 'translate-x-6' : 'translate-x-1'
                                      }`}
                                    />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-gray-500 text-sm italic">No companies available.</p>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-between items-center px-6 py-4 border-t border-gray-200">
          <div>
            {memberUserId && (
              <button
                onClick={handleRemoveMember}
                disabled={isSaving}
                className="px-4 py-2 text-sm text-red-600 hover:text-red-800 border border-red-300 rounded hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Remove Member
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || !memberUserId || !firstName.trim() || !lastName.trim() || !email.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-black rounded-md hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSaving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function GatewayPage() {
  const { user, companies } = useAuthStore();
  const [isCompanyModalOpen, setIsCompanyModalOpen] = useState(false);
  const [showAccountSection, setShowAccountSection] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isTeamMemberModalOpen, setIsTeamMemberModalOpen] = useState(false);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [teamSearchQuery, setTeamSearchQuery] = useState("");
  const [isManageMemberModalOpen, setIsManageMemberModalOpen] = useState(false);
  const [selectedTeamMember, setSelectedTeamMember] = useState<TeamMember | null>(null);

  const router = useRouter();
  
  // Profile form states
  const [emailForm, setEmailForm] = useState({
    email: user?.email || "",
    isUpdating: false
  });
  const [nameForm, setNameForm] = useState({
    firstName: user?.first_name || "",
    lastName: user?.last_name || "",
    isUpdating: false
  });
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
    isUpdating: false
  });

  const handleCreateCompany = async (name: string, description?: string) => {
    if (!user) throw new Error("User not found");

    // Use the authenticated API to create company
    const response = await api.post("/api/company/create", { name, description });

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
        currentCompany: result.company  // Set the newly created company as current
      }));
    }
  };

  const handleUpdateProfile = async () => {
    if (!user || !isEditingProfile) return;

    // Check if email changed
    const emailChanged = emailForm.email !== user.email;
    
    // Check if name changed
    const nameChanged = nameForm.firstName !== (user.first_name || "") || nameForm.lastName !== (user.last_name || "");
    
    // Check if password fields are filled
    const passwordChanged = passwordForm.currentPassword || passwordForm.newPassword || passwordForm.confirmPassword;

    if (!emailChanged && !nameChanged && !passwordChanged) {
      return; // No changes to save
    }

    // Validate password if being changed
    if (passwordChanged) {
      if (!passwordForm.currentPassword) {
        showErrorToast("Current password is required");
        return;
      }
      if (!passwordForm.newPassword) {
        showErrorToast("New password is required");
        return;
      }
      if (passwordForm.newPassword !== passwordForm.confirmPassword) {
        showErrorToast("New passwords do not match");
        return;
      }
      if (passwordForm.newPassword.length < 6) {
        showErrorToast("Password must be at least 6 characters long");
        return;
      }
    }

    // Set updating state
    if (emailChanged) setEmailForm(prev => ({ ...prev, isUpdating: true }));
    if (nameChanged) setNameForm(prev => ({ ...prev, isUpdating: true }));
    if (passwordChanged) setPasswordForm(prev => ({ ...prev, isUpdating: true }));

    try {
      // Update name if changed
      if (nameChanged) {
        const nameResult = await api.post("/api/user/update-profile", { 
          first_name: nameForm.firstName,
          last_name: nameForm.lastName
        });
        if (!nameResult.ok) {
          showErrorToast("Failed to update name");
          setNameForm(prev => ({ ...prev, isUpdating: false }));
          if (emailChanged) setEmailForm(prev => ({ ...prev, isUpdating: false }));
          if (passwordChanged) setPasswordForm(prev => ({ ...prev, isUpdating: false }));
          return;
        }
      }

      // Update email if changed
      if (emailChanged) {
        const emailResult = await api.post("/api/user/update-email", { email: emailForm.email });
        if (!emailResult.ok) {
          showErrorToast("Failed to update email");
          setEmailForm(prev => ({ ...prev, isUpdating: false }));
          if (nameChanged) setNameForm(prev => ({ ...prev, isUpdating: false }));
          if (passwordChanged) setPasswordForm(prev => ({ ...prev, isUpdating: false }));
          return;
        }
      }

      // Update password if changed
      if (passwordChanged) {
        const passwordResult = await api.post("/api/user/update-password", {
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        });
        if (!passwordResult.ok) {
          showErrorToast("Failed to update password");
          setPasswordForm(prev => ({ ...prev, isUpdating: false }));
          if (emailChanged) setEmailForm(prev => ({ ...prev, isUpdating: false }));
          if (nameChanged) setNameForm(prev => ({ ...prev, isUpdating: false }));
          return;
        }
      }

      // Success - reset form and exit edit mode
      if (emailChanged || nameChanged || passwordChanged) {
        // Update user in auth store if name changed
        if (nameChanged) {
          useAuthStore.setState(state => ({
            ...state,
            user: state.user ? {
              ...state.user,
              first_name: nameForm.firstName,
              last_name: nameForm.lastName
            } : null
          }));
        }
        
        showSuccessToast("Profile updated successfully!");
        setEmailForm(prev => ({ ...prev, isUpdating: false }));
        setNameForm(prev => ({ ...prev, isUpdating: false }));
        setPasswordForm({
          currentPassword: "",
          newPassword: "",
          confirmPassword: "",
          isUpdating: false
        });
        setIsEditingProfile(false);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to update profile";
      showErrorToast(errorMessage);
      setEmailForm(prev => ({ ...prev, isUpdating: false }));
      setNameForm(prev => ({ ...prev, isUpdating: false }));
      setPasswordForm(prev => ({ ...prev, isUpdating: false }));
    }
  };

  const handleAccountClick = () => {
    setShowAccountSection(!showAccountSection);
    // Reset form when showing account section
    if (!showAccountSection && user) {
      setEmailForm({
        email: user.email,
        isUpdating: false
      });
      setNameForm({
        firstName: user.first_name || "",
        lastName: user.last_name || "",
        isUpdating: false
      });
      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
        isUpdating: false
      });
      setIsEditingProfile(false);
    }
  };

  const handleCompanySelect = (company: { id: string; name: string; description?: string }) => {
    // Set the selected company in global state
    useAuthStore.getState().setCurrentCompany(company);
    console.log("Selected company:", company);
    router.push('/transactions');
  };

  const handleAddTeamMember = async (firstName: string, lastName: string, email: string) => {
    if (!user) throw new Error("User not found");

    // Use the authenticated API to invite team member
    const response = await api.post("/api/accountant/invite-member", { firstName, lastName, email });

    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(result.error || "Failed to invite team member");
    }

    // Refresh team members list
    await fetchTeamMembers();
  };



  const fetchTeamMembers = useCallback(async () => {
    if (!user || user.role !== "Accountant") return;

    try {
      const response = await api.get("/api/accountant/team-members");
      if (response.ok) {
        const data = await response.json();
        setTeamMembers(data.teamMembers || []);
      }
    } catch (error) {
      console.error("Error fetching team members:", error);
    }
  }, [user]);

  const handleManageMember = (member: TeamMember) => {
    setSelectedTeamMember(member);
    setIsManageMemberModalOpen(true);
  };

  const handleCloseManageMember = () => {
    setIsManageMemberModalOpen(false);
    setSelectedTeamMember(null);
  };

  const handleMemberChanged = () => {
    // Refresh team members list
    fetchTeamMembers();
  };

  // Fetch team members when component mounts for Accountants
  useEffect(() => {
    if (user && user.role === "Accountant") {
      fetchTeamMembers();
    }
  }, [user, fetchTeamMembers]);

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
            <div className="mb-8 p-6 bg-gray-50 border border-gray-200 rounded-lg w-lg">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Account Details</h3>
              
              <div className="space-y-4 text-left">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    First Name
                  </label>
                  <input
                    type="text"
                    value={nameForm.firstName}
                    onChange={(e) => setNameForm(prev => ({ ...prev, firstName: e.target.value }))}
                    disabled={!isEditingProfile}
                    className={`w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:border-black focus:outline-none focus:ring-black ${
                      !isEditingProfile ? "bg-gray-50 text-gray-500" : ""
                    }`}
                    placeholder="Enter first name"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Last Name
                  </label>
                  <input
                    type="text"
                    value={nameForm.lastName}
                    onChange={(e) => setNameForm(prev => ({ ...prev, lastName: e.target.value }))}
                    disabled={!isEditingProfile}
                    className={`w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:border-black focus:outline-none focus:ring-black ${
                      !isEditingProfile ? "bg-gray-50 text-gray-500" : ""
                    }`}
                    placeholder="Enter last name"
                  />
                </div>
                
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
                        setEmailForm(prev => ({ ...prev, email: user.email }));
                        setNameForm({
                          firstName: user.first_name || "",
                          lastName: user.last_name || "",
                          isUpdating: false
                        });
                        setPasswordForm({
                          currentPassword: "",
                          newPassword: "",
                          confirmPassword: "",
                          isUpdating: false
                        });
                      }}
                      className="flex-1 px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleUpdateProfile}
                      disabled={emailForm.isUpdating || nameForm.isUpdating || passwordForm.isUpdating}
                      className="flex-1 px-4 py-2 text-sm font-medium text-white bg-black rounded-md hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {emailForm.isUpdating || nameForm.isUpdating || passwordForm.isUpdating ? "Saving..." : "Save"}
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
                <div className="space-y-4 w-2xl mx-auto">
                  {/* Add Company Button */}
                  {companies.some((userCompany) => userCompany.access_type !== "granted") && (
                    <div className="flex justify-start">
                      <button
                        onClick={() => setIsCompanyModalOpen(true)}
                        className="flex items-center gap-2 px-2 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 transition-colors hover:cursor-pointer"
                      >
                        Add Company
                      </button>
                    </div>
                  )}

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
                          {/* Only show Role column if at least one company is not access_type granted */}
                          {companies.some((userCompany) => userCompany.access_type !== "granted") && (
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                              Role
                            </th>
                          )}
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
                              <div className="flex items-center gap-2">
                                {userCompany.companies.name}
                                {userCompany.access_type === "granted" && (
                                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                                    via {userCompany.granted_by_accountant}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-left text-sm text-gray-600">
                              {userCompany.companies.description || "-"}
                            </td>
                            {/* Only show Role cell if at least one company is not access_type granted */}
                            {companies.some((uc) => uc.access_type !== "granted") && (
                              <td className="px-4 py-3 text-left text-sm text-gray-600">
                                {userCompany.access_type !== "granted" ? userCompany.role : ""}
                              </td>
                            )}
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
                    Create
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Team Section for Accountants */}
          {user && user.role === "Accountant" && !showAccountSection && (
            <div className="mt-20">
              <div className="space-y-4 w-2xl mx-auto">
                {/* Team Header */}
                <div className="flex justify-between items-center">
                  <button
                    onClick={() => setIsTeamMemberModalOpen(true)}
                    className="flex items-center gap-2 px-2 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 transition-colors hover:cursor-pointer"
                  >
                    Add Team Member
                  </button>
                </div>

                {/* Team Search Bar */}
                <div className="w-full">
                  <input
                    type="text"
                    placeholder="Search team members..."
                    value={teamSearchQuery}
                    onChange={(e) => setTeamSearchQuery(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 placeholder-gray-500 focus:border-gray-900 focus:outline-none focus:ring-gray-900 text-sm"
                  />
                </div>

                {/* Team Members Table */}
                <div className="border border-gray-300 rounded-md overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-300">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                          Email
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                          Name
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {teamMembers
                        .filter((member) => 
                          member.email.toLowerCase().includes(teamSearchQuery.toLowerCase()) ||
                          member.firstName.toLowerCase().includes(teamSearchQuery.toLowerCase()) ||
                          member.lastName.toLowerCase().includes(teamSearchQuery.toLowerCase())
                        )
                        .map((member) => (
                        <tr key={member.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-left text-sm font-medium text-gray-900">
                            {member.email}
                          </td>
                          <td className="px-4 py-3 text-left text-sm text-gray-600">
                            {member.firstName} {member.lastName}
                          </td>
                          <td className="px-4 py-3 text-left text-sm text-gray-600">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                              member.is_access_enabled 
                                ? "bg-green-100 text-green-800" 
                                : "bg-yellow-100 text-yellow-800"
                            }`}>
                              {member.is_access_enabled ? "Active" : "Pending"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center gap-2 justify-end">
                              <button
                                onClick={() => handleManageMember(member)}
                                className="text-sm text-blue-600 hover:text-blue-800 transition-colors"
                              >
                                Manage
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {teamMembers
                        .filter((member) => 
                          member.email.toLowerCase().includes(teamSearchQuery.toLowerCase()) ||
                          member.firstName.toLowerCase().includes(teamSearchQuery.toLowerCase()) ||
                          member.lastName.toLowerCase().includes(teamSearchQuery.toLowerCase())
                        )
                        .length === 0 && teamSearchQuery && (
                        <tr>
                          <td colSpan={4} className="px-4 py-3 text-center text-sm text-gray-500">
                            No team members found matching &quot;{teamSearchQuery}&quot;
                          </td>
                        </tr>
                      )}
                      {teamMembers.length === 0 && !teamSearchQuery && (
                        <tr>
                          <td colSpan={4} className="px-4 py-3 text-center text-sm text-gray-500">
                            No team members yet. Add your first team member to get started.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Company Modal */}
        <CompanyModal
          isOpen={isCompanyModalOpen}
          onClose={() => setIsCompanyModalOpen(false)}
          onCreateCompany={handleCreateCompany}
        />

        {/* Team Member Modal */}
        <TeamMemberModal
          isOpen={isTeamMemberModalOpen}
          onClose={() => setIsTeamMemberModalOpen(false)}
          onAddTeamMember={handleAddTeamMember}
        />

        {/* Manage Member Modal */}
        <ManageMemberModal
          isOpen={isManageMemberModalOpen}
          onClose={handleCloseManageMember}
          member={selectedTeamMember}
          onMemberChanged={handleMemberChanged}
        />
        
        {/* Toast notifications */}
        <Toaster />
      </main>
    </>
  );
}