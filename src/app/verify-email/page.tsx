"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { CheckCircleIcon, XCircleIcon, ArrowPathIcon, EnvelopeIcon } from "@heroicons/react/24/outline";

export default function VerifyEmailPage() {
  const [status, setStatus] = useState<"loading" | "success" | "error" | "expired">("loading");
  const [message, setMessage] = useState("");
  const [user, setUser] = useState<{ id: string; email: string; role: string } | null>(null);
  const [isResending, setIsResending] = useState(false);
  const [resendMessage, setResendMessage] = useState("");
  const searchParams = useSearchParams();
  const router = useRouter();

  const token = searchParams.get("token");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("Invalid verification link. The token is missing.");
      return;
    }

    verifyEmailToken(token);
  }, [token]);

  const verifyEmailToken = async (verificationToken: string) => {
    try {
      const response = await fetch(`/api/auth/verify-email?token=${verificationToken}`);
      const data = await response.json();

      if (response.ok) {
        setStatus("success");
        setMessage("Your email has been verified successfully!");
        setUser(data.user);
        
        // Redirect to signin after successful verification
        if (data.user) {
          setTimeout(() => {
            router.push("/");
          }, 2000);
        }
      } else {
        if (data.error?.includes("expired")) {
          setStatus("expired");
          setMessage("Your verification link has expired. Please request a new one.");
        } else {
          setStatus("error");
          setMessage(data.error || "Failed to verify email. Please try again.");
        }
      }
    } catch (error) {
      console.error("Verification error:", error);
      setStatus("error");
      setMessage("An unexpected error occurred. Please try again.");
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
        return <CheckCircleIcon className="w-16 h-16 text-green-500" />;
      case "error":
      case "expired":
        return <XCircleIcon className="w-16 h-16 text-red-500" />;
      case "loading":
      default:
        return <ArrowPathIcon className="w-16 h-16 text-blue-500 animate-spin" />;
    }
  };

  const renderContent = () => {
    switch (status) {
      case "loading":
        return (
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Verifying your email...</h2>
            <p className="text-gray-600">Please wait while we verify your email address.</p>
          </div>
        );

      case "success":
        return (
          <div className="text-center">
            <h2 className="text-2xl font-bold text-green-900 mb-4">Email Verified Successfully!</h2>
            <p className="text-green-700 mb-6">{message}</p>
            <p className="text-gray-600 mb-6">
              You can now sign in to your account and start using SWITCH Accounting.
            </p>
            <button
              onClick={handleGoToSignIn}
              className="bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-6 rounded-md transition-colors"
            >
              Go to Sign In
            </button>
          </div>
        );

      case "expired":
        return (
          <div className="text-center">
            <h2 className="text-2xl font-bold text-red-900 mb-4">Verification Link Expired</h2>
            <p className="text-red-700 mb-6">{message}</p>
            {user?.email && (
              <div className="space-y-4">
                {resendMessage && (
                  <div className={`p-3 rounded-md text-sm ${
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
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2 px-6 rounded-md transition-colors flex items-center gap-2 mx-auto"
                >
                  <EnvelopeIcon className="w-4 h-4" />
                  {isResending ? "Sending..." : "Resend Verification Email"}
                </button>
              </div>
            )}
            <div className="mt-6">
              <button
                onClick={handleGoToSignIn}
                className="text-gray-600 hover:text-gray-800 underline"
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
            <h2 className="text-2xl font-bold text-red-900 mb-4">Verification Failed</h2>
            <p className="text-red-700 mb-6">{message}</p>
            <div className="space-y-4">
              <p className="text-gray-600">
                The verification link may be invalid or already used. Please try signing up again or contact support.
              </p>
              <button
                onClick={handleGoToSignIn}
                className="bg-gray-600 hover:bg-gray-700 text-white font-medium py-2 px-6 rounded-md transition-colors"
              >
                Back to Sign In
              </button>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8">
        <div className="flex flex-col items-center space-y-6">
          {renderIcon()}
          {renderContent()}
        </div>
      </div>
    </div>
  );
} 