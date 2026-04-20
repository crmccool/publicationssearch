# Global REACH Publications App

## Overview
This application is designed to support the University of Michigan Medical School Global REACH program by identifying publications authored by network members that include international co-authors.

The tool streamlines two key workflows:
1. Annual reporting of international scholarly activity
2. Ongoing identification of recent publications for communications (e.g., newsletters)

---

## Core Functionality (MVP)

### 1. Faculty Roster Input
- Upload a CSV of current network members
- Required fields:
  - email
  - first_name
  - last_name
  - first_initial
  - primary_department
  - status

- Only `ACTIVE` (and optionally `NEW`) faculty are included in searches

---

### 2. Publication Search (PubMed)
- Search publications using:
  - Last Name + First Initial
  - University of Michigan affiliation filter
  - User-defined date range

- Example query logic:
  - `"Smith J"[Author] AND "University of Michigan"[Affiliation]`

---

### 3. Critical Matching Rule
A publication is only considered valid if:

> The matched faculty author (based on name) is associated with a University of Michigan affiliation — not just any co-author on the paper.

This prevents false positives where:
- A different author shares the same name
- A co-author (not the target faculty) is affiliated with U-M

---

### 4. International Co-Author Detection
For each publication:
- Parse all author affiliations
- Identify non-U.S. affiliations
- Extract country names where possible
- Flag publications with international collaborators

---

### 5. Results & Review
In-app display includes:
- Faculty name
- Publication title
- Journal
- Publication date
- PubMed link
- Detected international countries
- Affiliation snippets (for validation)

Publications may be categorized as:
- High confidence (clear international collaboration)
- Needs review (ambiguous affiliation/country parsing)

---

### 6. Export
Users can download results as:
- Detailed publication dataset
- Faculty-level summary
- Country-level summary

Exports are intended for further cleanup, validation, and reporting.

---

## Key Design Principles

- Prioritize **accuracy over volume**
- Minimize false positives from author name ambiguity
- Make results **transparent and reviewable**
- Keep input simple (CSV-based roster)
- Support flexible date ranges (e.g., 30 days, 1 year, custom)

---

## Future Enhancements

- ORCID integration for improved author matching
- Saved searches (e.g., "Last 30 Days")
- Newsletter tagging / bookmarking
- Automated monthly digest
- Improved country/affiliation parsing
- UI filters (country, department, region)

---

## Tech Stack (Planned)

- Frontend: Next.js (React)
- Backend: Supabase (PostgreSQL, API, Auth)
- Data Source: PubMed (Entrez API)
- Hosting: Vercel

---

## Status

🚧 MVP in development
