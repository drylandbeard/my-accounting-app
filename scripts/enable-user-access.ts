/**
 * Script to manually enable user access
 * Usage: npx tsx scripts/enable-user-access.ts <email>
 * or: ts-node scripts/enable-user-access.ts <email>
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

// Load environment variables from the root directory
dotenv.config({ path: path.join(__dirname, "../.env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321'
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'dev-service-key'

// Use service role key for admin operations
const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function enableUserAccess(email: string): Promise<void> {
  if (!email) {
    console.error("Please provide an email address");
    console.log("Usage: npx tsx scripts/enable-user-access.ts <email>");
    process.exit(1);
  }



  try {
    // Find user by email
    const { data: user, error: findError } = await supabase
      .from("users")
      .select("*")
      .eq("email", email)
      .single();

    if (findError || !user) {
      console.error(`User not found with email: ${email}`);
      if (findError) {
        console.error("Error:", findError.message);
      }
      process.exit(1);
    }

    // Enable access
    const { error: updateError } = await supabase
      .from("users")
      .update({ is_access_enabled: true })
      .eq("id", user.id);

    if (updateError) {
      console.error("Failed to enable access:", updateError.message);
      process.exit(1);
    }

    console.log(`✅ Access enabled for user: ${email}`);
    console.log(`User ID: ${user.id}`);
    console.log(`Role: ${user.role}`);
    console.log(`Created: ${user.created_at}`);
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : "Unknown error");
    process.exit(1);
  }
}

// Get email from command line arguments
const email = process.argv[2];
enableUserAccess(email); 