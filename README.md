# Sis-job

A small job-search tool built for one specific person: someone who can't
handle money-related tasks or complex/multi-step instructions, prefers work
with animals or kids but is open to anything appropriate, and should stay
away from fast food, gas stations, and similar high-turnover manual-labor
jobs. It searches real openings around Albuquerque, NM, filters out anything
that doesn't fit, tracks which specialized resume goes with which job, and
gives a simple board for tracking application status.

**What this tool does *not* do:** auto-submit applications on external job
sites. Real applications need her contact info, work history, and answers to
screening questions — getting any of that wrong on a real submission is worse
than not applying. Instead, the tool finds and ranks the right openings,
suggests which resume to use, and gives a one-click link to the original
posting so she (or you) can submit it after a quick look.

## How it works

- **Job search** — pulls current listings from the [Adzuna](https://developer.adzuna.com/) API for several targeted searches (kennel technician, pet care, veterinary assistant, childcare aide, camp counselor, library page, stock associate, housekeeping, etc.) around Albuquerque.
- **Filtering** — every listing is scored against `schema.sql`'s default profile:
  - **Hard excluded**: any employer/keyword on the blacklist (fast food chains, gas stations/convenience stores, waste/sanitation work) or any sign of cash/money handling (cashier, register, POS, till, cash handling). These never show up in the results.
  - **Boosted**: animal-care and childcare-focused roles, and simple/routine job titles (assistant, aide, technician, stocker, custodian, etc.).
  - **Soft penalty**: management, sales quotas/commission, licensing/CDL requirements, bookkeeping — things that add complexity.
  - All of this is editable from the **Preferences** tab — nothing is hardcoded in a way you can't change.
- **Resumes** — upload each specialized resume with a category (animal / childcare / retail / general); the tool suggests the best-fit resume for each job.
- **Applications board** — save a job, move it through saved → ready → applied → interview → offer/rejected, and jump straight to the posting to apply.

## Setup

You'll need a (free) [Cloudflare account](https://dash.cloudflare.com/sign-up) and a (free) [Adzuna developer account](https://developer.adzuna.com/) for the job-search API key.

```bash
npm install

# Log into Cloudflare (opens a browser)
npx wrangler login

# Create the database and resume storage bucket
npx wrangler d1 create sis-job-db      # copy the database_id into wrangler.toml
npx wrangler r2 bucket create sis-job-resumes

# Load the schema (default profile + tables)
npm run db:init:remote

# Set your Adzuna credentials (from https://developer.adzuna.com/)
npx wrangler secret put ADZUNA_APP_ID
npx wrangler secret put ADZUNA_APP_KEY

# Deploy
npm run deploy
```

For local development: `npm run db:init` (local DB) then `npm run dev`.

## Getting her resumes in

The easiest path: open this project in a Claude chat with the **Google
Drive** connector enabled (claude.ai → Settings → Connectors → Google
Drive → connect, then enable it for the chat). Point Claude at her resume
folder and ask it to download each file and upload it into the deployed
app via the **Resumes** tab (or directly into the `sis-job-resumes` R2
bucket) with the right category. Otherwise, upload them by hand from the
Resumes tab — no Drive access required.

## First run

1. Deploy, then open the app and go to **Preferences** to confirm the
   defaults still match her situation (they're set from the description used
   to build this tool — no cash handling, simple tasks, animals/kids
   preferred, no fast food/gas stations).
2. Upload her resumes under **Resumes**.
3. Go to **Job Matches** and click **Refresh job search**.
4. Save the ones that look right, pick the matching resume, open the
   posting, and apply.

## Starter list (found while building this, August 2026)

A few real openings already spotted in Albuquerque that fit the profile —
worth checking even before the first automated refresh:

- **Kennel Technician** — Pet BnD Albuquerque, ~$14–17/hr
- **Pet Care Assistant** — Ashley's Pawsitive Pet Care, from ~$16/hr
- **Kennel Technician** — Petroglyph & Coronado Pet Hospitals
- **Animal Care Technician** — Bernalillo County, ~$15.55–20.01/hr
- **Donation Receiving Specialist** — Animal Humane New Mexico, from ~$17/hr (check whether this role handles cash donations before applying)

Pay and availability change fast — verify current status before applying.
