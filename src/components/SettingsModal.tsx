"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "./AuthContext";
import { X } from "lucide-react";
import { updateUserEmail, updateUserPassword, updateUserRole } from "@/lib/auth";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { user, setUser } = useAuth();
  
  const [email, setEmail] = useState(user?.email || "");
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
      // Update email if changed
      if (email !== user.email) {
        const emailResult = await updateUserEmail(user.id, email);
        if (emailResult.error) {
          throw new Error(emailResult.error);
        }
      }

      // Update role if changed
      if (role !== user.role) {
        const roleResult = await updateUserRole(user.id, role as "Owner" | "Member" | "Accountant");
        if (roleResult.error) {
          throw new Error(roleResult.error);
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

        const passwordResult = await updateUserPassword(user.id, currentPassword, newPassword);
        if (passwordResult.error) {
          throw new Error(passwordResult.error);
        }
      }

      // Update user context
      setUser({
        ...user,
        email,
        role: role as "Owner" | "Member" | "Accountant"
      });

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
           role !== user?.role || 
           newPassword.length > 0;
  };

  if (!isOpen || !user) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-80 mx-4">
        <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-900">Account Settings</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        
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
            className="px-3 py-1 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
} 