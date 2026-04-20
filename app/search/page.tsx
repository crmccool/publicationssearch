export default function SearchPage() {
  return (
    <section className="card">
      <h1 className="text-2xl font-bold text-slate-900">Publication Search</h1>
      <p className="mt-3 text-sm text-slate-600">
        Placeholder for publication search execution.
      </p>
      <p className="mt-3 text-sm text-slate-600">
        Future implementation will query PubMed using faculty <strong>last name + first
        initial</strong>, and apply strict University of Michigan affiliation validation to the
        matched faculty author.
      </p>
      <p className="mt-3 text-xs text-slate-500">
        {/* FUTURE: Add search controls, queue execution, and Supabase-backed run history. */}
        Search orchestration and run history will be integrated here.
      </p>
    </section>
  );
}
