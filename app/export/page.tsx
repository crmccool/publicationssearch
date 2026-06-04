"use client";

import { useEffect, useMemo, useState } from "react";

import {
  InternationalFlag,
  PublicationConfidence,
  PublicationMatchSource,
  PublicationSearchAudit,
  PublicationSearchMethod,
  RESULTS_STORAGE_KEY,
} from "@/lib/types/publication-search";

type ExportPublicationResult = {
  faculty_name: string;
  title: string;
  publication_date: string;
  PMID: string;
  international_flag: InternationalFlag | "";
  international_countries: string;
  has_lmic_country: boolean | null;
  lmic_countries: string;
  confidence: PublicationConfidence | "";
  orcid_used: boolean | null;
  orcid_match: boolean | null;
  match_source: PublicationMatchSource | "";
};

type ExportRunSummary = {
  start_date: string | null;
  end_date: string | null;
  run_timestamp?: string;
  faculty_count_loaded?: number;
  faculty_count_searched?: number;
  faculty_count_completed?: number;
  faculty_count_failed?: number;
  result_count?: number;
  search_method?: PublicationSearchMethod;
};

type ExportSearchAudit = Partial<PublicationSearchAudit>;

type LoadedExportPayload = {
  results: ExportPublicationResult[];
  runSummary: ExportRunSummary | null;
  audit: ExportSearchAudit | null;
  error: string | null;
};

type CsvValue = string | number | boolean | null | undefined;

type CsvRow = Record<string, CsvValue>;

const EMPTY_EXPORT_PAYLOAD: LoadedExportPayload = {
  results: [],
  runSummary: null,
  audit: null,
  error: null,
};

const RESULTS_CSV_COLUMNS = [
  "faculty",
  "title",
  "publication_date",
  "pmid",
  "pubmed_url",
  "international_flag",
  "international_countries",
  "lmic",
  "confidence",
  "orcid_used",
  "orcid_match",
  "match_source",
] as const;

const SUMMARY_CSV_COLUMNS = [
  "start_date",
  "end_date",
  "run_time",
  "faculty_loaded",
  "faculty_attempted",
  "faculty_completed",
  "faculty_failed",
  "total_results",
  "international_results",
  "faculty_with_international_results",
  "unique_countries_represented",
  "search_method",
  "first_faculty_attempted",
  "last_faculty_attempted",
  "early_exit_reason",
  "faculty_with_orcid",
  "orcid_searches_attempted",
  "orcid_pmids_found",
  "results_confirmed_by_orcid",
  "faculty_with_orcid_but_no_orcid_pmids",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringOrFallback(value: unknown, fallback = ""): string {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
      .join("; ");
  }

  return fallback;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeInternationalFlag(value: unknown): InternationalFlag | "" {
  return value === "true" || value === "false" || value === "unknown" ? value : "";
}

function normalizeConfidence(value: unknown): PublicationConfidence | "" {
  return value === "high" || value === "medium" || value === "high_orcid" ? value : "";
}

function normalizeMatchSource(value: unknown): PublicationMatchSource | "" {
  return value === "name" || value === "orcid" || value === "both" ? value : "";
}

function normalizeResult(value: unknown): ExportPublicationResult | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    faculty_name: stringOrFallback(value.faculty_name),
    title: stringOrFallback(value.title),
    publication_date: stringOrFallback(value.publication_date),
    PMID: stringOrFallback(value.PMID),
    international_flag: normalizeInternationalFlag(value.international_flag),
    international_countries: stringOrFallback(value.international_countries),
    has_lmic_country: typeof value.has_lmic_country === "boolean" ? value.has_lmic_country : null,
    lmic_countries: stringOrFallback(value.lmic_countries),
    confidence: normalizeConfidence(value.confidence),
    orcid_used: typeof value.orcid_used === "boolean" ? value.orcid_used : null,
    orcid_match: typeof value.orcid_match === "boolean" ? value.orcid_match : null,
    match_source: normalizeMatchSource(value.match_source),
  };
}

function normalizeResults(value: unknown): ExportPublicationResult[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  return value.flatMap((item) => {
    const normalized = normalizeResult(item);
    return normalized ? [normalized] : [];
  });
}

