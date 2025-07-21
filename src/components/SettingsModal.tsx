"use client";

import React, { useState, useEffect } from "react";
import { useAuthStore } from "@/zustand/authStore";
import { api } from "@/lib/api";
import { Dialog, DialogContent, DialogHeader } from "./ui/dialog";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { user } = useAuthStore();
  
  const [email, setEmail] = useState(user?.email || "");
  const [firstName, setFirstName] = useState(user?.first_name || "");
  const [lastName, setLastName] = useState(user?.last_name || "");
  const [role, setRole] = useState<"Owner" | "Member" | "Accountant">(user?.role || "Owner");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Reset form when modal opens or user changes
  useEffect(() => {
    if (isOpen && user) {
      setEmail(user.email);
      setFirstName(user.first_name || "");
      setLastName(user.last_name || "");
      setRole(user.role);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setError("");
      setSuccess("");
    }
  }, [isOpen, user]);

  const handleSave = async () => {
    if (!user) return;
    
    setIsLoading(true);
    setError("");
    setSuccess("");

    try {
      // Update first name if changed
      if (firstName !== (user.first_name || "")) {
        const firstNameResponse = await api.post("/api/user/update-profile", { 
          first_name: firstName 
        });
        
        if (!firstNameResponse.ok) {
          const errorData = await firstNameResponse.json();
          throw new Error(errorData.error || "Failed to update first name");
        }
      }

      // Update last name if changed
      if (lastName !== (user.last_name || "")) {
        const lastNameResponse = await api.post("/api/user/update-profile", { 
          last_name: lastName 
        });
        
        if (!lastNameResponse.ok) {
          const errorData = await lastNameResponse.json();
          throw new Error(errorData.error || "Failed to update last name");
        }
      }

      // Update email if changed
      if (email !== user.email) {
        const emailResponse = await api.post("/api/user/update-email", { email });
        
        if (!emailResponse.ok) {
          const errorData = await emailResponse.json();
          throw new Error(errorData.error || "Failed to update email");
        }
      }

      // Update role if changed
      if (role !== user.role) {
        const roleResponse = await api.post("/api/user/update-role", { role });
        
        if (!roleResponse.ok) {
          const errorData = await roleResponse.json();
          throw new Error(errorData.error || "Failed to update role");
        }
      }

      // Update password if provided
      if (newPassword) {
        if (newPassword !== confirmPassword) {
          throw new Error("New passwords do not match");
        }
        if (newPassword.length < 6) {
          throw new Error("Password must be at least 6 characters long");
        }
        if (!currentPassword) {
          throw new Error("Current password is required to change password");
        }

        const passwordResponse = await api.post("/api/user/update-password", {
          currentPassword,
          newPassword,
        });
        
        if (!passwordResponse.ok) {
          const errorData = await passwordResponse.json();
          throw new Error(errorData.error || "Failed to update password");
        }
      }

      // Update user in Zustand state
      useAuthStore.setState(state => ({
        ...state,
        user: user ? {
          ...user,
          email,
          first_name: firstName,
          last_name: lastName,
          role: role as "Owner" | "Member" | "Accountant"
        } : null
      }));

      setSuccess("Settings updated successfully!");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      
      setTimeout(() => {
        onClose();
        setSuccess("");
      }, 1500);

    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update settings");
    } finally {
      setIsLoading(false);
    }
  };

  const hasChanges = () => {
    return email !== user?.email || 
           firstName !== (user?.first_name || "") ||
           lastName !== (user?.last_name || "") ||
           role !== user?.role || 
           newPassword.length > 0;
  };

  if (!isOpen || !user) {
    return null;
  }

  return (
    <Dialog onOpenChange={onClose} open={isOpen}>
      <DialogContent className="min-w-80">
        <DialogHeader className="flex justify-between items-center px-4 py-3 border-b border-gray-200">
          <DialogHeader>Account Settings</DialogHeader>
        </DialogHeader>
        
        <div className="px-4 py-4 space-y-3">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-md text-sm">
              {error}
            </div>
          )}
          
          {success && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-3 py-2 rounded-md text-sm">
              {success}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              First Name
            </label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="w-full px-2 py-1 border border-gray-300 rounded-md text-sm focus:border-black focus:outline-none focus:ring-black"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Last Name
            </label>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="w-full px-2 py-1 border border-gray-300 rounded-md text-sm focus:border-black focus:outline-none focus:ring-black"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-2 py-1 border border-gray-300 rounded-md text-sm focus:border-black focus:outline-none focus:ring-black"
            />
          </div>
          
          <div className="mt-4">
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Role
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "Owner" | "Member" | "Accountant")}
              className="w-full px-2 py-1 border border-gray-300 rounded-md text-sm focus:border-black focus:outline-none focus:ring-black"
            >
              <option value="Owner">Owner</option>
              <option value="Member">Member</option>
              <option value="Accountant">Accountant</option>
            </select>
          </div>
          
          <div className="mt-4">
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Change Password
            </label>
            <div className="space-y-2">
              <input
                type="password"
                placeholder="Current password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full px-2 py-1 border border-gray-300 rounded-md text-sm focus:border-black focus:outline-none focus:ring-black"
              />
              <input
                type="password"
                placeholder="New password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-2 py-1 border border-gray-300 rounded-md text-sm focus:border-black focus:outline-none focus:ring-black"
              />
              <input
                type="password"
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-2 py-1 border border-gray-300 rounded-md text-sm focus:border-black focus:outline-none focus:ring-black"
              />
            </div>
          </div>
        </div>
        
        <div className="px-4 py-3 border-t border-gray-200 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isLoading || !hasChanges()}
            className="px-3 py-1 text-sm font-medium text-white bg-black rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? "Saving..." : "Save"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
} 