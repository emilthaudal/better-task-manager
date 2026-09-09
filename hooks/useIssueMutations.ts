import type { JiraIssue, JiraIssueType, JiraTransition, JiraUser } from "@/lib/jira";

export interface PermissionsResponse {
  transitions: JiraTransition[];
  editableFields: string[];
  canDelete: boolean;
}

export async function fetchPermissions(issueKey: string): Promise<PermissionsResponse> {
  const r = await fetch(`/api/jira/issue/${encodeURIComponent(issueKey)}/permissions`);
  if (!r.ok) throw new Error(`Failed to load permissions for ${issueKey} (${r.status})`);
  return r.json() as Promise<PermissionsResponse>;
}

export async function fetchFullIssue(issueKey: string): Promise<JiraIssue & { fields: { description?: unknown } }> {
  const r = await fetch(`/api/jira/issue/${encodeURIComponent(issueKey)}`);
  if (!r.ok) throw new Error(`Failed to load issue ${issueKey} (${r.status})`);
  return r.json();
}

/** Applies a transition by its id directly — use when the caller already knows which one (e.g. picked from a select). */
export async function transitionIssueById(issueKey: string, transitionId: string): Promise<void> {
  const r = await fetch(`/api/jira/issue/${encodeURIComponent(issueKey)}/transition`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transitionId }),
  });
  if (!r.ok) {
    const body = await r.json().catch(() => null);
    throw new Error(body?.error ?? `Failed to move issue (${r.status})`);
  }
}

export async function fetchAssignableUsers(issueKey: string, query?: string): Promise<JiraUser[]> {
  const params = query ? `?q=${encodeURIComponent(query)}` : "";
  const r = await fetch(`/api/jira/issue/${encodeURIComponent(issueKey)}/assignable-users${params}`);
  if (!r.ok) throw new Error(`Failed to load assignable users for ${issueKey} (${r.status})`);
  return r.json() as Promise<JiraUser[]>;
}

/** Sets or clears (accountId null) the assignee. Uses the plain fields PATCH — no dedicated Jira endpoint is needed for this. */
export async function assignIssue(issueKey: string, accountId: string | null): Promise<void> {
  await updateIssueFields(issueKey, { assignee: accountId ? { accountId } : null });
}

export async function updateIssueFields(issueKey: string, fields: Record<string, unknown>): Promise<void> {
  const r = await fetch(`/api/jira/issue/${encodeURIComponent(issueKey)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields }),
  });
  if (!r.ok) {
    const body = await r.json().catch(() => null);
    throw new Error(body?.error ?? `Failed to update issue (${r.status})`);
  }
}

export async function deleteIssueRequest(issueKey: string): Promise<void> {
  const r = await fetch(`/api/jira/issue/${encodeURIComponent(issueKey)}`, { method: "DELETE" });
  if (!r.ok) {
    const body = await r.json().catch(() => null);
    throw new Error(body?.error ?? `Failed to delete issue (${r.status})`);
  }
}

/**
 * Moves an issue to a new status. Looks up the transition id for the target
 * status at call time (rather than upfront for every card) so a board with
 * many cards doesn't fire a permissions request per card just to render.
 * Throws with a user-facing message on failure — callers should catch and
 * revert their own optimistic state.
 */
export async function moveIssue(issueKey: string, targetStatusId: string): Promise<void> {
  const { transitions } = await fetchPermissions(issueKey);
  const transition = transitions.find((t) => t.to.id === targetStatusId && t.isAvailable !== false);
  if (!transition) {
    throw new Error("You don't have permission to move this issue there.");
  }

  const r = await fetch(`/api/jira/issue/${encodeURIComponent(issueKey)}/transition`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transitionId: transition.id }),
  });
  if (!r.ok) {
    const body = await r.json().catch(() => null);
    throw new Error(body?.error ?? `Failed to move issue (${r.status})`);
  }
}

export async function fetchCreateIssueTypes(projectKey: string): Promise<JiraIssueType[]> {
  const r = await fetch(`/api/jira/issue-types?project=${encodeURIComponent(projectKey)}`);
  if (!r.ok) throw new Error(`Failed to load issue types (${r.status})`);
  return r.json() as Promise<JiraIssueType[]>;
}

export interface CreateIssuePayload {
  projectKey: string;
  issueTypeId: string;
  summary: string;
  description?: string;
  parentKey?: string;
}

/** Creates an issue and returns its key. Lands wherever the project's workflow puts a new issue — usually the first column. */
export async function createIssue(payload: CreateIssuePayload): Promise<{ id: string; key: string }> {
  const r = await fetch("/api/jira/issue", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const body = await r.json().catch(() => null);
    throw new Error(body?.error ?? `Failed to create issue (${r.status})`);
  }
  return r.json() as Promise<{ id: string; key: string }>;
}
