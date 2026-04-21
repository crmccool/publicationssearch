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
- Hybrid PubMed + ORCID publication retrieval pipeline:
  - PubMed is the primary retrieval source using broad author + date-range queries
  - candidate records are filtered in code by name match and publication-level U-M affiliation
  - ORCID is used only as an optional identity/disambiguation support signal when present in PubMed metadata
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

## Publication Search Behavior (Hybrid Model)

- Search method is **hybrid_pubmed_orcid**.
- PubMed is the authoritative retrieval source.
  - Query pattern: `(\"Last First\"[Author] OR \"Last F\"[Author] OR \"Last F*\"[Author]) AND (date range)`.
  - University of Michigan terms are **not** included in the retrieval query to preserve broad recall.
- Candidate filtering is applied after retrieval:
  - strong author-name matching (last name + first initial / forename consistency)
  - publication-level U-M affiliation validation from all affiliations on the paper
- ORCID behavior:
  - optional ORCID column is still supported and normalized
  - ORCID is supplemental for confidence/disambiguation when matching identifiers are present in PubMed metadata
  - missing ORCID support evidence does not automatically discard a PubMed match
- International collaboration logic is publication-level:
  - U-M if affiliation contains `University of Michigan`, `Michigan Medicine`, or `Ann Arbor`
  - Domestic if affiliation includes U.S. terms or obvious state names/abbreviations
  - Otherwise classified as International
  - non-U.S. affiliations with unresolved country are marked `unknown`
- Known limitations:
  - common names can still produce ambiguous author matches
  - PubMed author identifiers and affiliation metadata are sometimes incomplete/inconsistent
  - country extraction is heuristic and may return `unknown` for noisy affiliation strings

## Future Scope (Not Included Yet)

- Persistent search run history and database-backed publication result storage.
- ORCID enrichment and stronger country normalization for international detection.
- Export workflows.
