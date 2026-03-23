import type { Metadata } from "next";
import LegalLayout from "@/components/LegalLayout";

export const metadata: Metadata = {
  title: "Contact & Support — TaskGraph",
  description: "Get help with TaskGraph or report a bug.",
};

export default function ContactPage() {
  return (
    <LegalLayout title="Contact &amp; Support" lastUpdated="23 March 2026">
      <p>
        TaskGraph is a personal project maintained by <strong>Rasmus Skriver</strong>. There is no paid support tier — all support is provided on a best-effort basis.
      </p>

      {/* Contact channels — styled cards, outside prose flow */}
      <div className="not-prose grid sm:grid-cols-2 gap-4 my-8">
        {/* Email */}
        <a
          href="mailto:skriver@live.dk"
          className="group flex items-start gap-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-5 hover:border-indigo-300 dark:hover:border-indigo-700 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/30 transition-colors"
        >
          <div className="w-10 h-10 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center shrink-0 shadow-sm group-hover:border-indigo-200 dark:group-hover:border-indigo-800 transition-colors">
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <rect x="2.5" y="4.5" width="15" height="11" rx="2" stroke="#6366f1" strokeWidth="1.5" />
              <path d="M2.5 7.5l7.5 5 7.5-5" stroke="#6366f1" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-0.5">Email support</p>
            <p className="text-sm font-mono text-indigo-600 dark:text-indigo-400 truncate">skriver@live.dk</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">For account, privacy &amp; non-public issues</p>
          </div>
        </a>

        {/* GitHub */}
        <a
          href="https://github.com/sumsar01/better-task-manager/issues"
          target="_blank"
          rel="noopener noreferrer"
          className="group flex items-start gap-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-5 hover:border-indigo-300 dark:hover:border-indigo-700 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/30 transition-colors"
        >
          <div className="w-10 h-10 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center shrink-0 shadow-sm group-hover:border-indigo-200 dark:group-hover:border-indigo-800 transition-colors">
            <svg width="18" height="18" viewBox="0 0 16 16" fill="#6366f1" aria-hidden="true">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-0.5">GitHub Issues</p>
            <p className="text-sm font-mono text-indigo-600 dark:text-indigo-400 truncate">sumsar01/better-task-manager</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Bugs, features &amp; public feedback</p>
          </div>
        </a>
      </div>

      <h2>What to include in a bug report</h2>
      <p>
        A good bug report helps us reproduce and fix the problem quickly. Please include:
      </p>
      <ul>
        <li>
          <strong>What you were trying to do</strong> — a brief description of the action you took.
        </li>
        <li>
          <strong>What you expected to happen</strong> — the intended outcome.
        </li>
        <li>
          <strong>What actually happened</strong> — the observed behaviour, including any error messages.
        </li>
        <li>
          <strong>Steps to reproduce</strong> — a numbered list of steps that reliably reproduce the issue.
        </li>
        <li>
          <strong>Browser and operating system</strong> — e.g. &ldquo;Chrome 123 on macOS 14&rdquo;.
        </li>
        <li>
          <strong>Screenshots or screen recordings</strong> — if applicable (do not include sensitive Jira data).
        </li>
      </ul>

      <h2>Privacy-related requests</h2>
      <p>
        For requests related to your personal data — such as access, correction, or deletion requests under the GDPR — please email{" "}
        <a href="mailto:skriver@live.dk">skriver@live.dk</a> with the subject line &ldquo;Privacy Request&rdquo;. See our{" "}
        <a href="/privacy">Privacy Policy</a> for more information about the data we hold.
      </p>

      <h2>Response times</h2>
      <p>
        This project is maintained in spare time. While we aim to respond to all messages, response times may vary. GitHub issues are typically monitored more frequently than email.
      </p>
    </LegalLayout>
  );
}
