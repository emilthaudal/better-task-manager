"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { JiraIssue, JiraTransition, JiraUser } from "@/lib/jira";
import { adfToPlainText, textToAdf } from "@/lib/adf";
import {
  fetchAssignableUsers,
  fetchFullIssue,
  fetchPermissions,
  transitionIssueById,
  updateIssueFields,
} from "@/hooks/useIssueMutations";

const UNASSIGNED_VALUE = "__unassigned__";

interface EditIssueDialogProps {
  issue: JiraIssue;
  onClose: () => void;
  /** Called after a successful save with whatever changed, so the board can update without waiting on the next poll. */
  onSaved: (patch: { summary?: string; status?: JiraIssue["fields"]["status"]; assignee?: JiraUser | null }) => void;
  onError: (message: string) => void;
}

export default function EditIssueDialog({ issue, onClose, onSaved, onError }: EditIssueDialogProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editableFields, setEditableFields] = useState<Set<string>>(new Set());
  const [transitions, setTransitions] = useState<JiraTransition[]>([]);
  const [assignableUsers, setAssignableUsers] = useState<JiraUser[]>([]);

  const [summary, setSummary] = useState(issue.fields.summary);
  const [description, setDescription] = useState("");
  const [transitionId, setTransitionId] = useState<string | null>(null);
  const [assigneeAccountId, setAssigneeAccountId] = useState<string | null>(
    issue.fields.assignee?.accountId ?? null,
  );

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchFullIssue(issue.key), fetchPermissions(issue.key), fetchAssignableUsers(issue.key)])
      .then(([full, perms, users]) => {
        if (cancelled) return;
        setSummary(full.fields.summary);
        setDescription(adfToPlainText(full.fields.description));
        setEditableFields(new Set(perms.editableFields));
        setTransitions(perms.transitions);
        setAssignableUsers(users);
      })
      .catch((err) => onError(err instanceof Error ? err.message : "Failed to load issue."))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issue.key]);

  const canEditSummary = editableFields.has("summary");
  const canEditDescription = editableFields.has("description");
  const canEditAssignee = editableFields.has("assignee");

  async function handleSave() {
    setSaving(true);
    try {
      const fields: Record<string, unknown> = {};
      if (canEditSummary && summary.trim() && summary !== issue.fields.summary) {
        fields.summary = summary.trim();
      }
      if (canEditDescription) {
        fields.description = textToAdf(description);
      }
      const assigneeChanged = canEditAssignee && assigneeAccountId !== (issue.fields.assignee?.accountId ?? null);
      if (assigneeChanged) {
        fields.assignee = assigneeAccountId ? { accountId: assigneeAccountId } : null;
      }
      if (Object.keys(fields).length > 0) {
        await updateIssueFields(issue.key, fields);
      }

      let newStatus: JiraIssue["fields"]["status"] | undefined;
      if (transitionId) {
        await transitionIssueById(issue.key, transitionId);
        newStatus = transitions.find((t) => t.id === transitionId)?.to;
      }

      onSaved({
        summary: fields.summary as string | undefined,
        status: newStatus,
        assignee: assigneeChanged
          ? (assignableUsers.find((u) => u.accountId === assigneeAccountId) ?? null)
          : undefined,
      });
      onClose();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to save changes.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-[12px] font-mono font-semibold text-slate-400 dark:text-slate-500">{issue.key}</span>
            Edit issue
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center text-sm text-slate-400 dark:text-slate-500">Loading…</div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                Title
              </label>
              {canEditSummary ? (
                <input
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  className="text-sm rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900"
                />
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400">{summary}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                Description
              </label>
              {canEditDescription ? (
                <Textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400 whitespace-pre-wrap">
                  {description || "No description."}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                Status
              </label>
              {transitions.length > 0 ? (
                <Select value={transitionId ?? undefined} onValueChange={setTransitionId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={issue.fields.status.name} />
                  </SelectTrigger>
                  <SelectContent>
                    {transitions.map((t) => (
                      <SelectItem key={t.id} value={t.id} disabled={t.isAvailable === false}>
                        {t.name} → {t.to.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {issue.fields.status.name} — no other status is available to you.
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                Assignee
              </label>
              {canEditAssignee ? (
                <Select
                  value={assigneeAccountId ?? UNASSIGNED_VALUE}
                  onValueChange={(v) => setAssigneeAccountId(v === UNASSIGNED_VALUE ? null : v)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Unassigned" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNASSIGNED_VALUE}>Unassigned</SelectItem>
                    {assignableUsers.map((u) => (
                      <SelectItem key={u.accountId} value={u.accountId}>
                        {u.displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {issue.fields.assignee?.displayName ?? "Unassigned"}
                </p>
              )}
            </div>

            {issue.fields.priority && (
              <div className="flex items-center gap-2 text-[11.5px] text-slate-400 dark:text-slate-500">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 8v5M12 16h.01" />
                </svg>
                Priority ({issue.fields.priority.name}) isn&apos;t editable from this board yet.
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <button
            type="button"
            onClick={onClose}
            className="text-[13px] font-semibold px-3 py-1.5 rounded-md text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={loading || saving}
            className="text-[13px] font-semibold px-3.5 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white transition-colors"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
