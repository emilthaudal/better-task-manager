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
    <div className="min-h-screen flex flex-col bg-muted">

      {/* ── Header ── */}
      <header className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur-sm">
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
            <span className="font-bold text-foreground tracking-tight group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
              TaskGraph
            </span>
          </Link>

          <div className="w-px h-4 bg-accent shrink-0" />
          <span className="text-sm text-muted-foreground truncate">{title}</span>

          <div className="flex-1" />

          <Link
            href="/"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
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
          <div className="rounded-2xl bg-background border border-border shadow-sm overflow-hidden">

            {/* Card header */}
            <div className="px-8 pt-8 pb-6 border-b border-border">
              <h1 className="text-2xl font-bold text-foreground tracking-tight">
                {title}
              </h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Last updated: {lastUpdated}
              </p>
            </div>

            {/* Card body — prose */}
            <div className="px-8 pt-6 pb-8">
              <div className="prose prose-slate dark:prose-invert max-w-none
                prose-headings:font-semibold prose-headings:tracking-tight
                prose-h2:text-base prose-h2:mt-7 prose-h2:mb-2
                prose-p:text-muted-foreground prose-p:leading-relaxed prose-p:my-3
                prose-li:text-muted-foreground prose-li:my-1
                prose-ul:my-3 prose-ul:pl-5
                prose-a:text-primary prose-a:font-medium prose-a:no-underline hover:prose-a:underline
                prose-strong:text-foreground
                prose-code:text-primary prose-code:bg-primary/10 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:font-normal prose-code:before:content-none prose-code:after:content-none
              ">
                {children}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-border py-6 px-6">
        <div className="max-w-3xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>© {new Date().getFullYear()} TaskGraph</span>
          <div className="flex items-center gap-5">
            <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link>
            <Link href="/contact" className="hover:text-foreground transition-colors">Contact</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
