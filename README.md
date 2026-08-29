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
  - Edge Function `send-outreach` — sends an outreach/follow-up email via Resend, logs it to
    `messages`, moves the deal from `searching` to `sent` on first contact. CAN-SPAM compliant:
    refuses to send without `MAILING_ADDRESS` configured, refuses to send to unsubscribed
    contacts, appends the mailing address + unsubscribe link to every email.
  - Edge Function `unsubscribe` — public, unauthenticated (`--no-verify-jwt`) endpoint linked
    from every outreach email footer; sets `deals.unsubscribed = true`.
- **Live site hosting**: a Cloudflare Worker, `dealflow-site-server` (`workers/dealflow-site-server/`),
  serves published business sites at `/<slug>` on its `workers.dev` URL. It reads from the
  `public.live_sites` Postgres view (anon key) — that view only ever exposes
  `slug`/`business_name`/`site_html` for deals with `live = true`, so publishing a deal is a
  deliberate, explicit action (setting `deals.live = true` + choosing a `slug`), never a side
  effect of generation or any batch process. **No custom domain has been purchased** — this is
  currently served only from the Worker's free `workers.dev` subdomain.
  - Brand name used in the Worker's placeholder page and outbound email `From` address:
    **Steelman Websites**.

## Secrets already configured in Supabase (do not need to be re-entered)

- `GOOGLE_PLACES_KEY` — restricted to Places API (New)
- `ANTHROPIC_API_KEY`
- `RESEND_API_KEY` — used by `send-outreach`
- `MAILING_ADDRESS` — the physical address appended to every outreach email (CAN-SPAM)
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` — auto-provided by Supabase runtime

The `dealflow-site-server` Worker separately has `SUPABASE_URL` / `SUPABASE_ANON_KEY` set as
Worker secrets (`wrangler secret list` to confirm) — these are NOT in `wrangler.toml`.

## What's NOT built yet (the actual roadmap)

1. **A real custom domain for live sites.** Sites currently publish to
   `dealflow-site-server.<account>.workers.dev/<slug>`, not a branded domain. Moving to
   `*.yourdomain.com` (or similar) is still blocked on actually purchasing a domain — **do not
   provision any billing/domain resources without explicit confirmation.**
2. Inbound reply webhook wiring outreach email replies into the Response tab automatically
   (sending is built; inbound is not).
3. PWA polish (manifest + service worker) for a proper home-screen install
4. **Resend is still in sandbox mode** — it can only send to the email address the Resend
   account itself signed up with, not to real prospects, until a sending domain is verified in
   Resend.

## Local dev setup

```bash
# Supabase CLI
supabase login
supabase link --project-ref ocwscdgeamejvcyxsmhy

# Cloudflare (Wrangler) — needed to deploy dealflow-site-server / the frontend
npm install -g wrangler
wrangler login
```

Deploying an Edge Function update:
```bash
supabase functions deploy find-prospects
supabase functions deploy generate-site
supabase functions deploy send-outreach
supabase functions deploy unsubscribe --no-verify-jwt
```

Deploying the frontend to Cloudflare Pages:
```bash
npx wrangler pages deploy public --project-name=dealflow
```

Deploying the live-site-hosting Worker:
```bash
cd workers/dealflow-site-server
wrangler deploy
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
- Resend's sandbox restriction means test sends only land in the inbox that signed up for
  Resend — a "success" response there doesn't mean real prospects would receive it.
- Supabase's security linter flags `public.live_sites` as an ERROR-level `security_definer_view`
  (views run as their owner by default, bypassing RLS on `deals`). This is intentional here —
  the view's own `where live = true` filter and fixed 3-column list are the only thing standing
  between anon and the `deals` table, so treat that view definition as security-critical if it's
  ever touched. Run `get_advisors` after any change to it.
