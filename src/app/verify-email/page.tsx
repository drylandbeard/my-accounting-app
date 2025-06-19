"use client";

import { useEffect, useState, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { CheckCircle, XCircle, Mail } from "lucide-react";
import { useAuth } from "@/components/AuthContext";
import { getUserCompanies } from "@/lib/auth-client";

export default function VerifyEmailPage() {
  const [status, setStatus] = useState<"loading" | "success" | "error" | "expired" | "redirecting">("loading");
  const [message, setMessage] = useState("");
  const [user, setUser] = useState<{ id: string; email: string; role: string } | null>(null);
  const [isResending, setIsResending] = useState(false);
  const [resendMessage, setResendMessage] = useState("");
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [hasProcessedToken, setHasProcessedToken] = useState(false);
  const [isVerificationComplete, setIsVerificationComplete] = useState(false);
  const verificationResultRef = useRef<{ success: boolean; processed: boolean }>({ success: false, processed: false });
  const searchParams = useSearchParams();
  const router = useRouter();
  const { setUser: setAuthUser, setCompanies } = useAuth();

  const token = searchParams.get("token");

  useEffect(() => {
    console.log("🔄 useEffect triggered", { 
      token: token ? "present" : "missing", 
      hasProcessedToken, 
      isVerificationComplete,
      refProcessed: verificationResultRef.current.processed,
      refSuccess: verificationResultRef.current.success 
    });

    if (!token) {
      console.log("❌ No token found in URL");
      setStatus("error");
      setMessage("Invalid verification link. The token is missing.");
      return;
    }

    // Prevent processing the same token multiple times AND prevent re-processing after completion
    if (!verificationResultRef.current.processed && !hasProcessedToken && !isVerificationComplete) {
      console.log("🔍 Starting verification with token:", token.substring(0, 10) + "...");
      setHasProcessedToken(true);
      verificationResultRef.current.processed = true;
      verifyEmailToken(token);
    } else {
      console.log("🚫 Skipping verification - already processed or in progress");
    }
  }, [token, hasProcessedToken, isVerificationComplete]);

  const verifyEmailToken = async (verificationToken: string) => {
    // Double-check to prevent duplicate processing
    if (verificationResultRef.current.processed && verificationResultRef.current.success) {
      console.log("🔄 Token already successfully processed, skipping...");
      return;
    }

    try {
      console.log("📡 Making API call to verify token...");
      const response = await fetch(`/api/auth/verify-email?token=${verificationToken}`);
      const data = await response.json();
      
      console.log("📡 API Response:", { status: response.status, data });

      if (response.ok) {
        console.log("✅ Verification successful");
        verificationResultRef.current.success = true; // Mark as successful
        setIsVerificationComplete(true); // Mark as completed to prevent re-processing
        setStatus("success");
        setMessage("Your email has been verified successfully!");
        setUser(data.user);
        
        // Automatically sign in the user after successful verification
        if (data.user) {
          console.log("🔄 Starting automatic sign-in...");
          await signInUserAfterVerification(data.user);
        }
      } else {
        console.log("❌ Verification failed:", data.error);
        
        // Check if the error is because the token was already used but verification succeeded
        if ((data.error?.includes("already used") || data.error?.includes("used")) && !verificationResultRef.current.success) {
          console.log("🔍 Token already used - checking if user is already verified...");
          // Try to extract user info from the error or check if we can still sign in
          verificationResultRef.current.success = false;
          setIsVerificationComplete(true);
          setStatus("error");
          setMessage("This verification link has already been used. If you just verified your email, please try signing in with your credentials.");
        } else if (data.error?.includes("expired") || data.error?.includes("Invalid or expired")) {
          verificationResultRef.current.success = false;
          setIsVerificationComplete(true);
          setStatus("expired");
          setMessage("Your verification link has expired. Please request a new one.");
        } else {
          verificationResultRef.current.success = false;
          setIsVerificationComplete(true);
          setStatus("error");
          setMessage(data.error || "Failed to verify email. Please try again.");
        }
      }
    } catch (error) {
      console.error("💥 Verification error:", error);
      verificationResultRef.current.success = false; // Mark as failed
      setIsVerificationComplete(true); // Mark as completed to prevent retries
      setStatus("error");
      setMessage("An unexpected error occurred. Please try again.");
    }
  };

  const signInUserAfterVerification = async (userData: { id: string; email: string; role: string }) => {
    try {
      console.log("🔄 Setting signing in state...");
      setIsSigningIn(true);
      
      console.log("📋 Fetching user companies...");
      // Get user's companies
      const companiesResult = await getUserCompanies(userData.id);
      
      console.log("📋 Companies result:", companiesResult);
      
      if (companiesResult.error) {
        console.error("❌ Failed to get user companies:", companiesResult.error);
        // Still sign in the user even if companies fetch fails
        console.log("🔄 Signing in user without companies...");
        
        const userToSet = {
          id: userData.id,
          email: userData.email,
          role: userData.role as "Owner" | "Member" | "Accountant"
        };
        
        setAuthUser(userToSet);
        setCompanies([]);
        
        // Manually ensure localStorage is updated immediately
        localStorage.setItem("auth_user", JSON.stringify(userToSet));
        localStorage.removeItem("auth_companies");
        localStorage.removeItem("auth_current_company");
      } else {
        // Transform the companies data to match UserCompany interface
        const transformedCompanies = (companiesResult.companies || []).map((item: {
          company_id: string;
          role: string;
          companies: { id: string; name: string; description?: string } | { id: string; name: string; description?: string }[];
        }) => ({
          company_id: item.company_id,
          role: item.role as "Owner" | "Member" | "Accountant",
          companies: Array.isArray(item.companies) ? item.companies[0] : item.companies
        }));
        
        console.log("📋 Transformed companies:", transformedCompanies);
        
        const userToSet = {
          id: userData.id,
          email: userData.email,
          role: userData.role as "Owner" | "Member" | "Accountant"
        };
        
        // Set user and companies in auth context
        console.log("🔄 Setting user and companies in auth context...");
        setAuthUser(userToSet);
        setCompanies(transformedCompanies);
        
        // Manually ensure localStorage is updated immediately
        localStorage.setItem("auth_user", JSON.stringify(userToSet));
        localStorage.setItem("auth_companies", JSON.stringify(transformedCompanies));
        localStorage.removeItem("auth_current_company"); // No company selected by default
      }
      
      // Show success message briefly, then redirect
      console.log("✅ Auto sign-in complete, redirecting in 2 seconds...");
      setStatus("redirecting");
      setTimeout(() => {
        console.log("🔄 Redirecting to homepage...");
        router.replace("/");
      }, 2000);
      
    } catch (error) {
      console.error("💥 Error signing in after verification:", error);
      // Fall back to showing the manual sign-in button
      setIsSigningIn(false);
    }
  };

  const handleResendVerification = async () => {
    if (!user?.email) {
      setResendMessage("Unable to resend verification email. Please try signing up again.");
      return;
    }

    setIsResending(true);
    setResendMessage("");

    try {
      const response = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: user.email }),
      });

      const data = await response.json();

      if (response.ok) {
        setResendMessage("Verification email sent! Please check your inbox.");
      } else {
        setResendMessage(data.error || "Failed to resend verification email.");
      }
    } catch (error) {
      console.error("Resend error:", error);
      setResendMessage("An unexpected error occurred. Please try again.");
    } finally {
      setIsResending(false);
    }
  };

  const handleGoToSignIn = () => {
    router.push("/");
  };

  const renderIcon = () => {
    switch (status) {
      case "success":
        return <CheckCircle className="w-8 h-8 text-green-500" />;
      case "error":
      case "expired":
        return <XCircle className="w-8 h-8 text-red-500" />;
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
            <h2 className="text-xl font-bold text-gray-900 mb-3">Verifying your email...</h2>
            <p className="text-sm text-gray-600">Please wait while we verify your email address.</p>
          </div>
        );

      case "success":
        return (
          <div className="text-center">
            <h2 className="text-xl font-bold text-green-900 mb-3">Email Verified Successfully!</h2>
            <p className="text-sm text-green-700 mb-4">{message}</p>
            {isSigningIn ? (
              <div>
                <p className="text-sm text-gray-600 mb-3">
                  Signing you in automatically...
                </p>
                <div className="flex justify-center">
                  <div className="w-6 h-6 relative">
                    <div className="w-6 h-6 border-2 border-gray-200 rounded-full"></div>
                    <div className="w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin absolute top-0 left-0"></div>
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <p className="text-sm text-gray-600 mb-4">
                  You can now sign in to your account and start using SWITCH Accounting.
                </p>
                <button
                  onClick={handleGoToSignIn}
                  className="bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-md transition-colors text-sm"
                >
                  Go to Sign In
                </button>
              </div>
            )}
          </div>
        );

      case "redirecting":
        return (
          <div className="text-center">
            <h2 className="text-xl font-bold text-green-900 mb-3">Welcome to SWITCH!</h2>
            <p className="text-sm text-green-700 mb-4">Your email has been verified and you&apos;re now signed in.</p>
            <div>
              <p className="text-sm text-gray-600 mb-3">
                Redirecting you to your dashboard...
              </p>
              <div className="flex justify-center">
                <div className="w-6 h-6 relative">
                  <div className="w-6 h-6 border-2 border-green-100 rounded-full"></div>
                  <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin absolute top-0 left-0"></div>
                </div>
              </div>
            </div>
          </div>
        );

      case "expired":
        return (
          <div className="text-center">
            <h2 className="text-xl font-bold text-red-900 mb-3">Verification Link Expired</h2>
            <p className="text-sm text-red-700 mb-4">{message}</p>
            {user?.email && (
              <div className="space-y-3">
                {resendMessage && (
                  <div className={`p-2 rounded-md text-xs ${
                    resendMessage.includes("sent") 
                      ? "bg-green-50 text-green-700 border border-green-200" 
                      : "bg-red-50 text-red-700 border border-red-200"
                  }`}>
                    {resendMessage}
                  </div>
                )}
                <button
                  onClick={handleResendVerification}
                  disabled={isResending}
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-md transition-colors flex items-center gap-2 mx-auto text-sm"
                >
                  <Mail className="w-4 h-4" />
                  {isResending ? "Sending..." : "Resend Verification Email"}
                </button>
              </div>
            )}
            <div className="mt-4">
              <button
                onClick={handleGoToSignIn}
                className="text-gray-600 hover:text-gray-800 underline text-sm"
              >
                Back to Sign In
              </button>
            </div>
          </div>
        );

      case "error":
      default:
        return (
          <div className="text-center">
            <h2 className="text-xl font-bold text-red-900 mb-3">Verification Failed</h2>
            <p className="text-sm text-red-700 mb-4">{message}</p>
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                The verification link may be invalid or already used. Please try signing up again or contact support.
              </p>
              <button
                onClick={handleGoToSignIn}
                className="bg-gray-600 hover:bg-gray-700 text-white font-medium py-2 px-4 rounded-md transition-colors text-sm"
              >
                Back to Sign In
              </button>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-sm w-full bg-white rounded-lg shadow-md p-6">
        <div className="flex flex-col items-center space-y-4">
          {renderIcon()}
          {renderContent()}
        </div>
      </div>
    </div>
  );
} 