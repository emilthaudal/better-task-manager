import type { Metadata } from "next";
import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";

export const metadata: Metadata = {
  title: "TaskGraph — Visualize Jira dependency graphs",
  description:
    "TaskGraph connects to your Jira workspace and renders interactive dependency graphs so you can see what's blocked, what's in progress, and what you can ship next.",
};

export default function LandingPage() {
  const signInHref = process.env.JIRA_BYPASS === "true" ? "/app" : "/api/auth/login";
  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* ── Navbar ── */}
      <header className="sticky top-0 z-50 border-b border-slate-200/80 dark:border-slate-800/80 bg-white/80 dark:bg-slate-950/80 backdrop-blur-sm">
        <nav className="max-w-5xl mx-auto px-6 h-14 flex items-center gap-6">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center shadow-sm">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <circle cx="4" cy="4" r="2" fill="white" />
                <circle cx="12" cy="4" r="2" fill="white" fillOpacity="0.6" />
                <circle cx="8" cy="12" r="2" fill="white" fillOpacity="0.8" />
                <line x1="4" y1="4" x2="8" y2="12" stroke="white" strokeWidth="1.5" strokeOpacity="0.7" />
                <line x1="12" y1="4" x2="8" y2="12" stroke="white" strokeWidth="1.5" strokeOpacity="0.7" />
              </svg>
            </div>
            <span className="font-bold text-slate-900 dark:text-slate-100 tracking-tight">TaskGraph</span>
          </Link>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Nav links */}
          <div className="hidden sm:flex items-center gap-5 text-sm text-slate-500 dark:text-slate-400">
            <Link href="/privacy" className="hover:text-slate-900 dark:hover:text-slate-200 transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-slate-900 dark:hover:text-slate-200 transition-colors">Terms</Link>
            <Link href="/contact" className="hover:text-slate-900 dark:hover:text-slate-200 transition-colors">Contact</Link>
          </div>

          <div className="flex items-center gap-3 ml-4">
            <ThemeToggle />
            <Link
              href={process.env.JIRA_BYPASS === "true" ? "/app" : "/login"}
              className="text-sm font-medium bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white px-4 py-1.5 rounded-lg transition-colors"
            >
              Sign in
            </Link>
          </div>
        </nav>
      </header>

      {/* ── Hero ── */}
      <section className="flex-1 flex flex-col items-center justify-center text-center px-6 py-24 relative overflow-hidden">
        {/* Background blobs */}
        <div
          className="pointer-events-none absolute -top-32 -left-32 w-[480px] h-[480px] rounded-full opacity-30 dark:opacity-10 blur-3xl"
          style={{ background: "radial-gradient(circle, #e0e7ff 0%, transparent 70%)" }}
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -bottom-32 -right-32 w-[480px] h-[480px] rounded-full opacity-30 dark:opacity-10 blur-3xl"
          style={{ background: "radial-gradient(circle, #c7d2fe 0%, transparent 70%)" }}
          aria-hidden="true"
        />

        <div className="relative max-w-2xl">
          <div className="inline-flex items-center gap-2 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-800/60 text-indigo-600 dark:text-indigo-400 text-xs font-semibold px-3 py-1 rounded-full mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
            Free · No data stored · Jira OAuth
          </div>

          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-slate-50 leading-tight mb-5">
            See your Jira tasks<br />
            <span className="text-indigo-600">as a dependency graph</span>
          </h1>

          <p className="text-lg text-slate-500 dark:text-slate-400 leading-relaxed mb-8 max-w-xl mx-auto">
            TaskGraph connects to your Jira workspace and renders interactive graphs so you can instantly see what&apos;s blocked, what&apos;s in progress, and what you can actually ship next.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <a
              href={signInHref}
              className="flex items-center gap-3 bg-[#0052CC] hover:bg-[#0747A6] active:bg-[#003884] text-white font-semibold px-6 py-3 rounded-xl transition-colors text-sm shadow-lg shadow-blue-200 dark:shadow-blue-950"
            >
              <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" className="h-5 w-5 shrink-0 fill-current">
                <path d="M11.53 17.27c-.27-.32-.7-.3-.9.08L6.07 26.5a.54.54 0 0 0 .48.78h7.19a.54.54 0 0 0 .49-.3c1.46-3.07.76-7.14-2.7-9.71z" />
                <path d="M15.68 3.17a15.4 15.4 0 0 0-.2 19.4l3.55 6.45c.1.17.28.26.47.26h7.19a.54.54 0 0 0 .47-.8L16.6 3.18a.54.54 0 0 0-.92 0z" />
              </svg>
              Sign in with Atlassian
            </a>
            <a
              href="https://github.com/sumsar01/better-task-manager"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 border border-slate-200 dark:border-slate-700 px-5 py-3 rounded-xl transition-colors"
            >
              <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4 fill-current">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
              </svg>
              View on GitHub
            </a>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="py-20 px-6 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200/80 dark:border-slate-800/80">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-center text-slate-900 dark:text-slate-100 mb-12 tracking-tight">
            Everything you need to understand your work
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700/80 p-6 shadow-sm"
              >
                <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 flex items-center justify-center mb-4">
                  {f.icon}
                </div>
                <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-1.5">{f.title}</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-slate-200/80 dark:border-slate-800/80 py-8 px-6">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-400 dark:text-slate-500">
          <span>© {new Date().getFullYear()} TaskGraph</span>
          <div className="flex items-center gap-5">
            <Link href="/privacy" className="hover:text-slate-700 dark:hover:text-slate-300 transition-colors">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-slate-700 dark:hover:text-slate-300 transition-colors">Terms of Service</Link>
            <Link href="/contact" className="hover:text-slate-700 dark:hover:text-slate-300 transition-colors">Contact</Link>
            <a
              href="https://github.com/sumsar01/better-task-manager"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
            >
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

