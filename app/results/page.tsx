"use client";

import { useEffect, useMemo, useState } from "react";

import {
  InternationalFlag,
  PublicationConfidence,
  PublicationSearchAudit,
  PublicationMatchSource,
  PublicationSearchResult,
  PublicationSearchRunSummary,
  RESULTS_STORAGE_KEY,
} from "@/lib/types/publication-search";

type LoadedResultsPayload = {
  results: PublicationSearchResult[];
  runSummary: PublicationSearchRunSummary | null;
  audit: PublicationSearchAudit | null;
  error: string | null;
};

const EMPTY_LOADED_PAYLOAD: LoadedResultsPayload = {
  results: [],
  runSummary: null,
  audit: null,
  error: null,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringOrFallback(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberOrFallback(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeInternationalFlag(value: unknown): InternationalFlag {
  return value === "true" || value === "false" || value === "unknown" ? value : "unknown";
}

function normalizeConfidence(value: unknown): PublicationConfidence {
  return value === "high" || value === "medium" || value === "high_orcid" ? value : "medium";
}

function normalizeMatchSource(value: unknown): PublicationMatchSource {
  return value === "name" || value === "orcid" || value === "both" ? value : "name";
}

function normalizeResult(value: unknown): PublicationSearchResult | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    faculty_name: stringOrFallback(value.faculty_name, "Unknown faculty"),
    title: stringOrFallback(value.title, "Untitled publication"),
    publication_date: stringOrFallback(value.publication_date, "Unknown date"),
    PMID: stringOrFallback(value.PMID),
    international_flag: normalizeInternationalFlag(value.international_flag),
    international_countries: stringOrFallback(value.international_countries, "Unknown"),
    has_lmic_country: value.has_lmic_country === true,
    lmic_countries: stringOrFallback(value.lmic_countries),
    confidence: normalizeConfidence(value.confidence),
    orcid_used: value.orcid_used === true,
    orcid_match: value.orcid_match === true,
    match_source: normalizeMatchSource(value.match_source),
  };
}

function normalizeResults(value: unknown): PublicationSearchResult[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  return value.flatMap((item) => {
    const normalized = normalizeResult(item);
    return normalized ? [normalized] : [];
  });
}

function normalizeRunSummary(value: unknown): PublicationSearchRunSummary | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    start_date: nullableString(value.start_date),
    end_date: nullableString(value.end_date),
    run_timestamp: stringOrFallback(value.run_timestamp, new Date().toISOString()),
    faculty_count_loaded:
      typeof value.faculty_count_loaded === "number" ? value.faculty_count_loaded : undefined,
    faculty_count_searched: numberOrFallback(value.faculty_count_searched),
    faculty_count_completed:
      typeof value.faculty_count_completed === "number" ? value.faculty_count_completed : undefined,
    faculty_count_failed:
      typeof value.faculty_count_failed === "number" ? value.faculty_count_failed : undefined,
    result_count: numberOrFallback(value.result_count),
    search_method:
      value.search_method === "hybrid_pubmed_orcid" ||
      value.search_method === "pubmed_author_only_resilient_details_fetch"
        ? value.search_method
        : "hybrid_pubmed_orcid",
  };
}

function normalizeAudit(value: unknown): PublicationSearchAudit | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    faculty_loaded: numberOrFallback(value.faculty_loaded),
    faculty_attempted: numberOrFallback(value.faculty_attempted),
    faculty_completed: numberOrFallback(value.faculty_completed),
    faculty_failed: numberOrFallback(value.faculty_failed),
    total_publications_found: numberOrFallback(value.total_publications_found),
    total_publications_saved: numberOrFallback(value.total_publications_saved),
    first_faculty_attempted: nullableString(value.first_faculty_attempted),
    last_faculty_attempted: nullableString(value.last_faculty_attempted),
    faculty_processing_order: Array.isArray(value.faculty_processing_order)
      ? value.faculty_processing_order.filter((item): item is string => typeof item === "string")
      : [],
    early_exit_reason: nullableString(value.early_exit_reason),
    faculty_with_orcid: numberOrFallback(value.faculty_with_orcid),
    orcid_searches_attempted: numberOrFallback(value.orcid_searches_attempted),
    orcid_pmids_found: numberOrFallback(value.orcid_pmids_found),
    results_confirmed_by_orcid: numberOrFallback(value.results_confirmed_by_orcid),
    faculty_with_orcid_but_no_orcid_pmids: numberOrFallback(
      value.faculty_with_orcid_but_no_orcid_pmids,
    ),
  };
}

