export default function ResultsPage() {
  return (
    <section className="card">
      <h1 className="text-2xl font-bold text-slate-900">Results</h1>
      <p className="mt-3 text-sm text-slate-600">
        Placeholder for reviewing publication matches and affiliation checks.
      </p>
      <p className="mt-3 text-xs text-slate-500">
        {/* FUTURE: Add result table, confidence scoring, and reviewer annotations stored in Supabase. */}
        Detailed review workflows will be added in a future version.
      </p>
    </section>
  );
}
