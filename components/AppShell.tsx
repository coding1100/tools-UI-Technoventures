"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { APP_NAME } from "@/lib/appName";

const TOOLS = [
  { href: "/humanizer", label: "Humanizer" },
  { href: "/ai-detector", label: "AI Detector" },
  { href: "/plagiarism-checker", label: "Plagiarism Checker" },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/login") return <main className="px-4">{children}</main>;

  const signOut = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    window.location.assign("/login");
  };

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 gap-y-2 px-4 py-3">
          <span className="text-base font-semibold text-slate-900">{APP_NAME}</span>
          <nav className="flex flex-wrap gap-1">
            {TOOLS.map((tool) => {
              const active = pathname.startsWith(tool.href);
              return (
                <Link
                  key={tool.href}
                  href={tool.href}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    active ? "bg-brand-soft text-brand-dark" : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {tool.label}
                </Link>
              );
            })}
          </nav>
          <button
            type="button"
            onClick={() => void signOut()}
            className="ml-auto rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Sign out
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