function loadStoredResults(raw: string | null): LoadedResultsPayload {
  if (!raw) {
    return EMPTY_LOADED_PAYLOAD;
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
        ...EMPTY_LOADED_PAYLOAD,
        error: "Saved search results were not in a format this page can read.",
      };
    }

    if (typeof parsed.error === "string") {
      return {
        ...EMPTY_LOADED_PAYLOAD,
        error: `The saved search ended with an error: ${parsed.error}`,
      };
    }

    const results = normalizeResults(parsed.results);
    if (!results) {
      return {
        runSummary: normalizeRunSummary(parsed.run_summary),
        audit: normalizeAudit(parsed.audit),
        results: [],
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
      ...EMPTY_LOADED_PAYLOAD,
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

export default function ResultsPage() {
  const [results, setResults] = useState<PublicationSearchResult[]>([]);
  const [runSummary, setRunSummary] = useState<PublicationSearchRunSummary | null>(null);
  const [audit, setAudit] = useState<PublicationSearchAudit | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [internationalFilter, setInternationalFilter] = useState<"all" | InternationalFlag>("true");
  const [confidenceFilter, setConfidenceFilter] = useState<"all" | PublicationConfidence>("all");
  const [countryFilter, setCountryFilter] = useState("all");

  useEffect(() => {
    try {
      const loaded = loadStoredResults(sessionStorage.getItem(RESULTS_STORAGE_KEY));
      setResults(loaded.results);
      setRunSummary(loaded.runSummary);
      setAudit(loaded.audit);
      setLoadError(loaded.error);
    } catch {
      setResults([]);
      setRunSummary(null);
      setAudit(null);
      setLoadError("Your browser blocked access to saved search results. Please run the search again.");
    }
  }, []);

  const formatDateRange = (date: string | null) => {
    if (!date) {
      return "Any date";
    }

    const parsedDate = new Date(`${date}T00:00:00`);
    return Number.isNaN(parsedDate.getTime()) ? "Any date" : parsedDate.toLocaleDateString();
  };

  const formatRunTimestamp = (timestamp: string) => {
    const parsedTimestamp = new Date(timestamp);
    if (Number.isNaN(parsedTimestamp.getTime())) {
      return "Unknown run time";
    }

    return parsedTimestamp.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  };

  const filteredResults = useMemo(
    () =>
      results.filter((result) => {
        const internationalMatches =
          internationalFilter === "all" || result.international_flag === internationalFilter;
        const confidenceMatches =
          confidenceFilter === "all" || result.confidence === confidenceFilter;
        const countries = splitCountries(result.international_countries);
        const countryMatches = countryFilter === "all" || countries.includes(countryFilter);

        return internationalMatches && confidenceMatches && countryMatches;
      }),
    [results, internationalFilter, confidenceFilter, countryFilter],
  );

  const countryOptions = useMemo(() => {
    const countries = new Set<string>();

    results.forEach((result) => {
      splitCountries(result.international_countries).forEach((country) => countries.add(country));
    });

    return [...countries].sort((a, b) => a.localeCompare(b));
  }, [results]);

  const internationalResultCount = useMemo(
    () => results.filter((result) => result.international_flag === "true").length,
    [results],
  );

  const facultyWithInternationalResultsCount = useMemo(() => {
    const facultyNames = new Set<string>();

    results
      .filter((result) => result.international_flag === "true")
      .forEach((result) => {
        const facultyName = result.faculty_name.trim();
        if (facultyName.length > 0) {
          facultyNames.add(facultyName);
        }
      });

    return facultyNames.size;
  }, [results]);

  const uniqueInternationalCountriesCount = useMemo(() => {
    const countries = new Set<string>();

    results
      .filter((result) => result.international_flag === "true")
      .forEach((result) => {
        splitCountries(result.international_countries)
          .filter((country) => country.toLowerCase() !== "unknown")
          .forEach((country) => countries.add(country));
      });

    return countries.size;
  }, [results]);

  return (
    <section className="card">
      <h1 className="text-2xl font-bold text-slate-900">Results</h1>
      <p className="mt-2 text-sm text-slate-600">
        Review hybrid PubMed-first publication matches and filter by international status and
        confidence.
      </p>
      {loadError ? (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-semibold">We could not load the saved search results.</p>
          <p className="mt-1">{loadError}</p>
        </div>
      ) : null}
      {runSummary ? (
        <div className="mt-4 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          <p className="font-semibold">Search run summary</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>
              Date range: {formatDateRange(runSummary.start_date)} to{" "}
              {formatDateRange(runSummary.end_date)}
            </li>
            <li>Run time: {formatRunTimestamp(runSummary.run_timestamp)}</li>
            <li>Faculty loaded: {runSummary.faculty_count_loaded ?? runSummary.faculty_count_searched}</li>
            <li>Faculty attempted: {runSummary.faculty_count_searched}</li>
            <li>Faculty completed: {runSummary.faculty_count_completed ?? runSummary.faculty_count_searched}</li>
            <li>Faculty failed: {runSummary.faculty_count_failed ?? 0}</li>
            <li>Total results: {runSummary.result_count}</li>
            <li>International results: {internationalResultCount}</li>
            <li>Faculty with international results: {facultyWithInternationalResultsCount}</li>
            <li>Unique countries represented: {uniqueInternationalCountriesCount}</li>
            <li>Search method: {runSummary.search_method}</li>
            {audit ? (
              <>
                <li>First faculty attempted: {audit.first_faculty_attempted ?? "None"}</li>
                <li>Last faculty attempted: {audit.last_faculty_attempted ?? "None"}</li>
                <li>Early exit reason: {audit.early_exit_reason ?? "None"}</li>
                <li>Faculty with ORCID: {audit.faculty_with_orcid}</li>
                <li>ORCID searches attempted: {audit.orcid_searches_attempted}</li>
                <li>ORCID PMIDs found: {audit.orcid_pmids_found}</li>
                <li>Results confirmed by ORCID: {audit.results_confirmed_by_orcid}</li>
                <li>Faculty with ORCID but no ORCID PMIDs: {audit.faculty_with_orcid_but_no_orcid_pmids}</li>
              </>
            ) : null}
          </ul>
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <label className="text-sm text-slate-700">
          Filter by international_flag
          <select
            value={internationalFilter}
            onChange={(event) =>
              setInternationalFilter(event.target.value as "all" | InternationalFlag)
            }
            className="mt-2 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="all">All</option>
            <option value="true">true</option>
            <option value="false">false</option>
            <option value="unknown">unknown</option>
          </select>
        </label>

        <label className="text-sm text-slate-700">
          Filter by confidence
          <select
            value={confidenceFilter}
            onChange={(event) => setConfidenceFilter(event.target.value as "all" | PublicationConfidence)}
            className="mt-2 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="all">All</option>
            <option value="high">high</option>
            <option value="medium">medium</option>
            <option value="high_orcid">high_orcid</option>
          </select>
        </label>

        <label className="text-sm text-slate-700">
          Filter by country
          <select
            value={countryFilter}
            onChange={(event) => setCountryFilter(event.target.value)}
            className="mt-2 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="all">All countries</option>
            {countryOptions.map((country) => (
              <option key={country} value={country}>
                {country}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="mt-3 text-xs text-slate-500">
        Showing {filteredResults.length} of {results.length} result(s).
      </p>

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-100 text-left">
              <th className="px-3 py-2 font-semibold text-slate-700">Faculty</th>
              <th className="px-3 py-2 font-semibold text-slate-700">Title</th>
              <th className="px-3 py-2 font-semibold text-slate-700">Publication Date</th>
              <th className="px-3 py-2 font-semibold text-slate-700">PMID</th>
              <th className="px-3 py-2 font-semibold text-slate-700">international_flag</th>
              <th className="px-3 py-2 font-semibold text-slate-700">international_countries</th>
              <th className="px-3 py-2 font-semibold text-slate-700">LMIC</th>
              <th className="px-3 py-2 font-semibold text-slate-700">confidence</th>
              <th className="px-3 py-2 font-semibold text-slate-700">ORCID used?</th>
              <th className="px-3 py-2 font-semibold text-slate-700">ORCID match?</th>
              <th className="px-3 py-2 font-semibold text-slate-700">Match source</th>
            </tr>
          </thead>
          <tbody>
            {filteredResults.length === 0 ? (
              <tr>
                <td className="px-3 py-3 text-slate-500" colSpan={11}>
                  No results yet. Run a publication search to populate this table.
                </td>
              </tr>
            ) : (
              filteredResults.map((result, index) => (
                <tr key={`${result.PMID || "missing-pmid"}-${result.faculty_name}-${index}`} className="border-b border-slate-100">
                  <td className="px-3 py-2 align-top text-slate-700">{result.faculty_name}</td>
                  <td className="px-3 py-2 align-top text-slate-700">
                    {result.PMID ? (
                      <a
                        href={`https://pubmed.ncbi.nlm.nih.gov/${result.PMID}/`}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-blue-700 underline-offset-2 hover:underline"
                      >
                        {result.title}
                      </a>
                    ) : (
                      result.title
                    )}
                  </td>
                  <td className="px-3 py-2 align-top text-slate-700">{result.publication_date}</td>
                  <td className="px-3 py-2 align-top text-slate-700">{result.PMID || "Unknown"}</td>
                  <td className="px-3 py-2 align-top text-slate-700">{result.international_flag}</td>
                  <td className="px-3 py-2 align-top text-slate-700">
                    {result.international_countries || "Unknown"}
                  </td>
                  <td className="px-3 py-2 align-top text-slate-700">
                    {result.has_lmic_country ? "Yes" : "No"}
                  </td>
                  <td className="px-3 py-2 align-top text-slate-700">{result.confidence}</td>
                  <td className="px-3 py-2 align-top text-slate-700">{result.orcid_used ? "Yes" : "No"}</td>
                  <td className="px-3 py-2 align-top text-slate-700">{result.orcid_match ? "Yes" : "No"}</td>
                  <td className="px-3 py-2 align-top text-slate-700">{result.match_source}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
