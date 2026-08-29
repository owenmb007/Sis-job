# Dealflow

Internal tool for sourcing high-rated, website-less local businesses, generating a tailored
AI-designed website per business, and tracking outreach/sales through to close.

## Current state (as of migration to Claude Code)

Everything below is **already live** in production — this repo is catching up to match
reality, not starting from scratch.

- **Frontend**: `public/index.html` — single-file app (dashboard + Income/Archive/Searching/Response
  tabs), deployed as a static site on **Cloudflare Pages** at https://dealflow-f56.pages.dev
- **Backend**: Supabase project `ocwscdgeamejvcyxsmhy`
  - Postgres tables: `deals`, `messages`, `saved_searches`, `prospects_queue` (see
    `supabase/migrations/0001_init.sql`)
  - Row Level Security scoped per-user via Supabase Auth (email/password)
  - Edge Function `find-prospects` — queries Google Places API for saved searches, filters for
    rating threshold + no listed website, inserts candidates into `prospects_queue` for manual
    review/approval
  - Edge Function `generate-site` — given an approved deal, calls the Claude API to generate a
    genuinely unique, tailored one-page business website (not template-based), saves the HTML
    to `deals.site_html`

## Secrets already configured in Supabase (do not need to be re-entered)

- `GOOGLE_PLACES_KEY` — restricted to Places API (New)
- `ANTHROPIC_API_KEY`
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` — auto-provided by Supabase runtime

## What's NOT built yet (the actual roadmap)

1. **Deploying an approved/generated site live to its own public subdomain** — right now
   generated sites only exist as HTML in the database, previewed in-app. Nothing is
   auto-published; the business owner has been explicit that going live must always be a
   deliberate, per-deal action tied to a confirmed sale — never automatic.
   - Planned approach: a single Cloudflare Worker on a wildcard subdomain
     (`*.yourdomain.com`) that looks up the requested business by hostname and serves its
     `site_html` from Supabase on the fly — avoids per-business deploys / Pages project limits.
   - **No domain has been purchased yet.** Do not provision any billing/domain resources
     without explicit confirmation.
2. Outreach email sending (Resend/Postmark) + inbound reply webhook into the Response tab
3. CAN-SPAM compliant email template
4. PWA polish (manifest + service worker) for a proper home-screen install

## Local dev setup

```bash
# Supabase CLI
supabase login
supabase link --project-ref ocwscdgeamejvcyxsmhy

# Cloudflare (Wrangler) — needed once we build the wildcard Worker for live site hosting
npm install -g wrangler
wrangler login
```

Deploying an Edge Function update:
```bash
supabase functions deploy find-prospects
supabase functions deploy generate-site
```

Deploying the frontend to Cloudflare Pages:
```bash
npx wrangler pages deploy public --project-name=dealflow
```

## Known gotchas learned the hard way (don't re-break these)

- Edge Functions **must** handle CORS preflight (`OPTIONS`) requests before touching
  `req.json()` — an unhandled preflight will crash on `Unexpected end of JSON input`.
- `generate-site` calls Claude with `thinking: { type: "disabled" }` and `max_tokens: 8192` —
  extended thinking was silently eating the token budget and truncating generated HTML
  mid-`<style>` tag before this fix.
- Blob URLs and `iframe.srcdoc` do not reliably render when the parent page is opened via
  `file://` — the app must always be served from a real origin (this is why we're on
  Cloudflare Pages, not a locally-opened file).
- Cloudflare Pages direct-upload needs `index.html` at the **root** of the uploaded
  zip/folder — nesting it in a subfolder causes a 404 even when the deploy shows "success."
