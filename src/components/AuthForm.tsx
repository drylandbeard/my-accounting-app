"use client";

import React, { useState, useEffect } from "react";
import { useAuthStore } from "@/zustand/authStore";
import { useRouter } from "next/navigation";
import { CheckCircle, X } from "lucide-react";
import { GalleryVerticalEnd } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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

  const { setAuth } = useAuthStore();
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
          // Redirect to verification page with email parameter
          router.push(`/verify-email?email=${encodeURIComponent(email)}`);
        }
      } else {
        // Use the updated signin API that returns JWT tokens
        const response = await fetch("/api/auth/signin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        
        const result = await response.json();
        
        if (!response.ok) {
          if (result.needsVerification) {
            setShowVerificationMessage(true);
            setEmail(result.email || email);
          }
          setError(result.error);
        } else if (result.user && result.accessToken) {
          // Set auth state in Zustand store
          setAuth({
            user: result.user,
            companies: result.companies,
            currentCompany: result.currentCompany,
            accessToken: result.accessToken,
            refreshToken: result.refreshToken,
          });
          
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
    <div className="bg-muted flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <a href="#" className="flex items-center gap-2 self-center font-medium">
          <div className="bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-md">
            <GalleryVerticalEnd className="size-4" />
          </div>
          switch
        </a>
        
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-xl">
              {isSignUp ? "Create your account" : "Welcome back"}
            </CardTitle>
            <CardDescription>
              {isSignUp 
                ? "Enter your details to create your account" 
                : "Enter your credentials to access your account"
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit}>
              <div className="grid gap-6">
                {/* Error Messages */}
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
                      {isResendingVerification ? "Sending..." : "Resend"}
                    </button>
                  </div>
                )}

                {/* Form Fields */}
                <div className="grid gap-6">
                  <div className="grid gap-3">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="m@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="grid gap-3">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>
                  {isSignUp && (
                    <div className="grid gap-3">
                      <Label htmlFor="confirmPassword">Confirm Password</Label>
                      <Input
                        id="confirmPassword"
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                      />
                    </div>
                  )}
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? "Please wait..." : (isSignUp ? "Sign up" : "Sign in")}
                  </Button>
                </div>
              </div>
            </form>
            
            <div className="mt-4 text-center text-sm">
              {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
              <button
                type="button"
                onClick={toggleMode}
                className="underline underline-offset-4 hover:text-primary"
              >
                {isSignUp ? "Sign in" : "Sign up"}
              </button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Toast Notification */}
      {showToast && (
        <div className="fixed top-4 right-4 bg-white border border-gray-200 rounded-lg shadow-lg p-4 flex items-center gap-3 z-50">
          <CheckCircle className="h-5 w-5 text-green-500" />
          <span className="text-sm">{toastMessage}</span>
          <button
            onClick={() => setShowToast(false)}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
} 