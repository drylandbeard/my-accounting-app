"use client";

import React, { useState, useEffect } from "react";
import { signIn } from "@/lib/auth-client";
import { useAuth } from "./AuthContext";
import { useRouter } from "next/navigation";
import { CheckCircleIcon, XMarkIcon } from "@heroicons/react/24/outline";

export default function AuthForm() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [showVerificationMessage, setShowVerificationMessage] = useState(false);
  const [isResendingVerification, setIsResendingVerification] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  const { setUser, setCompanies } = useAuth();
  const router = useRouter();

  // Auto-hide toast after 5 seconds
  useEffect(() => {
    if (showToast) {
      const timer = setTimeout(() => {
        setShowToast(false);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [showToast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccessMessage("");
    setIsLoading(true);

    if (isSignUp && password !== confirmPassword) {
      setError("Passwords do not match");
      setIsLoading(false);
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters long");
      setIsLoading(false);
      return;
    }

    try {
      if (isSignUp) {
        const response = await fetch("/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        const result = await response.json();
        
        if (!response.ok) {
          setError(result.error);
        } else if (result.verificationSent) {
          // Show email verification message and toast
          setShowVerificationMessage(true);
          
          // Show toast notification
          setToastMessage(`Verification email sent to ${email}! Please check your inbox and click the verification link to activate your account.`);
          setShowToast(true);
          
          setEmail("");
          setPassword("");
          setConfirmPassword("");
        }
      } else {
        // Use client-safe signIn function (no email imports)
        const result = await signIn(email, password);
        if (result.error) {
          if (result.needsVerification) {
            setShowVerificationMessage(true);
            setEmail(result.email || email);
          }
          setError(result.error);
        } else if (result.user) {
          setUser(result.user);
          setCompanies(result.companies);
          
          // Redirect to homepage
          router.push("/");
        }
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const toggleMode = () => {
    setIsSignUp(!isSignUp);
    setError("");
    setSuccessMessage("");
    setShowVerificationMessage(false);
    setShowToast(false);
    setToastMessage("");
    setEmail("");
    setPassword("");
    setConfirmPassword("");
  };

  const handleResendVerification = async () => {
    if (!email) return;

    setIsResendingVerification(true);
    setError("");
    setSuccessMessage("");

    try {
      const response = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (response.ok) {
        setSuccessMessage("Verification email sent! Please check your inbox.");
      } else {
        setError(data.error || "Failed to resend verification email.");
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsResendingVerification(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-8">
        <div className="text-center">
          <h2 className="mt-6 text-3xl font-bold text-gray-900">
            {isSignUp ? "Create your account" : "Sign in to your account"}
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Welcome to SWITCH Accounting
          </p>
        </div>
        
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded text-sm">
              {error}
            </div>
          )}
          
          {successMessage && (
            <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded text-sm">
              {successMessage}
            </div>
          )}

          {showVerificationMessage && !isSignUp && (
            <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded text-sm">
              <p className="mb-3">Your account needs email verification to sign in.</p>
              <button
                type="button"
                onClick={handleResendVerification}
                disabled={isResendingVerification}
                className="text-blue-600 hover:text-blue-800 underline disabled:opacity-50"
              >
                {isResendingVerification ? "Sending..." : "Resend verification email"}
              </button>
            </div>
          )}
          
          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="sr-only">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="relative block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-500 focus:z-10 focus:border-black focus:outline-none focus:ring-black text-sm"
                placeholder="Email address"
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete={isSignUp ? "new-password" : "current-password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="relative block w-full border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-500 focus:z-10 focus:border-black focus:outline-none focus:ring-black text-sm rounded-md"
                placeholder="Password"
              />
            </div>
            {isSignUp && (
              <div>
                <label htmlFor="confirmPassword" className="sr-only">
                  Confirm Password
                </label>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="relative block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-500 focus:z-10 focus:border-black focus:outline-none focus:ring-black text-sm"
                  placeholder="Confirm password"
                />
              </div>
            )}
          </div>

          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="group relative flex w-full justify-center rounded-md border border-transparent bg-gray-600 py-2 px-4 text-sm font-medium text-white hover:bg-black focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? "Processing..." : (isSignUp ? "Sign up" : "Sign in")}
            </button>
          </div>

          <div className="text-center">
            <button
              type="button"
              onClick={toggleMode}
              className="text-gray-600 hover:text-gray-500 text-sm"
            >
              {isSignUp 
                ? "Already have an account? Sign in" 
                : "Don't have an account? Sign up"
              }
            </button>
          </div>
        </form>
      </div>

      {/* Toast Notification */}
      {showToast && (
        <div className="fixed top-4 right-4 z-50 max-w-md">
          <div className="bg-green-50 border border-green-200 rounded-lg shadow-lg p-4 flex items-start gap-3">
            <CheckCircleIcon className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="text-sm font-medium text-green-800">Email Sent!</h4>
              <p className="text-sm text-green-700 mt-1">{toastMessage}</p>
            </div>
            <button
              onClick={() => setShowToast(false)}
              className="text-green-400 hover:text-green-600 transition-colors"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
} 