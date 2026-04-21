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
- ORCID-driven publication retrieval pipeline:
  - fetch works from ORCID public API
  - resolve PMID directly or via DOI search in PubMed
  - fetch PubMed metadata and classify international collaborations from all affiliations
- Results page table with filters for international_flag and confidence
- Placeholder Export page

## Required Faculty Roster Columns

- `email`
- `first_name`
- `last_name`
- `first_initial`
- `primary_department`
- `status`

### Optional Faculty Roster Columns

- `orcid`
  - Supports either `https://orcid.org/0000-0000-0000-0000` or bare `0000-0000-0000-0000`.
  - Values are normalized and stored internally as the bare ORCID ID.

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

## Publication Search Behavior (Test Phase)

- Search method is **ORCID-only** for this controlled validation phase.
- ACTIVE faculty with missing ORCID are intentionally skipped.
- Name-based PubMed author search is temporarily disabled when using this ORCID-enabled flow.
- Known gaps:
  - Some ORCID works do not include PMID.
  - DOI-to-PMID mapping via PubMed E-utilities is incomplete for non-indexed works.

## Future Scope (Not Included Yet)

- Persistent search run history and database-backed publication result storage.
- ORCID enrichment and stronger country normalization for international detection.
- Export workflows.