function normalizeRunSummary(value: unknown): ExportRunSummary | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    start_date: nullableString(value.start_date),
    end_date: nullableString(value.end_date),
    run_timestamp: typeof value.run_timestamp === "string" ? value.run_timestamp : undefined,
    faculty_count_loaded: optionalNumber(value.faculty_count_loaded),
    faculty_count_searched: optionalNumber(value.faculty_count_searched),
    faculty_count_completed: optionalNumber(value.faculty_count_completed),
    faculty_count_failed: optionalNumber(value.faculty_count_failed),
    result_count: optionalNumber(value.result_count),
    search_method:
      value.search_method === "hybrid_pubmed_orcid" ||
      value.search_method === "pubmed_author_only_resilient_details_fetch"
        ? value.search_method
        : undefined,
  };
}

function normalizeAudit(value: unknown): ExportSearchAudit | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    faculty_loaded: optionalNumber(value.faculty_loaded),
    faculty_attempted: optionalNumber(value.faculty_attempted),
    faculty_completed: optionalNumber(value.faculty_completed),
    faculty_failed: optionalNumber(value.faculty_failed),
    total_publications_found: optionalNumber(value.total_publications_found),
    total_publications_saved: optionalNumber(value.total_publications_saved),
    first_faculty_attempted: nullableString(value.first_faculty_attempted),
    last_faculty_attempted: nullableString(value.last_faculty_attempted),
    faculty_processing_order: Array.isArray(value.faculty_processing_order)
      ? value.faculty_processing_order.filter((item): item is string => typeof item === "string")
      : undefined,
    early_exit_reason: nullableString(value.early_exit_reason),
    faculty_with_orcid: optionalNumber(value.faculty_with_orcid),
    orcid_searches_attempted: optionalNumber(value.orcid_searches_attempted),
    orcid_pmids_found: optionalNumber(value.orcid_pmids_found),
    results_confirmed_by_orcid: optionalNumber(value.results_confirmed_by_orcid),
    faculty_with_orcid_but_no_orcid_pmids: optionalNumber(
      value.faculty_with_orcid_but_no_orcid_pmids,
    ),
  };
}

function loadStoredResults(raw: string | null): LoadedExportPayload {
  if (!raw) {
    return EMPTY_EXPORT_PAYLOAD;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;

    if (Array.isArray(parsed)) {
      return {
        results: normalizeResults(parsed) ?? [],
        runSummary: null,
        audit: null,
        error: null,
      };
    }

    if (!isRecord(parsed)) {
      return {
        ...EMPTY_EXPORT_PAYLOAD,
        error: "Saved search results were not in a format this page can export.",
      };
    }

    if (typeof parsed.error === "string") {
      return {
        ...EMPTY_EXPORT_PAYLOAD,
        error: `The saved search ended with an error: ${parsed.error}`,
      };
    }

    const results = normalizeResults(parsed.results);
    if (!results) {
      return {
        results: [],
        runSummary: normalizeRunSummary(parsed.run_summary),
        audit: normalizeAudit(parsed.audit),
        error: "Saved search results were missing a valid results list.",
      };
    }

    return {
      results,
      runSummary: normalizeRunSummary(parsed.run_summary),
      audit: normalizeAudit(parsed.audit),
      error: null,
    };
  } catch {
    return {
      ...EMPTY_EXPORT_PAYLOAD,
      error: "Saved search results could not be parsed. Please run the search again.",
    };
  }
}

function splitCountries(value: string | null | undefined): string[] {
  return (value ?? "")
    .split(";")
    .map((country) => country.trim())
    .filter((country) => country.length > 0);
}

