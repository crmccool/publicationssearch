# Global REACH Publications App

A first MVP scaffold for an internal admin/review tool to identify publications authored by network members with international co-authors.

## Tech Stack

- Next.js (App Router)
- TypeScript
- Tailwind CSS

## Implemented in this MVP

- Homepage with workflow cards
- Top navigation across app sections
- Faculty roster upload page with:
  - CSV file upload
  - Required-column validation
  - Friendly validation errors
  - Table preview of uploaded rows
- Placeholder pages for Publication Search, Results, and Export
- Comments in code for planned PubMed and Supabase integration points

## Required Faculty Roster Columns

- `email`
- `first_name`
- `last_name`
- `first_initial`
- `primary_department`
- `status`

## Run Locally

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

## Notes for Future Implementation

- PubMed matching will use `last_name + first_initial` and University of Michigan affiliation criteria.
- A publication should only count when the matched faculty author (not only another co-author) is tied to U-M affiliation.
- Supabase will be used for roster storage, run tracking, and results persistence.
