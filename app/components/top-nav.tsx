"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "Home" },
  { href: "/roster", label: "Faculty Roster" },
  { href: "/search", label: "Publication Search" },
  { href: "/results", label: "Results" },
  { href: "/export", label: "Export" },
];

export function TopNav() {
  const pathname = usePathname();

  return (
    <header className="border-b border-slate-200 bg-white">
      <nav className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-sm font-semibold tracking-wide text-slate-800">
          Global REACH Publications
        </Link>
        <ul className="flex flex-wrap gap-2 text-sm">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`rounded-md px-3 py-2 transition-colors ${
                    isActive
                      ? "bg-blue-600 text-white"
                      : "text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}
