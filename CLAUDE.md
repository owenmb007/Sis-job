# CLAUDE.md — Dealflow Project Brief

## What this is
A solo-operator tool: source high-rated local businesses with no website, generate a
tailored AI-designed site per business, package it with pricing, and track outreach
through to a closed sale. Owner is non-technical — explain tradeoffs plainly, don't
assume familiarity with SQL/CLI/deploy concepts.

## Architecture
- **Frontend**: `public/index.html` — single-file HTML/CSS/JS app. No build step, no
  framework. Dark "OLED terminal" theme (JetBrains Mono + Inter, neon cyan/amber/red/green
  glow accents on dark near-black background). Responsive: mobile gets a bottom tab bar,
  ≥900px gets a left sidebar + multi-column layout. Deployed as a static site on
  **Cloudflare Pages**.
- **Backend**: Supabase project `ocwscdgeamejvcyxsmhy` — Postgres + Auth + Edge Functions.
  - Tables: `deals`, `messages`, `saved_searches`, `prospects_queue`. All RLS-scoped to
    `auth.uid() = owner_id`.
  - Edge Function `find-prospects`: Google Places API → filters (rating threshold, no
    website field) → inserts into `prospects_queue` for manual review, never auto-approved.
  - Edge Function `generate-site`: given an approved deal, calls the Claude API to write a
    genuinely unique one-page site (real creative direction per business, not a template) →
    saves HTML to `deals.site_html`.

## Hard rules — do not violate these
1. **Nothing goes publicly live automatically.** Generating a site only saves HTML to the
   private database and previews it in-app. Publishing a business's site to a real public
   URL must always be a deliberate, explicit action the owner triggers per deal — never a
   side effect of generation, approval, or any batch/scheduled process.
2. **No domain purchase or billing-incurring resource** gets provisioned without the owner
   explicitly confirming first, in that exact conversation. Don't infer permission from past
   approvals.
3. **Never regenerate an AI site silently.** If `deals.site_html` already has content, the
   default action is a free instant "View" (cached, no API call). Regenerating (a paid
   Claude API call) requires a separate, explicit, confirmed action — this was a real bug
   we fixed once already; don't reintroduce it.
4. **Secrets already live in Supabase** (`GOOGLE_PLACES_KEY`, `ANTHROPIC_API_KEY`,
   auto-provided `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`) — never ask the owner to
   re-paste these, never print them in logs/responses, never commit them to the repo.
5. **CAN-SPAM compliance is non-negotiable** once real outreach email sending is built:
   physical address, working unsubscribe, accurate subject lines, from day one — not
   retrofitted later.

## Conventions to follow
- Prefer direct CLI/API deploys (`supabase functions deploy`, `wrangler pages deploy`) over
  ever asking the owner to paste code into a web dashboard — that manual loop was the
  single biggest source of wasted time before this migration.
- When something fails, get real logs/errors before proposing a fix — don't guess-and-check
  across multiple turns. Use `supabase functions logs` / query the `logs` table directly
  rather than asking the owner to copy-paste dashboard output when a CLI/API path exists.
- Every new paid API integration (LLM calls, third-party data APIs) needs a plain-English
  cost note before it ships, not just a code diff.
- Keep the single-file frontend architecture unless there's a concrete reason to change it
  (e.g. genuine need for a build pipeline) — don't add complexity preemptively.

## Known gotchas (already debugged once — don't reintroduce)
- Edge Functions must handle `OPTIONS` preflight **before** calling `req.json()`, or a CORS
  preflight request crashes with `Unexpected end of JSON input`.
- Claude API calls for site generation need `thinking: { type: "disabled" }` and a generous
  `max_tokens` (8192) — extended thinking silently ate the token budget and truncated HTML
  mid-tag before this was caught.
- `iframe.srcdoc` / blob URLs do not render reliably when the parent page is opened via
  `file://` — the app must always be served from a real HTTPS origin.
- Cloudflare Pages direct-upload requires `index.html` at the **root** of the
  uploaded zip/folder; nested in a subfolder = silent 404 despite a "successful" deploy.

## Roadmap (not built yet)
1. Live subdomain hosting for approved/generated sites — planned as one Cloudflare Worker
   on a wildcard subdomain (`*.yourdomain.com`) doing dynamic lookup by hostname against
   Supabase, rather than one Cloudflare Pages project per business (avoids project-count
   limits and per-site redeploys). Blocked on owner purchasing a domain — do not proceed
   without that explicit step happening first.
2. Outreach email sending (Resend or Postmark) + inbound reply webhook feeding the Response
   tab automatically.
3. PWA polish (manifest + service worker) for proper home-screen install/offline support.
