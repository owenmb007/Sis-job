// Supabase Edge Function: unsubscribe
// Public, unauthenticated endpoint linked from every outreach email footer
// (CAN-SPAM requires a working opt-out mechanism). Deployed with
// --no-verify-jwt since email clients can't send an Authorization header.
// GET /unsubscribe?deal=<dealId>

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function page(body: string): Response {
  return new Response(
    `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>` +
      `<body style="font-family:system-ui,sans-serif;text-align:center;padding:80px 20px;">${body}</body></html>`,
    { headers: { "content-type": "text/html;charset=UTF-8" } }
  );
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const dealId = url.searchParams.get("deal");

  if (!dealId) {
    return new Response(page("<h1>Missing link parameter</h1>"), { status: 400, headers: { "content-type": "text/html;charset=UTF-8" } });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { error } = await supabase.from("deals").update({ unsubscribed: true }).eq("id", dealId);

  if (error) {
    console.error("Unsubscribe failed:", error.message);
    return new Response(page("<h1>Something went wrong</h1><p>Please try again shortly.</p>"), { status: 500, headers: { "content-type": "text/html;charset=UTF-8" } });
  }

  return new Response(page("<h1>You're unsubscribed</h1><p>You won't receive any further emails from us.</p>"), {
    headers: { "content-type": "text/html;charset=UTF-8" },
  });
});
