"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { CheckCircleIcon, XCircleIcon, EnvelopeIcon } from "@heroicons/react/24/outline";
import { useAuth } from "@/components/AuthContext";
import { getUserCompanies } from "@/lib/auth-client";

interface InvitationData {
  email: string;
  role: string;
  companyId: string;
  token: string;
}

export default function AcceptInvitationPage() {
  const [status, setStatus] = useState<"loading" | "setup" | "success" | "error">("loading");
  const [message, setMessage] = useState("");
  const [invitation, setInvitation] = useState<InvitationData | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  
  const searchParams = useSearchParams();
  const router = useRouter();
  const { setUser: setAuthUser, setCompanies } = useAuth();

  const token = searchParams.get("token");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("Invalid invitation link. The token is missing.");
      return;
    }

    validateInvitation(token);
  }, [token]);

  const validateInvitation = async (invitationToken: string) => {
    try {
      const response = await fetch(`/api/accept-invitation?token=${invitationToken}`);
      const data = await response.json();

      if (response.ok) {
        setStatus("setup");
        setInvitation(data.invitation);
      } else {
        setStatus("error");
        setMessage(data.error || "Failed to validate invitation.");
      }
    } catch (error) {
      console.error("Invitation validation error:", error);
      setStatus("error");
      setMessage("An unexpected error occurred. Please try again.");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invitation) return;

    setError("");

    if (!password || !confirmPassword) {
      setError("Both password fields are required");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters long");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/complete-invitation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          token: invitation.token, 
          password 
        }),
      });

      const data = await response.json();

      if (response.ok) {
        // Automatically sign in the user
        const user = data.user;
        setAuthUser(user);

        // Get user's companies
        const companiesResult = await getUserCompanies(user.id);
        
        if (companiesResult.companies) {
          const transformedCompanies = companiesResult.companies.map((item: {
            company_id: string;
            role: string;
            companies: { id: string; name: string; description?: string } | { id: string; name: string; description?: string }[];
          }) => ({
            company_id: item.company_id,
            role: item.role as "Owner" | "Member" | "Accountant",
            companies: Array.isArray(item.companies) ? item.companies[0] : item.companies
          }));

          setCompanies(transformedCompanies);
          
          // No company selected by default - user will choose on homepage
        }

        setStatus("success");
        
        // Redirect to homepage after a brief delay
        setTimeout(() => {
          router.push("/");
        }, 2000);
      } else {
        setError(data.error || "Failed to complete signup");
      }
    } catch (error) {
      console.error("Complete invitation error:", error);
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderIcon = () => {
    switch (status) {
      case "success":
        return <CheckCircleIcon className="w-8 h-8 text-green-500" />;
      case "error":
        return <XCircleIcon className="w-8 h-8 text-red-500" />;
      case "setup":
        return <EnvelopeIcon className="w-8 h-8 text-blue-500" />;
      case "loading":
      default:
        return (
          <div className="w-8 h-8 relative">
            <div className="w-8 h-8 border-2 border-gray-200 rounded-full"></div>
            <div className="w-8 h-8 border-2 border-black border-t-transparent rounded-full animate-spin absolute top-0 left-0"></div>
          </div>
        );
    }
  };

  const renderContent = () => {
    switch (status) {
      case "loading":
        return (
          <div className="text-center">
            <h2 className="text-xl font-bold text-gray-900 mb-3">Validating invitation...</h2>
            <p className="text-sm text-gray-600">Please wait while we validate your invitation.</p>
          </div>
        );

      case "setup":
        return (
          <div className="text-center">
            <h2 className="text-xl font-bold text-gray-900 mb-3">Complete Your Account</h2>
                         <p className="text-sm text-gray-600 mb-6">
               You&apos;ve been invited to join as a <span className="font-semibold">{invitation?.role}</span>. 
               Please set your password to complete your account setup.
             </p>

            <form onSubmit={handleSubmit} className="space-y-4 text-left">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  value={invitation?.email || ""}
                  disabled
                  className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Password *
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 placeholder-gray-500 focus:border-black focus:outline-none focus:ring-black"
                  placeholder="Enter your password"
                  required
                  minLength={6}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Confirm Password *
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 placeholder-gray-500 focus:border-black focus:outline-none focus:ring-black"
                  placeholder="Confirm your password"
                  required
                  minLength={6}
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-black hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-md transition-colors text-sm"
              >
                {isSubmitting ? "Setting up your account..." : "Complete Account Setup"}
              </button>
            </form>
          </div>
        );

      case "success":
        return (
          <div className="text-center">
            <h2 className="text-xl font-bold text-green-900 mb-3">Welcome to SWITCH!</h2>
                         <p className="text-sm text-green-700 mb-4">
               Your account has been set up successfully. You&apos;re being redirected to your dashboard...
             </p>
            <div className="flex justify-center">
              <div className="w-6 h-6 relative">
                <div className="w-6 h-6 border-2 border-green-100 rounded-full"></div>
                <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin absolute top-0 left-0"></div>
              </div>
            </div>
          </div>
        );

      case "error":
      default:
        return (
          <div className="text-center">
            <h2 className="text-xl font-bold text-red-900 mb-3">Invalid Invitation</h2>
            <p className="text-sm text-red-700 mb-4">{message}</p>
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                The invitation link may be expired, invalid, or already used. Please contact the person who invited you for a new invitation.
              </p>
              <button
                onClick={() => router.push("/")}
                className="bg-gray-600 hover:bg-gray-700 text-white font-medium py-2 px-4 rounded-md transition-colors text-sm"
              >
                Go to Homepage
              </button>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-6">
        <div className="flex flex-col items-center space-y-4">
          {renderIcon()}
          {renderContent()}
        </div>
      </div>
    </div>
  );
} 