import twilio from 'twilio';

// Use a separate variable for the initialized instance to avoid 
// name collision with the imported library
let twilioLib: typeof twilio | null;

try {
  // Since you are in TypeScript, we use the imported 'twilio' 
  // but allow for a check if it's functional
  twilioLib = twilio;
} catch (_) {
  twilioLib = null;
}

/**
 * WhatsApp via Twilio:
 * - You can send text ✅
 * - You can send media ✅ BUT ONLY via a PUBLIC HTTPS URL (mediaUrl)
 * - You cannot send to WhatsApp groups via Twilio for this use case
 */

function getTwilioClientOrNull() {
  if (!twilioLib) return null;
  
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  
  if (!sid || !token) return null;
  
  // Calling the library function returns a Twilio Client instance
  return twilioLib(sid, token);
}

interface WhatsAppParams {
  toNumbers?: string[];
  body?: string;
  mediaUrl?: string;
}

async function sendWhatsAppNotification({ toNumbers = [], body, mediaUrl }: WhatsAppParams) {
  const client = getTwilioClientOrNull();
  if (!client) return { skipped: true, reason: "Twilio not configured" };

  const from = process.env.TWILIO_WHATSAPP_FROM; 
  if (!from) return { skipped: true, reason: "Missing TWILIO_WHATSAPP_FROM" };

  const results = [];
  for (const to of toNumbers) {
    if (!to) continue;

    try {
      const msg = await client.messages.create({
        from,
        to: to.startsWith("whatsapp:") ? to : `whatsapp:${to}`,
        body: body || "",
        ...(mediaUrl ? { mediaUrl: [mediaUrl] } : {})
      });

      results.push({ to, sid: msg.sid, status: msg.status });
    } catch (e) {
      console.error(`[whatsapp] Failed to send to ${to}:`, (e as Error).message);
      results.push({ to, error: (e as Error).message });
    }
  }

  return { skipped: false, results };
}

// Using module.exports to match your original structure
// module.exports = { sendWhatsAppNotification };

export { sendWhatsAppNotification };