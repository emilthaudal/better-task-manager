"use client";

import { useEffect, useState } from "react";
import { AlertCircle, User as UserIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
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
            <Badge variant="outline" className="font-mono text-[11px] font-semibold text-muted-foreground">
              {issue.key}
            </Badge>
            Edit issue
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col gap-4">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-title">Title</Label>
              {canEditSummary ? (
                <Input id="edit-title" value={summary} onChange={(e) => setSummary(e.target.value)} />
              ) : (
                <p className="text-sm text-muted-foreground">{summary}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-description">Description</Label>
              {canEditDescription ? (
                <Textarea
                  id="edit-description"
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              ) : (
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {description || "No description."}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Status</Label>
                {transitions.length > 0 ? (
                  <Select value={transitionId ?? undefined} onValueChange={setTransitionId}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={issue.fields.status.name} />
                    </SelectTrigger>
                    <SelectContent>
                      {transitions.map((t) => (
                        <SelectItem key={t.id} value={t.id} disabled={t.isAvailable === false}>
                          {t.to.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-sm text-muted-foreground py-1.5">{issue.fields.status.name}</p>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>Assignee</Label>
                {canEditAssignee ? (
                  <Select
                    value={assigneeAccountId ?? UNASSIGNED_VALUE}
                    onValueChange={(v) => setAssigneeAccountId(v === UNASSIGNED_VALUE ? null : v)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Unassigned" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNASSIGNED_VALUE}>
                        <UserIcon className="opacity-50" /> Unassigned
                      </SelectItem>
                      {assignableUsers.map((u) => (
                        <SelectItem key={u.accountId} value={u.accountId}>
                          {u.displayName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-sm text-muted-foreground py-1.5">
                    {issue.fields.assignee?.displayName ?? "Unassigned"}
                  </p>
                )}
              </div>
            </div>

            {issue.fields.priority && (
              <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                <AlertCircle className="size-3.5 opacity-70" />
                Priority ({issue.fields.priority.name}) isn&apos;t editable from this board yet.
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading || saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
