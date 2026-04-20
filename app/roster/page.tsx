"use client";

import { ChangeEvent, useMemo, useState } from "react";

type CsvRow = Record<string, string>;

const REQUIRED_COLUMNS = [
  "email",
  "first_name",
  "last_name",
  "first_initial",
  "primary_department",
  "status",
] as const;

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

export default function RosterPage() {
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [error, setError] = useState<string>("");
  const [fileName, setFileName] = useState<string>("");

  const missingColumns = useMemo(
    () => REQUIRED_COLUMNS.filter((column) => !headers.includes(column)),
    [headers],
  );

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setFileName(file.name);
    setError("");

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setHeaders([]);
      setRows([]);
      setError("Please upload a CSV file (.csv).");
      return;
    }

    const text = await file.text();
    const parsed = parseCsv(text);

    setHeaders(parsed.headers);
    setRows(parsed.rows);

    if (parsed.headers.length === 0) {
      setError("The uploaded CSV appears empty. Please upload a file with header columns.");
      return;
    }

    const missing = REQUIRED_COLUMNS.filter((column) => !parsed.headers.includes(column));
    if (missing.length > 0) {
      setError(
        `Missing required columns: ${missing.join(", ")}. Please update your roster file and upload again.`,
      );
    }

    // FUTURE: Store uploaded roster in Supabase and track upload metadata.
    // FUTURE: Trigger downstream PubMed candidate generation from validated roster records.
  };

  return (
    <div className="space-y-6">
      <section className="card">
        <h1 className="text-2xl font-bold text-slate-900">Upload Faculty Roster</h1>
        <p className="mt-2 text-sm text-slate-600">
          Upload a CSV with faculty profile fields. This table preview is local-only for now and
          will later save to Supabase.
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
        </div>

        {error ? (
          <p className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        ) : null}

        {!error && headers.length > 0 ? (
          <p className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            CSV looks valid. All required columns are present.
          </p>
        ) : null}

        {headers.length > 0 && missingColumns.length === 0 ? (
          <p className="mt-2 text-xs text-slate-500">
            Next phase will use <strong>last_name + first_initial</strong> with U-M affiliation
            checks when querying PubMed.
          </p>
        ) : null}
      </section>

      <section className="card overflow-hidden">
        <h2 className="text-lg font-semibold text-slate-900">Roster Preview</h2>
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
    </div>
  );
}
