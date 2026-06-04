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

    const firstActiveFaculty = normalizedActiveFaculty[0]
      ? `${normalizedActiveFaculty[0].first_name} ${normalizedActiveFaculty[0].last_name}`.trim()
      : "";
    const lastActiveFaculty = normalizedActiveFaculty.at(-1)
      ? `${normalizedActiveFaculty.at(-1)?.first_name} ${normalizedActiveFaculty.at(-1)?.last_name}`.trim()
      : "";

    console.info(
      `[pubmed-audit] api_faculty_loaded total_rows=${facultyRows?.length ?? 0} active_rows=${normalizedActiveFaculty.length} first_active_faculty="${firstActiveFaculty}" last_active_faculty="${lastActiveFaculty}"`,
    );

    const { results, facultyErrors, audit } = await searchFacultyPublications(
      normalizedActiveFaculty,
      body.startDate,
      body.endDate,
    );
    const durationMs = Date.now() - runStartedAt;
    console.info(
      `[pubmed-debug] api_request_completed duration_ms=${durationMs} faculty_loaded=${audit.faculty_loaded} faculty_attempted=${audit.faculty_attempted} faculty_completed=${audit.faculty_completed} faculty_failed=${facultyErrors.length} result_count=${results.length}`,
    );

    return NextResponse.json({
      start_date: body.startDate ?? null,
      end_date: body.endDate ?? null,
      run_timestamp: new Date().toISOString(),
      faculty_count_loaded: audit.faculty_loaded,
      faculty_count_searched: audit.faculty_attempted,
      faculty_count_completed: audit.faculty_completed,
      faculty_count_failed: facultyErrors.length,
      result_count: results.length,
      duration_ms: durationMs,
      search_method: "hybrid_pubmed_orcid",
      faculty_errors: facultyErrors,
      audit,
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