function escapeCsvValue(value: CsvValue): string {
  if (value === null || value === undefined) {
    return "";
  }

  const text = String(value);
  if (/[",;\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

function buildCsv(columns: readonly string[], rows: CsvRow[]): string {
  const header = columns.map(escapeCsvValue).join(",");
  const body = rows.map((row) => columns.map((column) => escapeCsvValue(row[column])).join(","));

  return [header, ...body].join("\r\n");
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function sanitizeFilenamePart(value: string | null | undefined, fallback: string): string {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
}

function timestampForFilename(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, "-").replace(/Z$/, "Z");
}

function buildFilename(prefix: string, runSummary: ExportRunSummary | null): string {
  const startDate = sanitizeFilenamePart(runSummary?.start_date, "any-start-date");
  const endDate = sanitizeFilenamePart(runSummary?.end_date, "any-end-date");

  return `${prefix}_${startDate}_to_${endDate}_${timestampForFilename()}.csv`;
}

function buildPubMedUrl(pmid: string): string {
  return pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` : "";
}

function resultToCsvRow(result: ExportPublicationResult): CsvRow {
  return {
    faculty: result.faculty_name,
    title: result.title,
    publication_date: result.publication_date,
    pmid: result.PMID,
    pubmed_url: buildPubMedUrl(result.PMID),
    international_flag: result.international_flag,
    international_countries: result.international_countries,
    lmic:
      result.has_lmic_country === null
        ? ""
        : result.has_lmic_country
          ? result.lmic_countries || "Yes"
          : "No",
    confidence: result.confidence,
    orcid_used: result.orcid_used,
    orcid_match: result.orcid_match,
    match_source: result.match_source,
  };
}

function buildSummaryRow(
  results: ExportPublicationResult[],
  runSummary: ExportRunSummary | null,
  audit: ExportSearchAudit | null,
): CsvRow {
  const internationalResults = results.filter((result) => result.international_flag === "true");
  const facultyWithInternationalResults = new Set(
    internationalResults
      .map((result) => result.faculty_name.trim())
      .filter((facultyName) => facultyName.length > 0),
  );
  const uniqueCountries = new Set<string>();

  internationalResults.forEach((result) => {
    splitCountries(result.international_countries)
      .filter((country) => country.toLowerCase() !== "unknown")
      .forEach((country) => uniqueCountries.add(country));
  });

  return {
    start_date: runSummary?.start_date,
    end_date: runSummary?.end_date,
    run_time: runSummary?.run_timestamp,
    faculty_loaded: audit?.faculty_loaded ?? runSummary?.faculty_count_loaded,
    faculty_attempted: audit?.faculty_attempted ?? runSummary?.faculty_count_searched,
    faculty_completed: audit?.faculty_completed ?? runSummary?.faculty_count_completed,
    faculty_failed: audit?.faculty_failed ?? runSummary?.faculty_count_failed,
    total_results: runSummary?.result_count ?? results.length,
    international_results: internationalResults.length,
    faculty_with_international_results: facultyWithInternationalResults.size,
    unique_countries_represented: uniqueCountries.size,
    search_method: runSummary?.search_method,
    first_faculty_attempted: audit?.first_faculty_attempted,
    last_faculty_attempted: audit?.last_faculty_attempted,
    early_exit_reason: audit?.early_exit_reason,
    faculty_with_orcid: audit?.faculty_with_orcid,
    orcid_searches_attempted: audit?.orcid_searches_attempted,
    orcid_pmids_found: audit?.orcid_pmids_found,
    results_confirmed_by_orcid: audit?.results_confirmed_by_orcid,
    faculty_with_orcid_but_no_orcid_pmids: audit?.faculty_with_orcid_but_no_orcid_pmids,
  };
}

export default function ExportPage() {
  const [payload, setPayload] = useState<LoadedExportPayload>(EMPTY_EXPORT_PAYLOAD);

  useEffect(() => {
    try {
      setPayload(loadStoredResults(sessionStorage.getItem(RESULTS_STORAGE_KEY)));
    } catch {
      setPayload({
        ...EMPTY_EXPORT_PAYLOAD,
        error: "Your browser blocked access to saved search results. Please run the search again.",
      });
    }
  }, []);

  const hasResults = payload.results.length > 0;
  const summaryRow = useMemo(
    () => buildSummaryRow(payload.results, payload.runSummary, payload.audit),
    [payload.audit, payload.results, payload.runSummary],
  );

  const handleDownloadResults = () => {
    const csv = buildCsv(RESULTS_CSV_COLUMNS, payload.results.map(resultToCsvRow));
    downloadCsv(buildFilename("publication_results", payload.runSummary), csv);
  };

  const handleDownloadSummary = () => {
    const csv = buildCsv(SUMMARY_CSV_COLUMNS, [summaryRow]);
    downloadCsv(buildFilename("publication_search_summary", payload.runSummary), csv);
  };

  return (
    <section className="card">
      <h1 className="text-2xl font-bold text-slate-900">Export</h1>
      <p className="mt-3 text-sm text-slate-600">
        Download the latest publication search results saved in this browser session. Export is
        client-side for now and uses the same saved search payload as the Results page.
      </p>

      {payload.error ? (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-semibold">We could not prepare an export from the saved search.</p>
          <p className="mt-1">{payload.error}</p>
        </div>
      ) : null}

      {!hasResults ? (
        <div className="mt-5 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          No search results available to export. Run a publication search first.
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
            <p className="font-semibold">Ready to export {payload.results.length} result rows.</p>
            <p className="mt-1">
              CSV downloads include blank cells for missing values and quote values that contain
              commas, quotes, semicolons, or line breaks.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={handleDownloadResults}
              className="rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
            >
              Download results CSV
            </button>
            <button
              type="button"
              onClick={handleDownloadSummary}
              className="rounded-md border border-blue-700 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"
            >
              Download search summary CSV
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
