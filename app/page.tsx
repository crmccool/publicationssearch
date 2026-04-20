import Link from "next/link";

const cards = [
  {
    title: "Upload Faculty Roster",
    description:
      "Upload a CSV roster with faculty identity and department metadata as the first step.",
    href: "/roster",
  },
  {
    title: "Run Publication Search",
    description:
      "Start the publication matching workflow (PubMed integration coming in a future iteration).",
    href: "/search",
  },
  {
    title: "Review Results",
    description:
      "Inspect publication matches, evaluate affiliation criteria, and mark records for export.",
    href: "/results",
  },
  {
    title: "Export Data",
    description: "Download cleaned publication and matching datasets for downstream analysis.",
    href: "/export",
  },
];

export default function HomePage() {
  return (
    <div className="space-y-8">
      <section className="card">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Global REACH Publications App
        </h1>
        <p className="mt-3 max-w-3xl text-slate-600">
          This internal tool helps identify publications authored by network members with
          international co-authors. Start by uploading your faculty roster, then run publication
          search and review workflows.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {cards.map((card) => (
          <article key={card.title} className="card flex flex-col justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{card.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{card.description}</p>
            </div>
            <Link
              className="mt-4 inline-flex w-fit items-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
              href={card.href}
            >
              Open Section
            </Link>
          </article>
        ))}
      </section>
    </div>
  );
}
