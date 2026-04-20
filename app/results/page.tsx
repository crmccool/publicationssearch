"use client";

import { useEffect, useMemo, useState } from "react";

import {
  InternationalFlag,
  PublicationConfidence,
  PublicationSearchResult,
  RESULTS_STORAGE_KEY,
} from "@/lib/types/publication-search";

export default function ResultsPage() {
  const [results, setResults] = useState<PublicationSearchResult[]>([]);
  const [internationalFilter, setInternationalFilter] = useState<"all" | InternationalFlag>("all");
  const [confidenceFilter, setConfidenceFilter] = useState<"all" | PublicationConfidence>("all");

  useEffect(() => {
    const raw = sessionStorage.getItem(RESULTS_STORAGE_KEY);
    if (!raw) {
      return;
    }

    try {
      const parsed = JSON.parse(raw) as PublicationSearchResult[];
      setResults(parsed);
    } catch {
      setResults([]);
    }
  }, []);

  const filteredResults = useMemo(
    () =>
      results.filter((result) => {
        const internationalMatches =
          internationalFilter === "all" || result.international_flag === internationalFilter;
        const confidenceMatches =
          confidenceFilter === "all" || result.confidence === confidenceFilter;

        return internationalMatches && confidenceMatches;
      }),
    [results, internationalFilter, confidenceFilter],
  );

  return (
    <section className="card">
      <h1 className="text-2xl font-bold text-slate-900">Results</h1>
      <p className="mt-2 text-sm text-slate-600">
        Review strict author-affiliation publication matches and filter by international status and
        match confidence.
      </p>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
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
            <option value="low">low</option>
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
              <th className="px-3 py-2 font-semibold text-slate-700">confidence</th>
            </tr>
          </thead>
          <tbody>
            {filteredResults.length === 0 ? (
              <tr>
                <td className="px-3 py-3 text-slate-500" colSpan={7}>
                  No results yet. Run a publication search to populate this table.
                </td>
              </tr>
            ) : (
              filteredResults.map((result) => (
                <tr key={`${result.PMID}-${result.faculty_name}`} className="border-b border-slate-100">
                  <td className="px-3 py-2 align-top text-slate-700">{result.faculty_name}</td>
                  <td className="px-3 py-2 align-top text-slate-700">
                    <a
                      href={`https://pubmed.ncbi.nlm.nih.gov/${result.PMID}/`}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-blue-700 underline-offset-2 hover:underline"
                    >
                      {result.title}
                    </a>
                  </td>
                  <td className="px-3 py-2 align-top text-slate-700">{result.publication_date}</td>
                  <td className="px-3 py-2 align-top text-slate-700">{result.PMID}</td>
                  <td className="px-3 py-2 align-top text-slate-700">{result.international_flag}</td>
                  <td className="px-3 py-2 align-top text-slate-700">
                    {result.international_countries}
                  </td>
                  <td className="px-3 py-2 align-top text-slate-700">{result.confidence}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
