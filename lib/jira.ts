import { getAccessToken } from "@/lib/session";
import type { SessionData } from "@/lib/session";

/** HTTP status codes that are worth retrying (transient or rate-limit). */
const RETRYABLE_STATUSES = new Set([429, 503, 504]);

/** Maximum number of attempts (1 original + 2 retries). */
const MAX_ATTEMPTS = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Build the Authorization header and base URL for Jira requests.
 *
 * OAuth path (default, production):
 *   - Bearer token obtained via getAccessToken(refreshToken)
 *   - Base URL: https://api.atlassian.com/ex/jira/{cloudId}
 *
 * Basic auth bypass (local dev only, JIRA_BYPASS=true):
 *   - Basic base64(email:apiToken) from env vars
 *   - Base URL: JIRA_BASE_URL env var
 */
async function resolveAuth(
  session?: SessionData,
): Promise<{ authHeader: string; baseUrl: string }> {
  if (process.env.JIRA_BYPASS === "true") {
    const email = process.env.JIRA_EMAIL;
    const apiToken = process.env.JIRA_API_TOKEN;
    const baseUrl = process.env.JIRA_BASE_URL;
    if (!email || !apiToken || !baseUrl) {
      throw new Error(
        "JIRA_BYPASS=true requires JIRA_EMAIL, JIRA_API_TOKEN, and JIRA_BASE_URL env vars.",
      );
    }
    return {
      authHeader: "Basic " + Buffer.from(`${email}:${apiToken}`).toString("base64"),
      baseUrl: `${baseUrl}/rest/api/3`,
    };
  }

  if (!session?.refreshToken || !session.cloudId) {
    throw new Error("Not authenticated. Please sign in to continue.");
  }

  const { accessToken, refreshToken } = await getAccessToken(session.refreshToken);
  // Atlassian rotates refresh tokens on every use — keep the in-memory
  // session object current so the caller can persist it via
  // persistRotatedToken() once the request's Jira calls are done.
  session.refreshToken = refreshToken;

  return {
    authHeader: `Bearer ${accessToken}`,
    baseUrl: `https://api.atlassian.com/ex/jira/${session.cloudId}/rest/api/3`,
  };
}

export async function jiraFetch<T>(
  path: string,
  session?: SessionData,
  signal?: AbortSignal,
): Promise<T> {
  const { authHeader, baseUrl } = await resolveAuth(session);
  const url = `${baseUrl}${path}`;
  const headers = {
    Authorization: authHeader,
    Accept: "application/json",
  };

  let lastError: Error | undefined;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    // If the caller has already aborted, bail immediately without retrying
    if (signal?.aborted) {
      throw new Error(`Jira request aborted for ${path}`);
    }

    let res: Response;

    try {
      res = await fetch(url, { headers, signal });
    } catch (networkErr) {
      // AbortError from the signal — propagate immediately, never retry
      if (networkErr instanceof Error && networkErr.name === "AbortError") throw networkErr;

      // Network / DNS error — always retryable
      lastError = networkErr instanceof Error ? networkErr : new Error(String(networkErr));
      const delay = Math.pow(2, attempt) * 1000;
      console.warn(
        `[jira] Network error on attempt ${attempt + 1} for ${path}: ${lastError.message}. Retrying in ${delay}ms…`,
      );
      await sleep(delay);
      continue;
    }

    if (res.ok) {
      return res.json() as Promise<T>;
    }

    const text = await res.text();
    const err = new Error(`Jira API error ${res.status} for ${path}: ${text}`);

    if (!RETRYABLE_STATUSES.has(res.status)) {
      // Non-retryable (400, 401, 403, 404, 422, …) — fail immediately
      throw err;
    }

    lastError = err;

    // Honour Retry-After header when present, otherwise exponential back-off
    const retryAfterHeader = res.headers.get("Retry-After");
    const delay = retryAfterHeader
      ? parseFloat(retryAfterHeader) * 1000
      : Math.pow(2, attempt) * 1000;

    console.warn(
      `[jira] Status ${res.status} on attempt ${attempt + 1} for ${path}. Retrying in ${delay}ms…`,
    );
    await sleep(delay);
  }

  throw lastError ?? new Error(`Jira API request failed for ${path}`);
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface JiraProject {
  id: string;
  key: string;
  name: string;
  avatarUrls?: Record<string, string>;
}

export interface JiraStatus {
  id: string;
  name: string;
  statusCategory: {
    id: number;
    key: string; // "new" | "indeterminate" | "done"
    name: string;
  };
}

export interface JiraIssueType {
  id: string;
  name: string;
  subtask: boolean;
  iconUrl?: string;
}

