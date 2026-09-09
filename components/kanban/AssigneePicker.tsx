"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { JiraIssue, JiraUser } from "@/lib/jira";
import { fetchAssignableUsers } from "@/hooks/useIssueMutations";

export function avatarInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

/** Deterministic hue per assignee so different people get visibly different avatar colors. */
export function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 55%, 45%)`;
}

/** Debounce so a search query doesn't fire a Jira request on every keystroke. */
const SEARCH_DEBOUNCE_MS = 250;

interface AssigneePickerProps {
  issue: JiraIssue;
  onAssign: (user: JiraUser | null) => void;
  /** People who already show up as assignees on this board — shown by default instead of every assignable org member. */
  teamMembers: JiraUser[];
}

/** Click-to-assign avatar: opens a dropdown defaulting to the board's own team, with a search box for anyone else. */
export default function AssigneePicker({ issue, onAssign, teamMembers }: AssigneePickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<JiraUser[] | null>(null);
  const [searching, setSearching] = useState(false);
  const assignee = issue.fields.assignee;

  const defaultList = useMemo(() => {
    const list = [...teamMembers];
    if (assignee && !list.some((u) => u.accountId === assignee.accountId)) {
      list.push(assignee);
    }
    return list.sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [teamMembers, assignee]);

  useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();
    // Stale searchResults from a previous query are harmless here — an empty
    // query always falls back to defaultList regardless of what's stored.
    if (!trimmed) return;
    const timer = setTimeout(() => {
      setSearching(true);
      fetchAssignableUsers(issue.key, trimmed)
        .then(setSearchResults)
        .catch(() => setSearchResults([]))
        .finally(() => setSearching(false));
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [open, query, issue.key]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setQuery("");
      setSearchResults(null);
    }
  }

  const isSearching = query.trim().length > 0;
  const list = isSearching ? (searchResults ?? []) : defaultList;

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={assignee ? `Assigned to ${assignee.displayName}` : "Assign issue"}
          title={assignee ? assignee.displayName : "Unassigned — click to assign"}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 hover:ring-2 hover:ring-offset-1 hover:ring-slate-300 dark:hover:ring-slate-600 transition-shadow"
        >
          {assignee ? (
            <span
              className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
              style={{ background: avatarColor(assignee.displayName) }}
            >
              {avatarInitials(assignee.displayName)}
            </span>
          ) : (
            <span className="w-5 h-5 rounded-full flex items-center justify-center bg-accent text-muted-foreground">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
                <path d="M12 12c2.7 0 4.9-2.2 4.9-4.9S14.7 2.2 12 2.2 7.1 4.4 7.1 7.1 9.3 12 12 12Zm0 2.4c-3.3 0-9.8 1.6-9.8 4.9v2.5h19.6v-2.5c0-3.3-6.5-4.9-9.8-4.9Z" />
              </svg>
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-56"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <div className="p-1">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            placeholder="Search people…"
            className="w-full text-[13px] rounded-md border border-border bg-muted px-2 py-1.5 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900"
          />
        </div>
        <DropdownMenuSeparator />
        {!isSearching && defaultList.length > 0 && (
          <div className="px-2 pt-1 pb-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            Team
          </div>
        )}
        {searching && <DropdownMenuItem disabled>Searching…</DropdownMenuItem>}
        {!searching && list.length === 0 && (
          <DropdownMenuItem disabled>{isSearching ? "No matches" : "No teammates yet — search above"}</DropdownMenuItem>
        )}
        {!searching &&
          list.map((u) => (
            <DropdownMenuItem key={u.accountId} onSelect={() => onAssign(u)}>
              <span
                className="w-4 h-4 rounded-full flex items-center justify-center text-[7px] font-bold text-white shrink-0"
                style={{ background: avatarColor(u.displayName) }}
              >
                {avatarInitials(u.displayName)}
              </span>
              {u.displayName}
            </DropdownMenuItem>
          ))}
        {assignee && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onAssign(null)} variant="destructive">
              Unassign
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
