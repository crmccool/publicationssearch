import { NextRequest, NextResponse } from "next/server";

import { searchFacultyPublications } from "@/lib/pubmed";
import { listFacultyRows } from "@/lib/supabase/client";
import { normalizeOrcid } from "@/lib/types/faculty";
import { PublicationSearchRequest } from "@/lib/types/publication-search";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as PublicationSearchRequest;

    const { data: facultyRows, error } = await listFacultyRows();
    if (error) {
      return NextResponse.json({ error }, { status: 500 });
    }

    const activeFaculty = (facultyRows ?? []).filter(
      (row) => row.status.trim().toUpperCase() === "ACTIVE",
    );
    const activeFacultyWithOrcid = activeFaculty
      .map((row) => ({
        ...row,
        orcid: normalizeOrcid(row.orcid),
      }))
      .filter((row) => Boolean(row.orcid));

    const results = await searchFacultyPublications(
      activeFacultyWithOrcid,
      body.startDate,
      body.endDate,
    );

    return NextResponse.json({
      start_date: body.startDate ?? null,
      end_date: body.endDate ?? null,
      run_timestamp: new Date().toISOString(),
      faculty_count_searched: activeFacultyWithOrcid.length,
      result_count: results.length,
      search_method: "ORCID",
      results,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to run publication search.",
      },
      { status: 500 },
    );
  }
}