export interface JiraUser {
  accountId: string;
  displayName: string;
  avatarUrls?: Record<string, string>;
}

export interface JiraIssueLinkType {
  id: string;
  name: string;
  inward: string;
  outward: string;
}

export interface JiraIssueLink {
  id: string;
  type: JiraIssueLinkType;
  inwardIssue?: { id: string; key: string; fields: { summary: string; status: JiraStatus } };
  outwardIssue?: { id: string; key: string; fields: { summary: string; status: JiraStatus } };
}

export interface JiraIssue {
  id: string;
  key: string;
  fields: {
    summary: string;
    status: JiraStatus;
    issuetype: JiraIssueType;
    assignee: JiraUser | null;
    parent?: { id: string; key: string; fields: { summary: string; issuetype: JiraIssueType } };
    subtasks?: Array<{
      id: string;
      key: string;
      fields: { summary: string; status: JiraStatus; issuetype: JiraIssueType };
    }>;
    issuelinks: JiraIssueLink[];
    priority?: { name: string; iconUrl?: string };
    labels?: string[];
    /** ISO date string — when the issue was created. Always present for epics. */
    created?: string;
    /** Standard Jira due date field (YYYY-MM-DD). May be null if not set. */
    duedate?: string | null;
    /** Epic start date — team-managed projects (YYYY-MM-DD). May be null if not set. */
    customfield_10015?: string | null;
  };
}

interface SearchResult<T> {
  issues: T[];
  isLast: boolean;
  nextPageToken?: string;
}

// ── API helpers ──────────────────────────────────────────────────────────────

/** Fetch all pages of a JQL search using the /search/jql endpoint, returning every issue. */
export async function searchIssues(
  jql: string,
  fields: string[],
  session?: SessionData,
  signal?: AbortSignal,
): Promise<JiraIssue[]> {
  const all: JiraIssue[] = [];
  const maxResults = 100;
  let nextPageToken: string | undefined = undefined;

  while (true) {
    const params = new URLSearchParams({
      jql,
      fields: fields.join(","),
      maxResults: String(maxResults),
    });
    if (nextPageToken) {
      params.set("nextPageToken", nextPageToken);
    }
    const page = await jiraFetch<SearchResult<JiraIssue>>(
      `/search/jql?${params}`,
      session,
      signal,
    );
    all.push(...page.issues);
    if (page.isLast || !page.nextPageToken) break;
    nextPageToken = page.nextPageToken;
  }

  return all;
}

/** Fetch all projects accessible to the token. */
export async function getProjects(session?: SessionData): Promise<JiraProject[]> {
  const all: JiraProject[] = [];
  let startAt = 0;
  const maxResults = 50;

  while (true) {
    const params = new URLSearchParams({
      maxResults: String(maxResults),
      startAt: String(startAt),
      orderBy: "name",
    });
    const page = await jiraFetch<{ values: JiraProject[]; isLast: boolean }>(
      `/project/search?${params}`,
      session,
    );
    all.push(...page.values);
    if (page.isLast) break;
    startAt += page.values.length;
  }

  return all;
}

/**
 * Fetch open epics in a project (statusCategory != Done).
 * Excluding done epics keeps the result set manageable for large projects and
 * prevents hundreds of parallel expansion calls when building the project graph.
 */
export async function getEpics(
  projectKey: string,
  session?: SessionData,
): Promise<JiraIssue[]> {
  return searchIssues(
    `project = "${projectKey}" AND issueType = Epic AND statusCategory != Done ORDER BY created DESC`,
    [
      "summary",
      "status",
      "assignee",
      "issuetype",
      "issuelinks",
      "created",
      "duedate",
      "customfield_10015",
    ],
    session,
  );
}

/** Fetch all issues that are direct children of an epic (one level). */
export async function getEpicChildren(
  epicKey: string,
  session?: SessionData,
  signal?: AbortSignal,
): Promise<JiraIssue[]> {
  return searchIssues(
    `parent = "${epicKey}" ORDER BY created ASC`,
    ["summary", "status", "issuetype", "assignee", "parent", "subtasks", "issuelinks", "priority", "labels"],
    session,
    signal,
  );
}

/** Fetch subtasks of a set of issue keys. */
export async function getSubtasks(
  parentKeys: string[],
  session?: SessionData,
  signal?: AbortSignal,
): Promise<JiraIssue[]> {
  if (parentKeys.length === 0) return [];
  const inClause = parentKeys.map((k) => `"${k}"`).join(", ");
  return searchIssues(
    `parent in (${inClause}) ORDER BY created ASC`,
    ["summary", "status", "issuetype", "assignee", "parent", "subtasks", "issuelinks", "priority", "labels"],
    session,
    signal,
  );
}
