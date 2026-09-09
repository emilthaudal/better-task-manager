"use client";

import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

/** Lightweight create dialog — title, type, and optional description. Styled after Linear's quick-create: the title field is the hero, metadata lives in small pill chips, no field labels or boxed borders. */
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
      <DialogContent className="gap-0 p-0 sm:max-w-lg">
        <DialogDescription className="sr-only">
          Create a new issue{epicSummary ? ` in ${epicSummary}` : ""}
        </DialogDescription>

        <div className="flex items-center gap-1.5 px-5 pt-4 pb-1 text-sm text-muted-foreground">
          {epicSummary && <span className="max-w-[240px] truncate">{epicSummary}</span>}
          {epicSummary && <span aria-hidden>›</span>}
          <DialogTitle className="text-sm leading-none font-normal text-muted-foreground">New issue</DialogTitle>
        </div>

        <div className="flex flex-col px-5 pb-2">
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
            placeholder="Issue title"
            className="h-auto border-0 bg-transparent px-0 py-1 text-xl font-medium shadow-none placeholder:text-muted-foreground/50 focus-visible:ring-0"
          />
          <Textarea
            id="create-description"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add description…"
            className="min-h-9 border-0 bg-transparent px-0 py-1 text-sm shadow-none placeholder:text-muted-foreground/40 focus-visible:ring-0"
          />
        </div>

        <div className="flex items-center gap-2 px-5 pb-4">
          <Select value={issueTypeId ?? undefined} onValueChange={setIssueTypeId} disabled={!types}>
            <SelectTrigger className="h-7 w-fit gap-1 rounded-full border-border/60 bg-transparent px-2.5 text-xs font-medium shadow-none hover:bg-accent">
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

        <div className="flex items-center justify-end gap-1 px-4 py-3">
          <Button variant="ghost" size="sm" onClick={onClose} className="text-muted-foreground">
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={!summary.trim() || !issueTypeId || submitting}
            className="rounded-full px-4"
          >
            {submitting ? "Creating…" : "Create issue"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
