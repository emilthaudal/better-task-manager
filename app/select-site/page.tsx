"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { AtlassianSite } from "@/lib/session";

export default function SelectSitePage() {
  const router = useRouter();
  const [sites, setSites] = useState<AtlassianSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/sites")
      .then((r) => r.json())
      .then((data: { sites?: AtlassianSite[]; error?: string }) => {
        if (data.error) {
          setError(data.error);
        } else {
          setSites(data.sites ?? []);
        }
      })
      .catch(() => setError("Failed to load sites"))
      .finally(() => setLoading(false));
  }, []);

  async function handleSelect(cloudId: string) {
    setSelecting(cloudId);
    setError(null);
    try {
      const res = await fetch("/api/auth/select-site", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cloudId }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "Failed to select site");
        setSelecting(null);
        return;
      }
      router.push("/app");
    } catch {
      setError("Failed to select site");
      setSelecting(null);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-950 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-900 shadow-lg p-8 flex flex-col gap-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            Select a Jira site
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Choose the Jira site you want to work with.
          </p>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            {[1, 2].map((n) => (
              <div
                key={n}
                className="h-16 rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse"
              />
            ))}
          </div>
        ) : sites.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No accessible Jira sites found. Make sure you have granted access to
            at least one site.
          </p>
        ) : (
          <ul className="space-y-2">
            {sites.map((site) => (
              <li key={site.id}>
                <button
                  onClick={() => handleSelect(site.id)}
                  disabled={selecting !== null}
                  className="w-full flex items-center gap-4 rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-60"
                >
                  {site.avatarUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={site.avatarUrl}
                      alt=""
                      className="h-9 w-9 rounded-full shrink-0"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-900 dark:text-gray-100 truncate">
                      {site.name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {site.url}
                    </p>
                  </div>
                  {selecting === site.id && (
                    <svg
                      className="h-4 w-4 text-blue-500 animate-spin shrink-0"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z"
                      />
                    </svg>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}

        <a
          href="/api/auth/logout"
          className="text-xs text-gray-400 dark:text-gray-600 hover:underline text-center"
        >
          Sign out and use a different account
        </a>
      </div>
    </main>
  );
}
