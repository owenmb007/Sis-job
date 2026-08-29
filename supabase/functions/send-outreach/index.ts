// Supabase Edge Function: send-outreach
// Sends an outreach (or follow-up) email to a deal's contact via Resend, logs
// it to `messages`, and if this is the first contact, moves the deal from
// 'searching' to 'sent' with today's date.
// Set RESEND_API_KEY as a secret: supabase secrets set RESEND_API_KEY=your_key
//
// NOTE: until a custom domain is verified in Resend, the account can only
// send to the email address the Resend account itself was signed up with
// (Resend's anti-abuse sandbox restriction) -- not to arbitrary prospects.
// That's surfaced back to the caller as a clear error rather than failing silently.
//
// CAN-SPAM compliance: this function refuses to send at all unless
// MAILING_ADDRESS is set (a real physical address is legally required on
// every commercial email -- fail closed rather than send a non-compliant
// message), refuses to send to any deal marked unsubscribed, and appends
// the address + a working unsubscribe link to every message.
// Set with: supabase secrets set MAILING_ADDRESS="123 Main St, City, ST 00000"

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MAILING_ADDRESS = Deno.env.get("MAILING_ADDRESS");
const FROM_ADDRESS = "Steelman Websites <onboarding@resend.dev>";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let body;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Missing or invalid JSON body — expected { dealId, subject, message }" }),
        { status: 400, headers: corsHeaders }
      );
    }
    const { dealId, subject, message } = body;
    if (!dealId || !subject || !message) {
      return new Response(JSON.stringify({ error: "dealId, subject, and message are required" }), { status: 400, headers: corsHeaders });
    }

    if (!MAILING_ADDRESS) {
      return new Response(
        JSON.stringify({ error: "MAILING_ADDRESS secret is not set — CAN-SPAM requires a real physical address on every commercial email, so sending is blocked until it's configured (supabase secrets set MAILING_ADDRESS=\"...\")." }),
        { status: 500, headers: corsHeaders }
      );
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: deal, error: dealErr } = await supabase
      .from("deals")
      .select("*")
      .eq("id", dealId)
      .single();

    if (dealErr || !deal) {
      return new Response(JSON.stringify({ error: dealErr?.message ?? "Deal not found" }), { status: 404, headers: corsHeaders });
    }
    if (!deal.email) {
      return new Response(JSON.stringify({ error: "No email on file for this deal yet" }), { status: 400, headers: corsHeaders });
    }
    if (deal.unsubscribed) {
      return new Response(JSON.stringify({ error: "This contact has unsubscribed — cannot send." }), { status: 400, headers: corsHeaders });
    }

    const unsubscribeUrl = `${SUPABASE_URL}/functions/v1/unsubscribe?deal=${dealId}`;
    const footer = `\n\n—\n${MAILING_ADDRESS}\nDon't want these emails? Unsubscribe: ${unsubscribeUrl}`;

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [deal.email],
        subject,
        text: message + footer,
        headers: {
          "List-Unsubscribe": `<${unsubscribeUrl}>`,
        },
      }),
    });

    if (!resendRes.ok) {
      const errText = await resendRes.text();
      console.error("Resend API error:", errText);
      const hint = errText.includes("verify a domain")
        ? " (Resend restricts unverified accounts to sending only to the email you signed up with — verify a domain in Resend to send to real prospects.)"
        : "";
      return new Response(JSON.stringify({ error: "Resend API error" + hint, detail: errText }), { status: 502, headers: corsHeaders });
    }

    const { error: msgErr } = await supabase.from("messages").insert({
      deal_id: dealId,
      owner_id: deal.owner_id,
      direction: "out",
      body: `${subject}\n\n${message}${footer}`,
    });
    if (msgErr) console.error("Failed to log message:", msgErr.message);

    if (deal.status === "searching") {
      const { error: updateErr } = await supabase
        .from("deals")
        .update({ status: "sent", date_sent: new Date().toISOString().slice(0, 10) })
        .eq("id", dealId);
      if (updateErr) console.error("Failed to update deal status:", updateErr.message);
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (e) {
    console.error("Unhandled error:", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});
