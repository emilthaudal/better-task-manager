"use client";

import { useCallback, useEffect, useState } from "react";
import { Layers, SlidersHorizontal, UsersRound } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { QUICK_FILTERS, hasQuickFilter, toggleQuickFilter } from "@/lib/milestoneView";
import type { MilestoneViewState, QuickFilter } from "@/lib/milestoneView";
import type { LaneMode } from "@/lib/milestoneLayout";
import { cn } from "@/lib/utils";

// The filter row and keyboard handling shared by a milestone and its team
// pages: the filter applies everywhere, so it looks and behaves the same.

const CHIPS: QuickFilter[] = ["critical", "ready", "unassigned", "cross", "outside"];

export function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
}

function SearchField({
  value,
  onChange,
  onSubmit,
  count,
  inputRef,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (backwards: boolean) => void;
  count: number | null;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <div className="relative flex w-full min-w-[180px] max-w-[320px] items-center">
      <svg className="pointer-events-none absolute left-2.5 text-[var(--ms-label-3)]" width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="7" cy="7" r="4.75" stroke="currentColor" strokeWidth="1.6" />
        <path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onSubmit(e.shiftKey);
          } else if (e.key === "Escape") {
            e.stopPropagation();
            if (value) onChange("");
            else e.currentTarget.blur();
          }
        }}
        placeholder="Filter items, epics, people, teams"
        aria-label="Filter"
        aria-describedby="ms-filter-count"
        className="h-8 w-full rounded-lg border-0 bg-[var(--ms-fill)] pl-8 pr-16 text-[13px] text-[var(--ms-label)] outline-none transition-shadow placeholder:text-[var(--ms-label-3)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--ms-accent)_35%,transparent)] [&::-webkit-search-cancel-button]:hidden"
      />
      <span id="ms-filter-count" className="pointer-events-none absolute right-2.5 text-[11px] font-medium tabular-nums text-[var(--ms-label-3)]">
        {count !== null ? (
          <span aria-live="polite">
            {count} match{count === 1 ? "" : "es"}
          </span>
        ) : (
          <kbd className="rounded bg-[var(--ms-fill-2)] px-1.5 py-[1px] font-sans text-[10.5px]">⌘F</kbd>
        )}
      </span>
    </div>
  );
}

/** Lanes and what the timeline includes — the mac app's lane-options menu. */
function LaneMenu({
  view,
  setView,
}: {
  view: MilestoneViewState;
  setView: (patch: Partial<MilestoneViewState>) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title="Group lanes by team or epic, and choose which items to show"
          className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-medium text-[var(--ms-label-2)] transition-colors hover:bg-[var(--ms-fill)] hover:text-[var(--ms-label)] data-[state=open]:bg-[var(--ms-fill)]"
        >
          {view.lanes === "team" ? <UsersRound size={15} aria-hidden="true" /> : <Layers size={15} aria-hidden="true" />}
          <span className="hidden sm:inline">{view.lanes === "team" ? "Teams" : "Epics"}</span>
          {(view.showDone || !view.showOutside) && (
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--ms-accent)]" aria-label="(customised)" />
          )}
          <SlidersHorizontal size={13} aria-hidden="true" className="text-[var(--ms-label-3)]" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="ms ms-menu w-60">
        <DropdownMenuLabel>Lanes</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={view.lanes} onValueChange={(v) => setView({ lanes: v as LaneMode })}>
          <DropdownMenuRadioItem value="team">By team</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="epic">By epic</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem checked={view.showDone} onCheckedChange={(on) => setView({ showDone: on === true })} onSelect={(e) => e.preventDefault()}>
          Show done items
          <DropdownMenuShortcut>⇧⌘D</DropdownMenuShortcut>
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem checked={view.showOutside} onCheckedChange={(on) => setView({ showOutside: on === true })} onSelect={(e) => e.preventDefault()}>
          Show work outside milestone
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function FilterBar({
  view,
  setView,
  count,
  onSubmit,
  inputRef,
  laneOptions,
  onShowShortcuts,
}: {
  view: MilestoneViewState;
  setView: (patch: Partial<MilestoneViewState>) => void;
  count: number | null;
  onSubmit: (backwards: boolean) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  laneOptions: boolean;
  onShowShortcuts: () => void;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-[var(--ms-sep)] px-6 py-2">
      <SearchField value={view.query} onChange={(query) => setView({ query })} onSubmit={onSubmit} count={count} inputRef={inputRef} />
      <div role="group" aria-label="Quick filters" className="ms-scroll-x flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
        {CHIPS.map((name) => {
          const on = hasQuickFilter(view.query, name);
          return (
            <button
              key={name}
              type="button"
              aria-pressed={on}
              onClick={() => setView({ query: toggleQuickFilter(view.query, name) })}
              className={cn(
                "shrink-0 whitespace-nowrap rounded-full px-3 py-[5px] text-[12px] font-medium transition-colors",
                on ? "bg-[var(--ms-accent)] text-white" : "bg-[var(--ms-fill-2)] text-[var(--ms-label-2)] hover:bg-[var(--ms-fill)] hover:text-[var(--ms-label)]",
              )}
            >
              {QUICK_FILTERS[name].label}
            </button>
          );
        })}
      </div>
      {laneOptions && <LaneMenu view={view} setView={setView} />}
      <button
        type="button"
        onClick={onShowShortcuts}
        aria-label="Keyboard shortcuts"
        title="Keyboard shortcuts (?)"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--ms-fill-2)] text-[13px] font-semibold text-[var(--ms-label-2)] transition-colors hover:bg-[var(--ms-fill)] hover:text-[var(--ms-label)]"
      >
        ?
      </button>
    </div>
  );
}

