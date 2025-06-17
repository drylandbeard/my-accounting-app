"use client";

import React, { useState } from "react";
import { signIn, signUp } from "@/lib/auth";
import { useAuth } from "./AuthContext";
import { useRouter } from "next/navigation";

export default function AuthForm() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  const { setUser, setCompanies } = useAuth();
  const router = useRouter();

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
        const result = await signUp(email, password);
        if (result.error) {
          setError(result.error);
        } else {
          // After successful signup, automatically sign in the user
          const signInResult = await signIn(email, password);
          if (signInResult.error) {
            // If auto sign-in fails, show success message and let them sign in manually
            setSuccessMessage("Account created successfully! Please wait for an administrator to enable your account access.");
            setEmail("");
            setPassword("");
            setConfirmPassword("");
            setIsSignUp(false);
          } else if (signInResult.user) {
            // Successfully signed in after signup
            setUser(signInResult.user);
            setCompanies(signInResult.companies);
            
            // Redirect to homepage
            router.push("/");
          }
        }
      } else {
        const result = await signIn(email, password);
        if (result.error) {
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
    setEmail("");
    setPassword("");
    setConfirmPassword("");
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
    </div>
  );
} 