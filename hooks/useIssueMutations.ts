import type { JiraTransition } from "@/lib/jira";

interface PermissionsResponse {
  transitions: JiraTransition[];
  editableFields: string[];
  canDelete: boolean;
}

async function fetchPermissions(issueKey: string): Promise<PermissionsResponse> {
  const r = await fetch(`/api/jira/issue/${encodeURIComponent(issueKey)}/permissions`);
  if (!r.ok) throw new Error(`Failed to load permissions for ${issueKey} (${r.status})`);
  return r.json() as Promise<PermissionsResponse>;
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
