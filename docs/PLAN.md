# Steelman Websites — Plan to Finish the Project

## Context

This session transferred the project from Claude.ai into this repo. While syncing, I found the
repo was well behind what's actually running in production — first on the backend (fixed and
pushed), and then, more seriously, on the **frontend**.

The deployed app at `dealflow-f56.pages.dev` is a **newer build than `public/index.html` in this
repo**. The repo copy is 48,031 bytes; production is 53,236 bytes and contains seven functions the
repo has never seen (`sendOutreach`, `setLive`, `slugify`, `liveUrl`, `liveActionHtml`, `barChart`,
`sparklineChart`), the "Steelman Websites" branding, revenue charts, and the publish UI — while the
repo copy still has the removed signup button and demo seed data.

**This is the single most urgent thing in the project.** Running the documented deploy command
(`npx wrangler pages deploy public --project-name=dealflow`) from this repo *today* would overwrite
production with the older build and destroy outreach sending, the publish UI, and the charts. The
plan therefore starts by making the repo match reality before anything else is touched.

Along the way I also found three live bugs and confirmed what is and isn't real in the app. Goal of
this plan: a repo that is the true source of truth, an app whose numbers are all real, and a working
path from "found a prospect" to "got paid."

---

## What I found

**Drift (critical)**
- `public/index.html` in the repo is an **older build** than production. Deploying it = regression.
- Production is branded *Steelman Websites*; the repo says *Dealflow*. (Dealflow = internal/repo
  name, Steelman Websites = client-facing brand, also used in `send-outreach`'s From address and the
  Worker's landing page.)

**Live bugs (all currently in production)**
1. **Broken error fallback** — `public/index.html:1016` does `DEALS = SEED_DEALS; MSGS = SEED_MSGS;`
   in the `.catch()` of `initApp()`, but those constants were deleted from the live build. Any
   Supabase load failure throws a `ReferenceError` and the user gets a blank, silent screen instead
   of a graceful fallback or an error message.
2. **Fake "today"** — `new Date('2026-08-16T00:00:00')` is hardcoded in **3** places (dashboard
   revenue, weekly income, overdue follow-up detection). Every time-based number is computed against
   a frozen date ~2 weeks stale and drifting further daily.
3. **11 references to 5 undefined CSS variables** — `--forest`, `--line-light` (×6), `--brass`,
   `--brass-dim` (×2), `--ink` are leftovers from an older light theme and are never defined. They
   style the prospect **Approve → Deal / Reject** buttons and the entire **New Search** form, which
   currently render unstyled/near-invisible on the dark theme.

**Real vs. placeholder data**
- Real: 4 deals, 8 prospects (4 pending / 4 approved), 7 saved searches, weekly `pg_cron` job
  (Mondays 09:00 UTC) that calls `find-prospects`.
- The problem isn't fake rows — it's that **nothing has progressed**. All 4 deals are still
  `searching`; 2 have a generated site; **0 have an email address**; 0 are published; nothing is
  closed. So every revenue figure is legitimately $0 and both charts render empty.
- No deal can be emailed today because `send-outreach` requires `deals.email`, and none is set.

**Gaps**
- `find-prospects` has **no UI trigger** — the only way it runs is the weekly cron. You can't search
  on demand from the app.
- No PWA (zero `manifest` / `serviceWorker` references).
- Publishing is fully built but hard-disabled: `GO_LIVE_ENABLED = false`. **Staying disabled per
  your decision.**

---

## Phase 0 — Stop the regression (do this first, before any other edit)

1. Pull the deployed production build down and make it the repo's `public/index.html`.
   (Already saved for reference at
   `/tmp/claude-0/-home-user-Sis-job/becf4599-4764-5fbc-a2aa-32c1b2844e0e/scratchpad/live-index.html`
   — re-fetch fresh at execution time in case it changed.)
2. Commit it **on its own**, with a message explaining it's a reconciliation of production → repo,
   so the drift is legible in history and never silently re-introduced.
3. Note in the commit that the earlier hardcoded-date fix (commit `37889bc`/`d1d477e`) was applied to
   the stale file and is **superseded** — it gets re-applied in Phase 1 against the correct base.
4. Add a short "Source of truth" note to `README.md`: production is authoritative until this
   reconciliation lands; always diff against the live URL before deploying Pages.

**Do not deploy anything in this phase.** This phase only makes the repo honest.

---

## Phase 1 — Fix the three live bugs

All in `public/index.html` (single-file app; keep it that way per project conventions).

1. **Error fallback** — replace the broken `DEALS = SEED_DEALS` line with a real empty-state:
   set `DEALS = []; MSGS = []`, still call the renderers, and surface a visible, dismissible banner
   ("Couldn't load your data — check connection and refresh"). Never leave a silent blank screen.
2. **Fake date** — replace all 3 `new Date('2026-08-16T00:00:00')` with `new Date()`.
3. **CSS variables** — map the 5 orphaned variables onto the current dark palette
   (`--forest`→`--green`, `--ink`→`--bg`, `--brass`/`--brass-dim`→`--amber`/`--amber-dim`,
   `--line-light`→`--border`), then visually confirm the Approve/Reject buttons and the New Search
   form are legible. Prefer reusing the existing tokens over inventing new ones.

**Verification:** load the app, confirm the dashboard date reads *today*; open DevTools and force a
failed Supabase request to confirm the banner appears instead of a `ReferenceError`; visually check
the Searching tab.

---

## Phase 2 — Make the numbers real

The app should never show a number it can't justify from the database.

1. **Audit every stat** on Dashboard / Income / Archive / Response against its source query. Anything
   not derived from real rows gets removed or replaced.
2. **Real empty states.** With 0 closed deals, revenue views and both charts are legitimately blank.
   Replace empty charts and `$0` tiles with honest, encouraging empty states ("No closed sales yet —
   your first one shows up here") rather than filler that implies activity.
3. **Add an email field to the deal UI.** Today `sendOutreach()` uses a raw `prompt()` to collect a
   missing address — workable but fragile. Add a proper inline email input on the deal card that
   PATCHes `deals.email`, so outreach isn't gated behind a browser prompt.

---

## Phase 3 — Close the loop to a real sale

1. **On-demand prospect search.** Add a "Run search now" button in the Searching tab that invokes
   `find-prospects` with the user's auth token, then refreshes the queue. Right now you wait until
   Monday. Reuse the existing `supa()` / `authHeaders()` helpers.
2. **Verify `MAILING_ADDRESS` is set.** `send-outreach` deliberately fails closed without it
   (CAN-SPAM). Confirm by invoking the function and checking for the specific config error before
   assuming outreach works.
3. **End-to-end outreach test** — to your *own* address, since Resend is still sandboxed. Confirm:
   email arrives, footer carries the physical address + unsubscribe link, `messages` row is logged,
   the deal advances `searching → sent`, and clicking unsubscribe flips `deals.unsubscribed` and
   causes a second send to be refused.
4. **Follow-up visibility.** The `follow_up_date` field and "Follow-up due" filter already exist; make
   overdue deals visually obvious on the dashboard so nothing stalls silently.

---

## Phase 4 — Domain-gated (blocked on you; I will not purchase anything)

Per the project's hard rules I won't provision any billing resource. When *you* have bought a domain,
this phase unblocks — it covers both remaining roadmap items at once:

1. Add the domain to Cloudflare; route it to the `dealflow-site-server` Worker; update
   `SITE_HOST_URL` in the frontend from the `workers.dev` URL to the branded one.
2. Verify the sending domain in Resend; update `FROM_ADDRESS` in `send-outreach` off
   `onboarding@resend.dev`. This is what lifts the sandbox restriction and lets you email **real
   prospects** instead of only your own inbox.
3. Only then revisit `GO_LIVE_ENABLED` — as a separate, explicitly confirmed decision.

**`GO_LIVE_ENABLED` stays `false` for the whole plan** unless you say otherwise. Publishing remains
impossible until you deliberately turn it on.

---

## Phase 5 — Polish

1. **PWA** — `manifest.json` + icons + a minimal service worker so the app installs to your home
   screen and opens like a native app. This is the last roadmap item and matters because you drive
   this from your phone.
2. **Deploy** — `npx wrangler pages deploy public --project-name=dealflow`, *only* after Phase 0 has
   landed and the repo is confirmed to be the newer build.

---

## Known issues noted but not scheduled

- **`live_sites` SECURITY DEFINER lint.** Attempted a fix earlier this session; it would have exposed
  every column (price, phone, email) of published deals to the public key, because `anon` holds
  Supabase's default table-wide grant on `deals` that a narrower column grant cannot revoke. Reverted;
  production is back to its original state. A correct fix means revoking that baseline grant and
  re-granting 3 columns — worth doing, but it changes the permission model of your main table and
  should be done deliberately with a published site to test against, not bundled into other work.
- **Service-role key stored in the `cron.job` command** in the database. Not in the repo (by design,
  per the `0001_init.sql` comment), but it is readable by anyone with database access. Worth rotating
  if DB access is ever shared.

---

## Verification (end of plan)

- `diff` the repo's `public/index.html` against the live URL → should be **identical** before any
  deploy, and intentionally-different-and-newer after.
- App loads with today's date, no console errors, legible buttons across all five tabs.
- `get_advisors(type: "security")` shows no *new* findings beyond the two known WARNs and the known
  `live_sites` ERROR.
- One full outreach round-trip to your own inbox, including a working unsubscribe.
- `deals.live` remains `0` throughout — nothing published, confirming the hard rule held.
