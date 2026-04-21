"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  PublicationSearchResult,
  PublicationSearchRunSummary,
  PublicationSearchStoredPayload,
  RESULTS_STORAGE_KEY,
} from "@/lib/types/publication-search";

type Message = {
  kind: "error" | "success";
  text: string;
};

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

      const payload = (await response.json()) as {
        start_date?: string | null;
        end_date?: string | null;
        run_timestamp?: string;
        faculty_count_searched?: number;
        result_count?: number;
        search_method?: "ORCID";
        results?: PublicationSearchResult[];
        error?: string;
      };

      if (!response.ok) {
        setMessage({
          kind: "error",
          text: payload.error ?? "Publication search failed.",
        });
        return;
      }

      const runSummary: PublicationSearchRunSummary = {
        start_date: payload.start_date ?? null,
        end_date: payload.end_date ?? null,
        run_timestamp: payload.run_timestamp ?? new Date().toISOString(),
        faculty_count_searched: payload.faculty_count_searched ?? 0,
        result_count: payload.result_count ?? 0,
        search_method: payload.search_method ?? "ORCID",
      };

      const storedPayload: PublicationSearchStoredPayload = {
        run_summary: runSummary,
        results: payload.results ?? [],
      };

      sessionStorage.setItem(RESULTS_STORAGE_KEY, JSON.stringify(storedPayload));

      router.push("/results");
    } catch (error) {
      setIsRunning(false);
      setMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "Publication search failed.",
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
        Search PubMed for all <strong>ACTIVE</strong> faculty with ORCID IDs using an ORCID → PMID
        retrieval flow.
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
        Leave dates blank to search all years. During this test phase, faculty without ORCID are
        skipped.
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
