import type { ReactNode } from "react";
import Link from "next/link";

interface LegalLayoutProps {
  /** Page title displayed in the header and card (e.g. "Privacy Policy"). */
  title: string;
  /** "Last updated" date string (e.g. "23 March 2026"). */
  lastUpdated: string;
  children: ReactNode;
}

/**
 * Shared layout for legal / policy pages.
 * Renders a consistent header with the TaskGraph wordmark,
 * a prose content card, and a cross-linking footer.
 */
export default function LegalLayout({ title, lastUpdated, children }: LegalLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950">

      {/* ── Header ── */}
      <header className="sticky top-0 z-10 border-b border-slate-200/80 dark:border-slate-800/80 bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-6 h-14 flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2 shrink-0 group">
            <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center shadow-sm">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <circle cx="4" cy="4" r="2" fill="white" />
                <circle cx="12" cy="4" r="2" fill="white" fillOpacity="0.6" />
                <circle cx="8" cy="12" r="2" fill="white" fillOpacity="0.8" />
                <line x1="4" y1="4" x2="8" y2="12" stroke="white" strokeWidth="1.5" strokeOpacity="0.7" />
                <line x1="12" y1="4" x2="8" y2="12" stroke="white" strokeWidth="1.5" strokeOpacity="0.7" />
              </svg>
            </div>
            <span className="font-bold text-slate-900 dark:text-slate-100 tracking-tight group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
              TaskGraph
            </span>
          </Link>

          <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 shrink-0" />
          <span className="text-sm text-slate-400 dark:text-slate-500 truncate">{title}</span>

          <div className="flex-1" />

          <Link
            href="/"
            className="flex items-center gap-1.5 text-sm text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors shrink-0"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Home
          </Link>
        </div>
      </header>

      {/* ── Content ── */}
      <main className="flex-1 py-12 px-6">
        <div className="max-w-3xl mx-auto">

          {/* Card */}
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">

            {/* Card header */}
            <div className="px-8 pt-8 pb-6 border-b border-slate-200 dark:border-slate-800">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50 tracking-tight">
                {title}
              </h1>
              <p className="mt-1.5 text-sm text-slate-400 dark:text-slate-500">
                Last updated: {lastUpdated}
              </p>
            </div>

            {/* Card body — prose */}
            <div className="px-8 pt-6 pb-8">
              <div className="prose prose-slate dark:prose-invert max-w-none
                prose-headings:font-semibold prose-headings:tracking-tight
                prose-h2:text-base prose-h2:mt-7 prose-h2:mb-2
                prose-p:text-slate-600 dark:prose-p:text-slate-400 prose-p:leading-relaxed prose-p:my-3
                prose-li:text-slate-600 dark:prose-li:text-slate-400 prose-li:my-1
                prose-ul:my-3 prose-ul:pl-5
                prose-a:text-indigo-600 dark:prose-a:text-indigo-400 prose-a:font-medium prose-a:no-underline hover:prose-a:underline
                prose-strong:text-slate-800 dark:prose-strong:text-slate-200
                prose-code:text-indigo-600 dark:prose-code:text-indigo-400 prose-code:bg-indigo-50 dark:prose-code:bg-indigo-950/50 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:font-normal prose-code:before:content-none prose-code:after:content-none
              ">
                {children}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-slate-200/80 dark:border-slate-800/80 py-6 px-6">
        <div className="max-w-3xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-slate-400 dark:text-slate-500">
          <span>© {new Date().getFullYear()} TaskGraph</span>
          <div className="flex items-center gap-5">
            <Link href="/privacy" className="hover:text-slate-700 dark:hover:text-slate-300 transition-colors">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-slate-700 dark:hover:text-slate-300 transition-colors">Terms of Service</Link>
            <Link href="/contact" className="hover:text-slate-700 dark:hover:text-slate-300 transition-colors">Contact</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
