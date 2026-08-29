// Supabase Edge Function: find-prospects
// Runs one or all saved searches: queries Google Places, filters for
// high-rated businesses with no listed website, inserts into prospects_queue.
// Deploy via Supabase Dashboard > Edge Functions, or `supabase functions deploy find-prospects`.
// Set GOOGLE_PLACES_KEY as a secret: supabase secrets set GOOGLE_PLACES_KEY=your_key

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GOOGLE_PLACES_KEY = Deno.env.get("GOOGLE_PLACES_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (_req) => {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: searches, error: searchErr } = await supabase
    .from("saved_searches")
    .select("*")
    .eq("active", true);

  if (searchErr) {
    return new Response(JSON.stringify({ error: searchErr.message }), { status: 500 });
  }

  let totalFound = 0;

  for (const search of searches ?? []) {
    const query = `${search.category} in ${search.city}, ${search.state}`;

    const placesRes = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_PLACES_KEY,
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.rating,places.websiteUri,places.formattedAddress,places.nationalPhoneNumber,places.types",
      },
      body: JSON.stringify({ textQuery: query, maxResultCount: search.max_results ?? 20 }),
    });

    if (!placesRes.ok) {
      console.error("Places API error for", query, await placesRes.text());
      continue;
    }

    const placesData = await placesRes.json();
    const places = placesData.places ?? [];
    console.log(`Query "${query}": Google returned ${places.length} raw results`);
    console.log("Sample websiteUri values:", places.slice(0,5).map((p:any)=>({name:p.displayName?.text, rating:p.rating, website:p.websiteUri})));

    const qualifying = places.filter(
      (p: any) => (p.rating ?? 0) >= (search.min_rating ?? 4.5) && !p.websiteUri
    );
    console.log(`Query "${query}": ${qualifying.length} qualify (rating>=${search.min_rating}, no website)`);

    if (qualifying.length === 0) continue;

    const rows = qualifying.map((p: any) => ({
      owner_id: search.owner_id,
      place_id: p.id,
      business_name: p.displayName?.text ?? "Unknown",
      category: search.category,
      city: search.city,
      state: search.state,
      rating: p.rating ?? null,
      phone: p.nationalPhoneNumber ?? null,
      address: p.formattedAddress ?? null,
      status: "pending",
    }));

    const { error: insertErr } = await supabase
      .from("prospects_queue")
      .upsert(rows, { onConflict: "owner_id,place_id", ignoreDuplicates: true });

    if (insertErr) console.error("Insert error:", insertErr.message);
    else totalFound += rows.length;
  }

  return new Response(JSON.stringify({ ok: true, totalFound }), {
    headers: { "Content-Type": "application/json" },
  });
});
