"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { CheckCircle, Mail, AlertCircle } from "lucide-react";
import { useAuthStore } from "@/zustand/authStore";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function VerifyEmailContent() {
  const [code, setCode] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [email, setEmail] = useState("");
  
  const searchParams = useSearchParams();
  const router = useRouter();
  const { setAuth } = useAuthStore();

  // Get email from URL parameters
  useEffect(() => {
    const emailParam = searchParams.get("email");
    if (emailParam) {
      setEmail(emailParam);
    } else {
      // If no email provided, redirect to login
      router.push("/");
    }
  }, [searchParams, router]);

  const handleVerifyCode = async () => {
    if (!code || code.length !== 6) {
      setError("Please enter a valid 6-digit code");
      return;
    }

    if (!email) {
      setError("Email is required");
      return;
    }

    setIsVerifying(true);
    setError("");

    try {
      const response = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, code }),
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess(true);
        
        // Automatically sign in the user after successful verification
        if (data.user && data.accessToken) {
          // Set auth state in Zustand store
          setAuth({
            user: data.user,
            companies: data.companies || [],
            currentCompany: data.currentCompany || null,
            accessToken: data.accessToken,
            refreshToken: data.refreshToken,
          });
          
          // Show success message briefly, then redirect
          setTimeout(() => {
            router.replace("/");
          }, 2000);
        }
      } else {
        setError(data.error || "Failed to verify code. Please try again.");
      }
    } catch (error) {
      console.error("Verification error:", error);
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResendCode = async () => {
    if (!email) {
      setError("Email is required to resend code");
      return;
    }

    setIsResending(true);
    setError("");

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
        setError(""); // Clear any previous errors
        // Reset the code input
        setCode("");
        // Show a subtle success indication without an alert
      } else {
        setError(data.error || "Failed to resend verification code.");
      }
    } catch (error) {
      console.error("Resend error:", error);
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsResending(false);
    }
  };

  const handleGoToSignIn = () => {
    router.push("/");
  };

  if (success) {
    return (
      <div className="bg-muted flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
        <div className="flex w-full max-w-sm flex-col gap-6">
          <Card>
            <CardHeader className="text-center">
              <div className="flex justify-center mb-4">
                <CheckCircle className="w-16 h-16 text-green-600" />
              </div>
              <CardTitle className="text-xl text-green-800">
                Email Verified Successfully!
              </CardTitle>
              <CardDescription>
                Your account has been activated. Redirecting you to the app...
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-muted flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <Card>
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <Mail className="w-16 h-16 text-blue-600" />
            </div>
            <CardTitle className="text-xl">
              Verify Your Email
            </CardTitle>
            <CardDescription>
              We&apos;ve sent a 6-digit code to <strong>{email}</strong>. 
              Enter the code below to verify your account.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {/* Error Messages */}
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded text-sm flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {/* OTP Input */}
              <div className="space-y-4">
                <div className="flex justify-center">
                  <InputOTP 
                    maxLength={6} 
                    value={code} 
                    onChange={(value) => setCode(value)}
                    disabled={isVerifying}
                  >
                    <InputOTPGroup>
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                      <InputOTPSlot index={3} />
                      <InputOTPSlot index={4} />
                      <InputOTPSlot index={5} />
                    </InputOTPGroup>
                  </InputOTP>
                </div>
                
                <div className="text-center text-sm text-gray-600">
                  {code === "" ? (
                    <>Enter the 6-digit code sent to your email</>
                  ) : (
                    <></>
                  )}
                </div>
              </div>

              {/* Verify Button */}
              <Button 
                onClick={handleVerifyCode}
                disabled={isVerifying || code.length !== 6}
                className="w-full"
              >
                {isVerifying ? "Verifying..." : "Verify Email"}
              </Button>

              {/* Resend Code */}
              <div className="text-center text-sm">
                <span className="text-gray-600">Didn&apos;t receive the code? </span>
                <button
                  onClick={handleResendCode}
                  disabled={isResending}
                  className="text-blue-600 hover:text-blue-800 underline disabled:opacity-50"
                >
                  {isResending ? "Sending..." : "Resend code"}
                </button>
              </div>

              {/* Back to Sign In */}
              <div className="text-center text-sm">
                <button
                  onClick={handleGoToSignIn}
                  className="text-gray-600 hover:text-gray-800 underline"
                >
                  Back to sign in
                </button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function LoadingFallback() {
  return (
    <div className="bg-muted flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <Card>
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <Mail className="w-16 h-16 text-blue-600" />
            </div>
            <CardTitle className="text-xl">
              Loading...
            </CardTitle>
            <CardDescription>
              Please wait while we load the verification page.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <VerifyEmailContent />
    </Suspense>
  );
} 