const FEATURES = [
  {
    title: "Dependency graph",
    description:
      "Visualize how tasks block each other with an auto-laid-out directed graph powered by ELK.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <circle cx="4" cy="4" r="2.5" stroke="#6366f1" strokeWidth="1.5" />
        <circle cx="16" cy="4" r="2.5" stroke="#6366f1" strokeWidth="1.5" />
        <circle cx="10" cy="16" r="2.5" stroke="#6366f1" strokeWidth="1.5" />
        <line x1="4" y1="6.5" x2="10" y2="13.5" stroke="#6366f1" strokeWidth="1.3" />
        <line x1="16" y1="6.5" x2="10" y2="13.5" stroke="#6366f1" strokeWidth="1.3" />
      </svg>
    ),
  },
  {
    title: "Live polling",
    description:
      "The graph updates every 30 seconds in the background — no page refresh required.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <circle cx="10" cy="10" r="7.5" stroke="#6366f1" strokeWidth="1.5" />
        <path d="M10 5.5V10l3 2" stroke="#6366f1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: "Epic & project views",
    description:
      "Drill down into a single epic or see all epics across an entire Jira project at once.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <rect x="2.5" y="2.5" width="6" height="6" rx="1.5" stroke="#6366f1" strokeWidth="1.5" />
        <rect x="11.5" y="2.5" width="6" height="6" rx="1.5" stroke="#6366f1" strokeWidth="1.5" />
        <rect x="2.5" y="11.5" width="6" height="6" rx="1.5" stroke="#6366f1" strokeWidth="1.5" />
        <rect x="11.5" y="11.5" width="6" height="6" rx="1.5" stroke="#6366f1" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    title: "Privacy first",
    description:
      "Your Jira credentials stay in an encrypted session cookie. No data is stored on our servers.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path d="M10 2.5C7 2.5 4.5 4.5 4.5 7v1H4a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1h-.5V7C15.5 4.5 13 2.5 10 2.5Z" stroke="#6366f1" strokeWidth="1.5" />
        <circle cx="10" cy="12.5" r="1.25" fill="#6366f1" />
      </svg>
    ),
  },
];
