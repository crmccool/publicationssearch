export default function ExportPage() {
  return (
    <section className="card">
      <h1 className="text-2xl font-bold text-slate-900">Export</h1>
      <p className="mt-3 text-sm text-slate-600">
        Placeholder for exporting cleaned publication data and review outputs.
      </p>
      <p className="mt-3 text-xs text-slate-500">
        {/* FUTURE: Add CSV/Excel export options pulling validated rows from Supabase tables. */}
        Export formats and options will be available once result persistence is implemented.
      </p>
    </section>
  );
}