/**
 * Select vs inspect, after the mac app: clicking a row or pressing Return
 * selects and shows the inspector; arrow keys only move the selection, so the
 * inspector never pops in mid-navigation. A shared link that names an item
 * opens with it showing.
 */
export function useInspector(view: MilestoneViewState, setView: (patch: Partial<MilestoneViewState>) => void) {
  const [open, setOpen] = useState(() => !!view.item);
  const select = useCallback((key: string | null) => setView({ item: key }), [setView]);
  const inspect = useCallback(
    (key: string) => {
      setView({ item: key });
      setOpen(true);
    },
    [setView],
  );
  return { open: open && !!view.item, setOpen, select, inspect };
}

/**
 * Keys every milestone page answers: ⌘F / ⌘K / "/" filter, "?" shortcuts,
 * Esc, ⌥⌘I inspector, ⇧⌘O open in Jira. `extra` handles page-specific keys
 * first and returns true when it used the event.
 */
export function useWorkspaceKeys({
  searchRef,
  shortcutsOpen,
  setShortcutsOpen,
  selectedKey,
  clearSelection,
  toggleInspector,
  jiraBaseUrl,
  extra,
}: {
  searchRef: React.RefObject<HTMLInputElement | null>;
  shortcutsOpen: boolean;
  setShortcutsOpen: (fn: (open: boolean) => boolean) => void;
  selectedKey: string | null;
  clearSelection: () => void;
  toggleInspector: () => void;
  jiraBaseUrl: string;
  extra?: (e: KeyboardEvent, typing: boolean) => boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = isTyping(e.target);
      const cmd = e.metaKey || e.ctrlKey;
      if (extra?.(e, typing)) return;
      if ((cmd && !e.shiftKey && !e.altKey && (e.key === "f" || e.key === "k")) || (e.key === "/" && !typing && !cmd)) {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      } else if (cmd && e.altKey && e.code === "KeyI") {
        e.preventDefault();
        toggleInspector();
      } else if (cmd && e.shiftKey && e.code === "KeyO") {
        e.preventDefault();
        if (selectedKey && jiraBaseUrl) window.open(`${jiraBaseUrl}/browse/${selectedKey}`, "_blank", "noopener,noreferrer");
      } else if (e.key === "?" && !typing) {
        e.preventDefault();
        setShortcutsOpen((open) => !open);
      } else if (e.key === "Escape" && !typing) {
        // Esc closes the sheet first, then clears the selection.
        if (shortcutsOpen) setShortcutsOpen(() => false);
        else if (!e.defaultPrevented) clearSelection();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [searchRef, shortcutsOpen, setShortcutsOpen, selectedKey, clearSelection, toggleInspector, jiraBaseUrl, extra]);
}
