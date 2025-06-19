import { supabase } from "../src/lib/supabase";

/**
 * Clean up expired email verification tokens
 * This script should be run periodically (e.g., daily via cron job)
 */
async function cleanupExpiredTokens() {
  try {
    console.log("Starting cleanup of expired verification tokens...");

    // Delete expired tokens
    const { error } = await supabase
      .from("email_verification_tokens")
      .delete()
      .lt("expires_at", new Date().toISOString());

    if (error) {
      console.error("Error cleaning up expired tokens:", error);
      process.exit(1);
    }

    console.log("Cleanup completed. Expired tokens have been deleted.");

    // Also delete unverified users older than 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { error: userError } = await supabase
      .from("users")
      .delete()
      .eq("is_access_enabled", false)
      .lt("created_at", sevenDaysAgo.toISOString());

    if (userError) {
      console.error("Error cleaning up unverified users:", userError);
    } else {
      console.log("Unverified users older than 7 days have been deleted.");
    }

  } catch (error) {
    console.error("Unexpected error during cleanup:", error);
    process.exit(1);
  }
}

// Run the cleanup if this script is called directly
if (require.main === module) {
  cleanupExpiredTokens()
    .then(() => {
      console.log("Cleanup script completed successfully.");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Cleanup script failed:", error);
      process.exit(1);
    });
}

export { cleanupExpiredTokens }; 