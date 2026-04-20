# Global REACH Publications App

A first MVP scaffold for an internal admin/review tool to identify publications authored by network members with international co-authors.

## Tech Stack

- Next.js (App Router)
- TypeScript
- Tailwind CSS
- Supabase (Postgres + REST API)

## MVP Status (Current)

- Homepage with workflow cards
- Top navigation across app sections
- Faculty roster page with:
  - CSV upload and required-column validation
  - Save-to-Supabase action after validation
  - Success/error messaging for load/save
  - Preview of uploaded rows
  - Live list of currently stored faculty rows from Supabase
- Publication Search page with date range inputs and Run Search action for ACTIVE faculty
- PubMed matching backend with strict author + University of Michigan affiliation validation
- Results page table with filters for international_flag and confidence
- Placeholder Export page

## Required Faculty Roster Columns

- `email`
- `first_name`
- `last_name`
- `first_initial`
- `primary_department`
- `status`

## Supabase Setup

1. Create a Supabase project.
2. In Supabase SQL editor, run `docs/supabase-faculty-schema.sql`.
   - This creates a `public.faculty` table with the MVP roster fields.
3. Create local environment variables:

```bash
cp .env.local.example .env.local
```

4. Fill in values from Supabase **Settings → API**:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

> The app uses Supabase REST endpoints from the browser for this MVP. In a later step, move write operations to secure server endpoints/RPC with audit/version handling.

## Run Locally

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

## Faculty Roster Data Notes

- Current MVP behavior treats each roster upload as a refresh of the active list by upserting on `email`.
- Future enhancement should add true replacement logic (including row removals) and upload history/versioning in a transaction-safe flow.

## Future Scope (Not Included Yet)

- Persistent search run history and database-backed publication result storage.
- ORCID enrichment and stronger country normalization for international detection.
- Export workflows.
