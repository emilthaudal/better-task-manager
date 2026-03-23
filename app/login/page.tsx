import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in — Better Task Manager",
};

interface Props {
  searchParams: Promise<{ error?: string }>;
}

const ERROR_MESSAGES: Record<string, string> = {
  missing_params: "Authorization failed — missing parameters.",
  invalid_state: "Authorization failed — invalid state. Please try again.",
  token_exchange_failed: "Could not exchange authorization code for a token.",
  sites_fetch_failed: "Could not retrieve your Jira sites.",
  access_denied: "Access was denied.",
};

export default async function LoginPage({ searchParams }: Props) {
  const { error } = await searchParams;
  const errorMessage = error ? (ERROR_MESSAGES[error] ?? "An unexpected error occurred.") : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-950 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-gray-900 shadow-lg p-8 flex flex-col items-center gap-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Better Task Manager
          </h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Sign in with your Atlassian account to continue
          </p>
        </div>

        {errorMessage && (
          <div className="w-full rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-300">
            {errorMessage}
          </div>
        )}

        <a
          href="/api/auth/login"
          className="flex w-full items-center justify-center gap-3 rounded-lg bg-[#0052CC] hover:bg-[#0747A6] active:bg-[#003884] text-white font-medium px-4 py-3 transition-colors"
        >
          {/* Atlassian logo mark */}
          <svg
            aria-hidden="true"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 32 32"
            className="h-5 w-5 shrink-0 fill-current"
          >
            <path d="M11.53 17.27c-.27-.32-.7-.3-.9.08L6.07 26.5a.54.54 0 0 0 .48.78h7.19a.54.54 0 0 0 .49-.3c1.46-3.07.76-7.14-2.7-9.71z" />
            <path d="M15.68 3.17a15.4 15.4 0 0 0-.2 19.4l3.55 6.45c.1.17.28.26.47.26h7.19a.54.54 0 0 0 .47-.8L16.6 3.18a.54.54 0 0 0-.92 0z" />
          </svg>
          Sign in with Atlassian
        </a>

        <p className="text-xs text-gray-400 dark:text-gray-600 text-center">
          You will be redirected to Atlassian to authorize access to your Jira
          data.
        </p>
      </div>
    </main>
  );
}
