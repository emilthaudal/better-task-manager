"use client";

import { useState, useEffect } from "react";

/**
 * Fetches the Jira base URL for the authenticated user's org
 * (e.g. "https://acme.atlassian.net") from the server session.
 *
 * Falls back to NEXT_PUBLIC_JIRA_BASE_URL for the JIRA_BYPASS dev path.
 * Returns an empty string while loading or if unauthenticated.
 */
export function useJiraBaseUrl(): string {
  const [url, setUrl] = useState<string>(
    process.env.NEXT_PUBLIC_JIRA_BASE_URL ?? "",
  );

  useEffect(() => {
    let cancelled = false;
    fetch("/api/jira/site-url")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { url: string } | null) => {
        if (!cancelled && data?.url) {
          setUrl(data.url);
        }
      })
      .catch(() => {
        // silently ignore — fallback stays in place
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return url;
}
