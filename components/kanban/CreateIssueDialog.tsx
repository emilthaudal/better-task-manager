"use client";

import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { JiraIssueType } from "@/lib/jira";
import { ISSUE_TYPE_LABEL, ISSUE_TYPE_FALLBACK } from "@/lib/graphConstants";
import { fetchCreateIssueTypes } from "@/hooks/useIssueMutations";

interface CreateIssueDialogProps {
  /** Epic summary shown for context, or null for the "No epic" swimlane. */
  epicSummary: string | null;
  projectKey: string;
  onClose: () => void;
  onCreate: (input: { summary: string; issueType: JiraIssueType; description?: string }) => Promise<void>;
}

/** Lightweight create dialog — title, type, and optional description. No modal-within-modal ceremony, just enough to match Jira's own create form without its full field sprawl. */
export default function CreateIssueDialog({ epicSummary, projectKey, onClose, onCreate }: CreateIssueDialogProps) {
  const [types, setTypes] = useState<JiraIssueType[] | null>(null);
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [issueTypeId, setIssueTypeId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetchCreateIssueTypes(projectKey).then((fetched) => {
      if (cancelled) return;
      setTypes(fetched);
      setIssueTypeId((fetched.find((t) => t.name === "Task") ?? fetched[0])?.id ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [projectKey]);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  async function handleSubmit() {
    const trimmed = summary.trim();
    const issueType = types?.find((t) => t.id === issueTypeId);
    if (!trimmed || !issueType || submitting) return;
    setSubmitting(true);
    try {
      await onCreate({ summary: trimmed, issueType, description: description.trim() || undefined });
      onClose();
    } catch {
      setSubmitting(false); // error toast is raised by the caller — keep the dialog open with the draft intact
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New issue</DialogTitle>
          {epicSummary && <DialogDescription>In {epicSummary}</DialogDescription>}
        </DialogHeader>

        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="create-title">Title</Label>
              <Input
                id="create-title"
                ref={titleRef}
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
                placeholder="Issue title…"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Type</Label>
              <Select value={issueTypeId ?? undefined} onValueChange={setIssueTypeId} disabled={!types}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue placeholder={types ? "Type" : "Loading…"} />
                </SelectTrigger>
                <SelectContent>
                  {types?.map((t) => {
                    const info = ISSUE_TYPE_LABEL[t.name] ?? { short: t.name, ...ISSUE_TYPE_FALLBACK };
                    return (
                      <SelectItem key={t.id} value={t.id}>
                        <span className="size-2 rounded-full shrink-0" style={{ background: info.color }} />
                        {t.name}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="create-description" className="justify-between">
              Description <span className="text-xs font-normal text-muted-foreground">optional</span>
            </Label>
            <Textarea
              id="create-description"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add more detail…"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!summary.trim() || !issueTypeId || submitting}>
            {submitting ? "Creating…" : "Create issue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
