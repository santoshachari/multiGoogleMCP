import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

// Uses the AWS SDK's default credential provider chain (instance role on EC2,
// local `aws` CLI config for dev) — no static keys stored in .env.
const sesClient = new SESClient({ region: process.env.SES_REGION ?? "eu-west-1" });

export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  const fromEmail = process.env.SES_FROM_EMAIL;
  if (!fromEmail) throw new Error("SES_FROM_EMAIL is not configured");

  const htmlBody = `
<html>
<body style="font-family: Arial, sans-serif; color: #222; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #1a1a1a;">Reset your password</h2>
  <p>We received a request to reset your Google MCP Platform password. Click the button below to set a new one:</p>
  <p style="margin: 32px 0;">
    <a href="${resetUrl}"
       style="background:#4338ca; color:#fff; text-decoration:none; padding:12px 24px; border-radius:8px; font-weight:600; display:inline-block;">
      Reset Password
    </a>
  </p>
  <p style="color:#666; font-size:13px;">This link expires in <strong>1 hour</strong>. If you didn't request this, you can safely ignore this email.</p>
</body>
</html>`;

  const textBody = [
    "We received a request to reset your Google MCP Platform password.",
    "Click the link below to set a new one (expires in 1 hour):",
    "",
    resetUrl,
    "",
    "If you didn't request this, you can safely ignore this email.",
  ].join("\n");

  await sesClient.send(
    new SendEmailCommand({
      Source: `Google MCP Platform <${fromEmail}>`,
      Destination: { ToAddresses: [to] },
      Message: {
        Subject: { Data: "Reset your Google MCP Platform password" },
        Body: { Html: { Data: htmlBody }, Text: { Data: textBody } },
      },
    }),
  );
}
