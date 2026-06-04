"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  InternationalFlag,
  PublicationConfidence,
  PublicationSearchAudit,
  PublicationSearchMethod,
  PublicationMatchSource,
  PublicationSearchResult,
  PublicationSearchRunSummary,
  RESULTS_STORAGE_KEY,
} from "@/lib/types/publication-search";

type PublicationSearchApiPayload = {
  start_date?: string | null;
  end_date?: string | null;
  run_timestamp?: string;
  faculty_count_loaded?: number;
  faculty_count_searched?: number;
  faculty_count_completed?: number;
  faculty_count_failed?: number;
  result_count?: number;
  search_method?: PublicationSearchMethod;
  audit?: PublicationSearchAudit | null;
  results?: unknown;
  error?: unknown;
};

type Message = {
  kind: "error" | "success";
  text: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function getErrorMessage(raw: string, fallback: string): string {
  const parsed = parseJsonObject(raw);
  if (typeof parsed?.error === "string" && parsed.error.trim().length > 0) {
    return parsed.error;
  }

  if (raw.trim().length > 0) {
    return raw.slice(0, 200);
  }

  return fallback;
}

function stringOrFallback(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
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

function normalizeApiResult(value: unknown): PublicationSearchResult | null {
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

function normalizeApiResults(value: unknown): PublicationSearchResult[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  return value.flatMap((item) => {
    const normalized = normalizeApiResult(item);
    return normalized ? [normalized] : [];
  });
}

export default function SearchPage() {
  const router = useRouter();
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [message, setMessage] = useState<Message | null>(null);

  const handleRunSearch = async () => {
    setMessage(null);

    if (startDate && endDate && startDate > endDate) {
      setMessage({
        kind: "error",
        text: "Start date must be on or before end date.",
      });
      return;
    }

    setIsRunning(true);
    setMessage({
      kind: "success",
      text: "Running publication search. This may take a moment...",
    });

    try {
      const response = await fetch("/api/publication-search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          startDate: startDate || undefined,
          endDate: endDate || undefined,
        }),
      });

      const rawResponse = await response.text();

      if (!response.ok) {
        setMessage({
          kind: "error",
          text: getErrorMessage(rawResponse, "Publication search failed. Please try again."),
        });
        return;
      }

      const parsedPayload = parseJsonObject(rawResponse);
      if (!parsedPayload) {
        setMessage({
          kind: "error",
          text: "Publication search returned an unreadable response. Please try again.",
        });
        return;
      }

      const payload = parsedPayload as PublicationSearchApiPayload;
      if (typeof payload.error === "string" && payload.error.trim().length > 0) {
        setMessage({
          kind: "error",
          text: payload.error,
        });
        return;
      }

      const results = normalizeApiResults(payload.results);
      if (!results) {
        setMessage({
          kind: "error",
          text: "Publication search completed, but the response did not include a valid results list.",
        });
        return;
      }

      const runSummary: PublicationSearchRunSummary = {
        start_date: payload.start_date ?? null,
        end_date: payload.end_date ?? null,
        run_timestamp: payload.run_timestamp ?? new Date().toISOString(),
        faculty_count_loaded: payload.faculty_count_loaded,
        faculty_count_searched: payload.faculty_count_searched ?? 0,
        faculty_count_completed: payload.faculty_count_completed,
        faculty_count_failed: payload.faculty_count_failed,
        result_count: payload.result_count ?? results.length,
        search_method: payload.search_method ?? "hybrid_pubmed_orcid",
      };

      const storedPayload = {
        run_summary: runSummary,
        audit: payload.audit ?? undefined,
        results,
      };

      try {
        sessionStorage.setItem(RESULTS_STORAGE_KEY, JSON.stringify(storedPayload));
      } catch {
        setMessage({
          kind: "error",
          text: "Search completed, but your browser could not save the results for display.",
        });
        return;
      }

      router.push("/results");
    } catch (error) {
      setIsRunning(false);
      setMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "Publication search failed. Please try again.",
      });
      return;
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <section className="card">
      <h1 className="text-2xl font-bold text-slate-900">Publication Search</h1>
      <p className="mt-3 text-sm text-slate-600">
        Search PubMed for all <strong>ACTIVE</strong> faculty using hybrid retrieval: broad PubMed
        author search with optional ORCID-assisted disambiguation.
      </p>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <label className="text-sm text-slate-700">
          Start date
          <input
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
            className="mt-2 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>

        <label className="text-sm text-slate-700">
          End date
          <input
            type="date"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
            className="mt-2 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
      </div>

      <p className="mt-3 text-xs text-slate-500">
        Leave dates blank to search all years. ORCID is used as a supporting identity signal when
        available.
      </p>

      <button
        type="button"
        onClick={handleRunSearch}
        disabled={isRunning}
        className="mt-5 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        {isRunning ? "Running Search..." : "Run Search"}
      </button>

      {message ? (
        <p
          className={`mt-4 rounded-md px-3 py-2 text-sm ${
            message.kind === "error"
              ? "border border-rose-200 bg-rose-50 text-rose-700"
              : "border border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {message.text}
        </p>
      ) : null}
    </section>
  );
}
