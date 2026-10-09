import { Email } from "@convex-dev/auth/providers/Email";
import axios from "axios";
import { RandomReader, generateRandomString } from "@oslojs/crypto/random";

// Email OTP delivery.
//
// Resend (https://resend.com) is the provider: sign up, verify a sending
// domain (or use onboarding@resend.dev while testing), create an API key,
// and set it as RESEND_API_KEY in the Convex dashboard
// (Settings → Environment Variables). From-address defaults to
// onboarding@resend.dev — replace RESEND_FROM with your verified domain
// address before production use.
//
// VLY_EMAIL_API_KEY is the legacy freebuff.com OTP gateway. It stays as a
// fallback so any deployment that still has that key keeps working, but new
// deployments should use Resend: the freebuff account is suspended and its
// gateway is not guaranteed to keep serving this project.
export const emailOtp = Email({
  id: "email-otp",
  maxAge: 60 * 15, // 15 minutes
  // This function can be asynchronous
  async generateVerificationToken() {
    const random: RandomReader = {
      read(bytes: Uint8Array) {
        crypto.getRandomValues(bytes);
      },
    };
    const alphabet = "0123456789";
    return generateRandomString(random, alphabet, 6);
  },
  async sendVerificationRequest({ identifier: email, token }) {
    const subject = "Your Helio sign-in code";
    const text =
      `Your Helio sign-in code is ${token}.\n\n` +
      `It expires in 15 minutes. If you didn't request it, ignore this email.`;
    const resendApiKey = process.env.RESEND_API_KEY;
    if (resendApiKey) {
      await sendViaResend({ resendApiKey, to: email, subject, text });
      return;
    }
    // Legacy fallback — remove once all deployments use Resend.
    const vlyApiKey = process.env.VLY_EMAIL_API_KEY;
    if (!vlyApiKey) {
      throw new Error(
        "No OTP email provider is configured on this Convex deployment. " +
          "Set RESEND_API_KEY (preferred) or VLY_EMAIL_API_KEY in the " +
          "Convex dashboard (Settings → Environment Variables).",
      );
    }
    try {
      await axios.post(
        "https://auth.freebuff.app/send_otp",
        {
          to: email,
          otp: token,
          appName: process.env.VLY_APP_NAME || "a freebuff.com application",
        },
        {
          headers: {
            "x-api-key": vlyApiKey,
          },
        },
      );
    } catch (error) {
      throw new Error(JSON.stringify(error));
    }
  },
});

async function sendViaResend({
  resendApiKey,
  to,
  subject,
  text,
}: {
  resendApiKey: string;
  to: string;
  subject: string;
  text: string;
}) {
  const from = process.env.RESEND_FROM || "onboarding@resend.dev";
  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: [to], subject, text }),
    });
  } catch (error) {
    throw new Error(`Resend request failed: ${String(error)}`);
  }
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Resend rejected the OTP email (HTTP ${response.status}): ${body}`,
    );
  }
}
