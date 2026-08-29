// Supabase Edge Function: generate-site
// Given a deal id, calls Claude to generate a unique, tailored one-page
// business website (not a template), and saves the HTML back to the deal.
// Set ANTHROPIC_API_KEY as a secret: supabase secrets set ANTHROPIC_API_KEY=your_key

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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
        JSON.stringify({ error: "Missing or invalid JSON body — expected { dealId }" }),
        { status: 400, headers: corsHeaders }
      );
    }
    const { dealId } = body;
    if (!dealId) {
      return new Response(JSON.stringify({ error: "dealId required" }), { status: 400, headers: corsHeaders });
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

    const prompt = `You are a professional web designer building a real, launch-ready one-page website for a specific local business. This is not a demo — treat it like a paid client project.

Business details:
- Name: ${deal.business_name}
- Category: ${deal.category ?? "local business"}
- City/State: ${deal.city}, ${deal.state}
- Google rating: ${deal.rating ?? "not listed"}
- Phone: ${deal.phone ?? "not provided"}
- Address: ${deal.address ?? "not provided"}

Design a genuinely distinctive site for THIS business specifically — not a generic small-business template. Make real creative choices in color palette, typography pairing, layout, and tone that fit this specific category and place. Avoid cliché AI-design defaults (cream background + orange accent, generic centered hero with gradient, stock "01/02/03" numbered feature blocks unless they truly fit). Write real, specific, non-generic marketing copy for the hero, an about/story section, and a services or specialties section appropriate to the category — invent plausible, tasteful specifics (e.g. specific dishes for a restaurant, specific services for a barber) rather than vague filler.

Do not use external images, icon fonts, or JS frameworks. Any visual flourishes must be pure CSS (gradients, shapes, patterns) since there are no real photos yet. Include the phone number and address naturally if provided. Include a prominent call-to-action (call or visit).

Output ONLY the complete raw HTML document — starting with <!DOCTYPE html> and ending with </html>. Inline all CSS in a <style> tag. No markdown code fences, no commentary before or after, no explanation, no preamble — begin your response immediately with <!DOCTYPE html>. Keep the page to one focused page (hero, about, services/specialties, contact) — do not pad with extra sections. Prioritize getting to complete, valid HTML within the space you have.`;

    console.log(`Calling Claude for deal ${dealId} (${deal.business_name})...`);
    const startTime = Date.now();

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 8192,
        thinking: { type: "disabled" },
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      console.error("Claude API error:", errText);
      return new Response(JSON.stringify({ error: "Claude API error", detail: errText }), { status: 502, headers: corsHeaders });
    }

    console.log(`Claude responded in ${Date.now() - startTime}ms`);

    const claudeData = await claudeRes.json();
    console.log("stop_reason:", claudeData.stop_reason, "| content block types:", (claudeData.content ?? []).map((b: any) => b.type));

    let html = (claudeData.content ?? [])
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("\n")
      .trim();

    console.log("Extracted HTML length:", html.length, "| first 150 chars:", html.slice(0, 150));

    // strip stray code fences if the model adds them despite instructions
    html = html.replace(/^```html\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "");

    const { error: updateErr } = await supabase
      .from("deals")
      .update({ site_html: html })
      .eq("id", dealId);

    if (updateErr) {
      return new Response(JSON.stringify({ error: updateErr.message }), { status: 500, headers: corsHeaders });
    }

    return new Response(JSON.stringify({ ok: true, html }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (e) {
    console.error("Unhandled error:", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});
