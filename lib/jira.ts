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

export interface JiraFetchOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  session?: SessionData;
  signal?: AbortSignal;
}

/**
 * Mutating requests (POST/PUT/DELETE) are never retried — a retried write
 * could double-create an issue or double-fire a transition. Only GET reads
 * retry on transient failures.
 */
export async function jiraFetch<T>(
  path: string,
  sessionOrOptions?: SessionData | JiraFetchOptions,
  maybeSignal?: AbortSignal,
): Promise<T> {
  const options: JiraFetchOptions =
    sessionOrOptions && "method" in sessionOrOptions
      ? sessionOrOptions
      : { session: sessionOrOptions as SessionData | undefined, signal: maybeSignal };
  const { method = "GET", body, session, signal } = options;

  const { authHeader, baseUrl } = await resolveAuth(session);
  const url = `${baseUrl}${path}`;
  const headers: Record<string, string> = {
    Authorization: authHeader,
    Accept: "application/json",
  };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const isMutation = method !== "GET";
  const maxAttempts = isMutation ? 1 : MAX_ATTEMPTS;
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // If the caller has already aborted, bail immediately without retrying
    if (signal?.aborted) {
      throw new Error(`Jira request aborted for ${path}`);
    }

    let res: Response;

    try {
      res = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal,
      });
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
      if (res.status === 204) {
        return undefined as T;
      }
      const text = await res.text();
      return (text ? JSON.parse(text) : undefined) as T;
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
    // Jira always includes summary/status/issuetype on a parent link
    // regardless of the requested `fields` param — these are fixed fields
    // on the parent reference, not controlled by the search's field list.
    parent?: { id: string; key: string; fields: { summary: string; issuetype: JiraIssueType; status: JiraStatus } };
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

/**
 * Fetch every non-subtask issue in a project, regardless of epic — used for
 * the kanban board view, which (unlike the dependency graph) must show all
 * work items, including those under a done/closed epic or with no epic at all.
 *
 * Done issues resolved more than a week ago are excluded server-side (via
 * JQL) rather than fetched and filtered client-side — a long-lived project
 * can accumulate thousands of closed issues, and there's no reason to pull
 * that whole history down just to show a recent-activity board.
 */
export async function getProjectIssues(
  projectKey: string,
  session?: SessionData,
  signal?: AbortSignal,
): Promise<JiraIssue[]> {
  return searchIssues(
    `project = "${projectKey}" AND issuetype != Epic AND (statusCategory != Done OR resolutiondate >= -7d) ORDER BY created DESC`,
    ["summary", "status", "issuetype", "assignee", "parent", "subtasks", "issuelinks", "priority", "labels", "created"],
    session,
    signal,
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

// ── Write API ────────────────────────────────────────────────────────────────

export interface JiraTransition {
  id: string;
  name: string;
  to: JiraStatus;
  /** false when the user's role/workflow rules block this transition — Jira still lists it, greyed out. */
  isAvailable?: boolean;
}

export interface JiraFieldMeta {
  required: boolean;
  name: string;
  operations: string[]; // e.g. ["set"], ["add", "remove", "set"]
}

export interface JiraEditMeta {
  fields: Record<string, JiraFieldMeta>;
}

/** Fetch the transitions currently available to this user for an issue, honouring workflow + permissions. */
export async function getIssueTransitions(
  issueKey: string,
  session?: SessionData,
): Promise<JiraTransition[]> {
  const data = await jiraFetch<{ transitions: JiraTransition[] }>(
    `/issue/${encodeURIComponent(issueKey)}/transitions`,
    session,
  );
  return data.transitions;
}

/** Fetch which fields this user may edit on an issue — absent fields are read-only for them. */
export async function getIssueEditMeta(
  issueKey: string,
  session?: SessionData,
): Promise<JiraEditMeta> {
  return jiraFetch<JiraEditMeta>(`/issue/${encodeURIComponent(issueKey)}/editmeta`, session);
}

/** Whether this user holds the DELETE_ISSUE permission for a specific issue's project. */
export async function canDeleteIssue(issueKey: string, session?: SessionData): Promise<boolean> {
  const data = await jiraFetch<{ permissions: Record<string, { havePermission: boolean }> }>(
    `/mypermissions?issueKey=${encodeURIComponent(issueKey)}&permissions=DELETE_ISSUE`,
    session,
  );
  return data.permissions.DELETE_ISSUE?.havePermission ?? false;
}

/** Move an issue to a new status by transition id (from getIssueTransitions). */
export async function transitionIssue(
  issueKey: string,
  transitionId: string,
  session?: SessionData,
): Promise<void> {
  await jiraFetch<void>(`/issue/${encodeURIComponent(issueKey)}/transitions`, {
    method: "POST",
    body: { transition: { id: transitionId } },
    session,
  });
}

/** Update fields on an issue. Only pass fields the caller's editmeta says are editable. */
export async function updateIssue(
  issueKey: string,
  fields: Record<string, unknown>,
  session?: SessionData,
): Promise<void> {
  await jiraFetch<void>(`/issue/${encodeURIComponent(issueKey)}`, {
    method: "PUT",
    body: { fields },
    session,
  });
}

export interface CreateIssueInput {
  projectKey: string;
  issueTypeId: string;
  summary: string;
  description?: string;
  assigneeAccountId?: string;
  parentKey?: string;
}

/** Create a new issue. Returns the new issue's id and key. */
export async function createIssue(
  input: CreateIssueInput,
  session?: SessionData,
): Promise<{ id: string; key: string }> {
  const fields: Record<string, unknown> = {
    project: { key: input.projectKey },
    issuetype: { id: input.issueTypeId },
    summary: input.summary,
  };
  if (input.description) {
    fields.description = {
      type: "doc",
      version: 1,
      content: [
        { type: "paragraph", content: [{ type: "text", text: input.description }] },
      ],
    };
  }
  if (input.assigneeAccountId) {
    fields.assignee = { accountId: input.assigneeAccountId };
  }
  if (input.parentKey) {
    fields.parent = { key: input.parentKey };
  }

  return jiraFetch<{ id: string; key: string }>("/issue", {
    method: "POST",
    body: { fields },
    session,
  });
}

/** Permanently delete an issue. Irreversible — Jira does not support undo via this endpoint. */
export async function deleteIssue(issueKey: string, session?: SessionData): Promise<void> {
  await jiraFetch<void>(`/issue/${encodeURIComponent(issueKey)}`, {
    method: "DELETE",
    session,
  });
}
