import { NextRequest, NextResponse } from "next/server";

import { searchFacultyPublications } from "@/lib/pubmed";
import { listFacultyRows } from "@/lib/supabase/client";
import { normalizeOrcid } from "@/lib/types/faculty";
import { PublicationSearchRequest } from "@/lib/types/publication-search";

export async function POST(request: NextRequest) {
  const runStartedAt = Date.now();
  try {
    const body = (await request.json()) as PublicationSearchRequest;
    console.info(
      `[pubmed-debug] api_request_received startDate="${body.startDate ?? "undefined"}" endDate="${body.endDate ?? "undefined"}"`,
    );

    const { data: facultyRows, error } = await listFacultyRows();
    if (error) {
      return NextResponse.json({ error }, { status: 500 });
    }

    const activeFaculty = (facultyRows ?? []).filter(
      (row) => row.status.trim().toUpperCase() === "ACTIVE",
    );
    const normalizedActiveFaculty = activeFaculty.map((row) => ({
      ...row,
      orcid: normalizeOrcid(row.orcid),
    }));

    const { results, facultyErrors } = await searchFacultyPublications(
      normalizedActiveFaculty,
      body.startDate,
      body.endDate,
    );
    const durationMs = Date.now() - runStartedAt;
    console.info(
      `[pubmed-debug] api_request_completed duration_ms=${durationMs} faculty_searched=${normalizedActiveFaculty.length} faculty_failed=${facultyErrors.length} result_count=${results.length}`,
    );

    return NextResponse.json({
      start_date: body.startDate ?? null,
      end_date: body.endDate ?? null,
      run_timestamp: new Date().toISOString(),
      faculty_count_searched: normalizedActiveFaculty.length,
      faculty_count_failed: facultyErrors.length,
      result_count: results.length,
      duration_ms: durationMs,
      search_method: "pubmed_author_only_resilient_details_fetch",
      faculty_errors: facultyErrors,
      results,
    });
  } catch (error) {
    const durationMs = Date.now() - runStartedAt;
    console.error(`[pubmed-error] api_request_failed duration_ms=${durationMs}`);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to run publication search.",
      },
      { status: 500 },
    );
  }
}
