"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";

import { listFacultyRows, saveFacultyRows } from "@/lib/supabase/client";
import { FacultyRecord, normalizeOrcid, REQUIRED_COLUMNS } from "@/lib/types/faculty";

type CsvRow = Record<string, string>;

type Message = {
  kind: "success" | "error";
  text: string;
};

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === '"') {
      const nextChar = line[i + 1];
      if (inQuotes && nextChar === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells;
}

function parseCsv(text: string): { headers: string[]; rows: CsvRow[] } {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = parseCsvLine(lines[0]).map((header) => header.trim());
  const rows = lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return headers.reduce<CsvRow>((acc, header, index) => {
      acc[header] = values[index] ?? "";
      return acc;
    }, {});
  });

  return { headers, rows };
}

function mapCsvRowsToFaculty(rows: CsvRow[]): FacultyRecord[] {
  return rows.map((row) => ({
    email: row.email ?? "",
    first_name: row.first_name ?? "",
    last_name: row.last_name ?? "",
    first_initial: row.first_initial ?? "",
    primary_department: row.primary_department ?? "",
    status: row.status ?? "",
    orcid: normalizeOrcid(row.orcid),
  }));
}

export default function RosterPage() {
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [storedRows, setStoredRows] = useState<FacultyRecord[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [message, setMessage] = useState<Message | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isLoadingStoredRows, setIsLoadingStoredRows] = useState<boolean>(true);

  const missingColumns = useMemo(
    () => REQUIRED_COLUMNS.filter((column) => !headers.includes(column)),
    [headers],
  );

  const canSave = rows.length > 0 && missingColumns.length === 0 && !isSaving;

  const loadStoredRows = async () => {
    setIsLoadingStoredRows(true);
    const { data, error } = await listFacultyRows();

    if (error) {
      setMessage({
        kind: "error",
        text: `Unable to load existing Supabase faculty rows. ${error}`,
      });
      setIsLoadingStoredRows(false);
      return;
    }

    setStoredRows(data ?? []);
    setIsLoadingStoredRows(false);
  };

  useEffect(() => {
    void loadStoredRows();
  }, []);

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setFileName(file.name);
    setMessage(null);

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setHeaders([]);
      setRows([]);
      setMessage({ kind: "error", text: "Please upload a CSV file (.csv)." });
      return;
    }

    const text = await file.text();
    const parsed = parseCsv(text);

    setHeaders(parsed.headers);
    setRows(parsed.rows);

    if (parsed.headers.length === 0) {
      setMessage({
        kind: "error",
        text: "The uploaded CSV appears empty. Please upload a file with header columns.",
      });
      return;
    }

    const missing = REQUIRED_COLUMNS.filter((column) => !parsed.headers.includes(column));
    if (missing.length > 0) {
      setMessage({
        kind: "error",
        text: `Missing required columns: ${missing.join(", ")}. Please update your roster file and upload again.`,
      });
      return;
    }

    setMessage({
      kind: "success",
      text: "CSV validation passed. You can now save these rows to Supabase.",
    });
  };

  const handleSaveToSupabase = async () => {
    if (!canSave) {
      return;
    }

    setIsSaving(true);
    setMessage(null);

    const facultyRows = mapCsvRowsToFaculty(rows);
    const { data, error } = await saveFacultyRows(facultyRows);

    if (error) {
      setMessage({ kind: "error", text: `Roster upload failed. ${error}` });
      setIsSaving(false);
      return;
    }

    setStoredRows(data ?? []);
    setMessage({
      kind: "success",
      text: `Roster saved to Supabase (${facultyRows.length} rows submitted).`,
    });
    setIsSaving(false);

    // FUTURE: This save flow should call a server endpoint/RPC that supports
    // full replacement logic, diffs, and run-level metadata.
  };

  return (
    <div className="space-y-6">
      <section className="card">
        <h1 className="text-2xl font-bold text-slate-900">Upload Faculty Roster</h1>
        <p className="mt-2 text-sm text-slate-600">
          Upload a CSV, validate required columns, and save the working faculty roster to Supabase.
        </p>

        <div className="mt-4 rounded-lg border border-dashed border-slate-300 p-4">
          <label className="block text-sm font-medium text-slate-700" htmlFor="csv-upload">
            Select roster CSV
          </label>
          <input
            id="csv-upload"
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileUpload}
            className="mt-2 block w-full text-sm text-slate-600 file:mr-4 file:rounded-md file:border-0 file:bg-blue-600 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-blue-700"
          />
          {fileName ? <p className="mt-2 text-xs text-slate-500">Uploaded: {fileName}</p> : null}
        </div>

        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <h2 className="text-sm font-semibold text-slate-800">Required columns</h2>
          <ul className="mt-2 grid grid-cols-2 gap-1 text-xs text-slate-600 md:grid-cols-3">
            {REQUIRED_COLUMNS.map((column) => (
              <li key={column}>• {column}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-500">
            Optional column: <code>orcid</code> (accepts bare ID or{" "}
            <code>https://orcid.org/&lt;id&gt;</code>).
          </p>
        </div>

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

        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={handleSaveToSupabase}
            disabled={!canSave}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isSaving ? "Saving..." : "Save roster to Supabase"}
          </button>
          <p className="text-xs text-slate-500">
            This MVP currently refreshes the active faculty list using email-based upserts.
          </p>
        </div>
      </section>

      <section className="card overflow-hidden">
        <h2 className="text-lg font-semibold text-slate-900">Uploaded CSV Preview</h2>
        {rows.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">No data loaded yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-100 text-left">
                  {headers.map((header) => (
                    <th key={header} className="px-3 py-2 font-semibold text-slate-700">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 25).map((row, rowIndex) => (
                  <tr key={`${rowIndex}-${row.email ?? "row"}`} className="border-b border-slate-100">
                    {headers.map((header) => (
                      <td key={`${rowIndex}-${header}`} className="px-3 py-2 text-slate-700">
                        {row[header]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-slate-500">
              Showing {Math.min(rows.length, 25)} of {rows.length} rows.
            </p>
          </div>
        )}
      </section>

      <section className="card overflow-hidden">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">Current Supabase Faculty Rows</h2>
          <button
            type="button"
            onClick={() => {
              void loadStoredRows();
            }}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Refresh
          </button>
        </div>

        {isLoadingStoredRows ? (
          <p className="mt-3 text-sm text-slate-600">Loading rows from Supabase...</p>
        ) : storedRows.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">No faculty rows currently stored.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-100 text-left">
                  {REQUIRED_COLUMNS.map((header) => (
                    <th key={header} className="px-3 py-2 font-semibold text-slate-700">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {storedRows.slice(0, 25).map((row) => (
                  <tr key={row.email} className="border-b border-slate-100">
                    <td className="px-3 py-2 text-slate-700">{row.email}</td>
                    <td className="px-3 py-2 text-slate-700">{row.first_name}</td>
                    <td className="px-3 py-2 text-slate-700">{row.last_name}</td>
                    <td className="px-3 py-2 text-slate-700">{row.first_initial}</td>
                    <td className="px-3 py-2 text-slate-700">{row.primary_department}</td>
                    <td className="px-3 py-2 text-slate-700">{row.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-slate-500">
              Showing {Math.min(storedRows.length, 25)} of {storedRows.length} stored rows.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
