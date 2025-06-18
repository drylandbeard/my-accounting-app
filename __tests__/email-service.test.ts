import { getEmailService } from "../src/lib/email/service";
import { createVerificationUrl, generateVerificationToken } from "../src/lib/email/utils";

/**
 * Test email service with current configuration
 */
async function testEmailService() {
  const testEmail = process.env.TEST_EMAIL || "test@example.com";
  
  if (!testEmail) {
    console.error("Please set TEST_EMAIL environment variable");
    process.exit(1);
  }

  try {
    console.log("🧪 Testing Email Service");
    console.log("=" .repeat(50));

    // Initialize email service
    const emailService = getEmailService();
    console.log(`📧 Provider: ${emailService.getProviderName()}`);
    console.log(`📬 Test Email: ${testEmail}`);
    console.log("");

    // Generate test verification data
    const token = generateVerificationToken();
    const verificationUrl = createVerificationUrl(token);

    const testData = {
      email: testEmail,
      verificationUrl,
      userName: "Test User"
    };

    console.log("📤 Sending test verification email...");
    console.log(`🔗 Verification URL: ${verificationUrl}`);
    
    // Send test email
    const result = await emailService.sendVerificationEmail(testData);

    if (result.success) {
      console.log("✅ Email sent successfully!");
      console.log(`📍 Message ID: ${result.messageId}`);
      console.log("");
      console.log("📋 Next steps:");
      console.log("1. Check your email inbox");
      console.log("2. Look for the verification email");
      console.log("3. Test the verification link");
    } else {
      console.log("❌ Email sending failed!");
      console.log(`💥 Error: ${result.error}`);
      console.log("");
      console.log("🔧 Troubleshooting:");
      console.log("1. Check your email provider credentials");
      console.log("2. Verify your environment variables");
      console.log("3. Check the email service logs");
    }

  } catch (error) {
    console.error("💥 Test failed with error:", error);
    console.log("");
    console.log("🔧 Common issues:");
    console.log("1. Missing environment variables");
    console.log("2. Invalid API credentials");
    console.log("3. Network connectivity issues");
    process.exit(1);
  }
}

// Show current configuration
function showConfiguration() {
  console.log("⚙️  Current Configuration");
  console.log("=" .repeat(50));
  console.log(`EMAIL_PROVIDER: ${process.env.EMAIL_PROVIDER || "mailtrap (default)"}`);
  console.log(`EMAIL_FROM: ${process.env.EMAIL_FROM || "Not set"}`);
  console.log(`NEXT_PUBLIC_APP_URL: ${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000 (default)"}`);
  console.log("");

  // Show provider-specific config
  const provider = process.env.EMAIL_PROVIDER || "mailhog";
  switch (provider) {
    case "mailhog":
      console.log("🔧 MailHog Configuration:");
      console.log(`MAILHOG_HOST: ${process.env.MAILHOG_HOST || "localhost (default)"}`);
      console.log(`MAILHOG_PORT: ${process.env.MAILHOG_PORT || "1025 (default)"}`);
      console.log(`Web UI: http://${process.env.MAILHOG_HOST || "localhost"}:8025`);
      break;
    case "mailtrap":
      console.log("🔧 Mailtrap Configuration:");
      console.log(`MAILTRAP_API_TOKEN: ${process.env.MAILTRAP_API_TOKEN ? "✅ Set" : "❌ Missing"}`);
      break;
    case "sendgrid":
      console.log("🔧 SendGrid Configuration:");
      console.log(`SENDGRID_API_KEY: ${process.env.SENDGRID_API_KEY ? "✅ Set" : "❌ Missing"}`);
      break;
  }
  console.log("");
}

// Run the test if this script is called directly
if (require.main === module) {
  showConfiguration();
  testEmailService()
    .then(() => {
      console.log("🎉 Test completed successfully!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ Test failed:", error);
      process.exit(1);
    });
}

export { testEmailService }; 