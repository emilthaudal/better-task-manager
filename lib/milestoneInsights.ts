import { QUICK_FILTERS, matchItems, teamToken } from "@/lib/milestoneView";
import type { QuickFilter } from "@/lib/milestoneView";
import type {
  BlockerEpic,
  Increment,
  IncrementSummary,
  ItemSchedule,
  MilestoneDetail,
  MilestoneWarning,
  ProgramOverview,
  Release,
  TeamEpic,
  TeamSummary,
  WarningKind,
  WorkItem,
} from "@/lib/milestoneTypes";

// ── Plain-language readings of a milestone ──────────────────────────────────
//
// Ports of the mac app's MilestoneFormatting.swift and the view-level helpers
// next to it, so both clients word, rank and flag things identically. Pure, so
// they can be tested without rendering.

export const plural = (count: number, singular: string, pluralForm = `${singular}s`) =>
  `${count} ${count === 1 ? singular : pluralForm}`;

export const steps = (count: number) => plural(count, "step");

/** Level 0 is "Now" because it holds everything with no remaining blockers. */
export function levelTitle(level: number | null): string {
  if (level === null) return "Done";
  return level === 0 ? "Now" : `Step ${level + 1}`;
}

/** Levels are steps: the backend schedules without trusting estimates, one step per item. */
export function scheduleSummary(s: ItemSchedule): string {
  const start = s.ready ? "Can start now" : s.earliestStart === 0 ? "Waiting on a blocker" : `Starts after ${steps(s.earliestStart)}`;
  return `${start} · ${s.slack === 0 ? "on the critical path" : `${steps(s.slack)} of slack`}`;
}

export function scheduleExplanation(s: ItemSchedule): string {
  if (s.critical) return "Any delay here delays the whole milestone — nothing in the plan can absorb it.";
  return `Can slip up to ${steps(s.slack)} without moving the milestone’s finish.`;
}

// ── Warnings ────────────────────────────────────────────────────────────────

const WARNING_TITLE: Record<WarningKind, string> = {
  cycle: "Dependency cycle",
  "undeclared-dependency": "Undeclared dependency",
  "unbacked-dependency": "Unbacked dependency",
  "out-of-order-dependency": "Out-of-order dependency",
  "external-blocker": "Blocked from outside",
  "no-team-epics": "No team epics",
  unscheduled: "Unscheduled",
  "unassigned-critical": "Unassigned critical work",
  "unapproved-design": "Building without sign-off",
};

/** Unknown kinds (a newer server) read as their slug, title-cased — never a blank row. */
export function warningTitle(kind: string): string {
  return (
    WARNING_TITLE[kind as WarningKind] ??
    kind
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ")
  );
}

/**
 * Cycles and out-of-order links make the plan itself wrong, and blockers from
 * outside or unowned critical work put the date at risk; the rest is hygiene
 * that can be scheduled around.
 */
const SEVERE = new Set<string>(["cycle", "out-of-order-dependency", "external-blocker", "unassigned-critical", "unapproved-design"]);

export const isSevere = (kind: string) => SEVERE.has(kind);

export function severeCount(warnings: MilestoneWarning[]): number {
  return warnings.filter((w) => isSevere(w.kind)).length;
}

/** "2 need attention" / "nothing severe" — the header tile's second line. */
export function warningsDetail(warnings: MilestoneWarning[]): string {
  const severe = severeCount(warnings);
  return severe === 0 ? "nothing severe" : `${severe} need${severe === 1 ? "s" : ""} attention`;
}

/** Unique keys in natural order (LAD-9 before LAD-10). */
export function sortedKeys(keys: string[]): string[] {
  return [...new Set(keys)].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

// ── Releases ────────────────────────────────────────────────────────────────

export type ReleaseState = { kind: "released" } | { kind: "overdue" } | { kind: "due"; date: Date } | { kind: "undated" };

/**
 * Jira version dates are calendar days with no zone ("2026-12-15"); reading
 * them as UTC would show "Due 14 Dec" west of Greenwich.
 */
export function parseJiraDate(value: string | null): Date | null {
  const m = value?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function releaseState(release: Pick<Release, "released" | "overdue" | "releaseDate">): ReleaseState {
  if (release.released) return { kind: "released" };
  if (release.overdue) return { kind: "overdue" };
  const date = parseJiraDate(release.releaseDate);
  return date ? { kind: "due", date } : { kind: "undated" };
}

export function releaseStateLabel(state: ReleaseState): string {
  switch (state.kind) {
    case "released":
      return "Released";
    case "overdue":
      return "Overdue";
    case "undated":
      return "No date";
    case "due":
      return `Due ${state.date.toLocaleDateString(undefined, { day: "numeric", month: "short" })}`;
  }
}

/**
 * Increment → its blockers that ship in a later milestone (or in none), which
 * means it can't actually ship with its own. Blockers the program doesn't know
 * about are left to the server's warnings.
 */
export function outOfOrderBlockers(program: ProgramOverview): Map<string, string[]> {
  const sequenceOf = new Map<string, number>();
  for (const r of program.releases) for (const inc of r.increments) sequenceOf.set(inc.key, r.sequence);
  for (const inc of program.unscheduled) sequenceOf.set(inc.key, Infinity);
  const result = new Map<string, string[]>();
  for (const r of program.releases) {
    for (const inc of r.increments) {
      const late = inc.blockedBy.filter((k) => (sequenceOf.get(k) ?? -Infinity) > r.sequence);
      if (late.length) result.set(inc.key, late);
    }
  }
  return result;
}

/** Where to land when entering the program: the last milestone viewed, else the next one to ship. */
export function landingMilestone(program: ProgramOverview, lastViewed: string | null): string | null {
  if (lastViewed && program.releases.some((r) => r.id === lastViewed)) return lastViewed;
  return (program.releases.find((r) => !r.released) ?? program.releases[0])?.id ?? null;
}

// ── Increment links ─────────────────────────────────────────────────────────

export type LinkEvidence = "declared-and-backed" | "declared-only" | "derived-only";

export const LINK_EVIDENCE: Record<LinkEvidence, { label: string; help: string }> = {
  "declared-and-backed": {
    label: "Declared & backed",
    help: "Declared on the increments and backed by team-level blocking links",
  },
  "declared-only": {
    label: "Declared, no team link",
    help: "Declared on the increments, but no team-level link backs it",
  },
  "derived-only": {
    label: "Undeclared",
    help: "Team-level links create this dependency, but the increments don’t declare it",
  },
};

/** How a link between increments is known: declared in Jira, derived from team work, or both. */
export function incrementLinks(declared: string[], derived: string[]): Array<{ key: string; evidence: LinkEvidence }> {
  const keys = [...new Set([...declared, ...derived])];
  return keys.map((key) => ({
    key,
    evidence: declared.includes(key) ? (derived.includes(key) ? "declared-and-backed" : "declared-only") : "derived-only",
  }));
}

// ── Teams ───────────────────────────────────────────────────────────────────

/** Critical work first, then the most remaining — where attention pays off. */
export function sortTeams(teams: TeamSummary[]): TeamSummary[] {
  return [...teams].sort((a, b) => b.criticalItems - a.criticalItems || b.remaining - a.remaining || a.name.localeCompare(b.name));
}

/** One plain-language observation that points at a redistribution decision. */
export function loadInsight(team: TeamSummary): string | null {
  if (team.remaining <= 0 || team.loadByLevel.length === 0) return null;
  const peak = Math.max(...team.loadByLevel);
  const peakLevel = team.loadByLevel.indexOf(peak);
  if (team.blockingOtherTeams > 0) {
    return `Holds up ${plural(team.blockingOtherTeams, "item")} in other teams — its gating work should go first.`;
  }
  if (peak >= 3 && peak * 2 >= team.remaining) {
    return `Load peaks at ${levelTitle(peakLevel)} (${plural(peak, "item")}) — consider spreading it.`;
  }
  if (team.unassignedRemaining > 0 && team.criticalItems > 0) return "Has critical work with no assignee.";
  return null;
}

const remainingItem = (byKey: Map<string, WorkItem>, key: string) => {
  const item = byKey.get(key);
  return item && item.status.category !== "done" ? item : undefined;
};

/** A team's remaining items that another team's remaining work waits on. */
export function blockingOtherTeams(detail: MilestoneDetail, team: string): WorkItem[] {
  const byKey = new Map(detail.items.map((i) => [i.key, i]));
  return detail.items.filter(
    (i) => i.team === team && i.status.category !== "done" && i.blocks.some((k) => (remainingItem(byKey, k)?.team ?? team) !== team),
  );
}

/** A team's remaining items held up by another team's remaining work. */
export function waitingOnOtherTeams(detail: MilestoneDetail, team: string): WorkItem[] {
  const byKey = new Map(detail.items.map((i) => [i.key, i]));
  return detail.items.filter(
    (i) => i.team === team && i.status.category !== "done" && i.blockedBy.some((k) => (remainingItem(byKey, k)?.team ?? team) !== team),
  );
}

/** Other teams an item is linked to either way — the point of the cross-team lists. */
export function linkedTeams(item: WorkItem, byKey: Map<string, WorkItem>): string[] {
  const teams = new Set<string>();
  for (const k of [...item.blocks, ...item.blockedBy]) {
    const other = byKey.get(k)?.team;
    if (other && other !== item.team) teams.add(other);
  }
  return [...teams].sort();
}

/** On the critical path first, then by when their remaining work can start. */
export function sortEpics(epics: TeamEpic[]): TeamEpic[] {
  return [...epics].sort(
    (a, b) =>
      Number(b.onCriticalPath) - Number(a.onCriticalPath) ||
      (a.earliestStart ?? Infinity) - (b.earliestStart ?? Infinity) ||
      a.key.localeCompare(b.key, undefined, { numeric: true }),
  );
}

/** "Now → Step 4" — the steps an epic's remaining work spans. */
export function epicSpan(epic: Pick<TeamEpic, "earliestStart" | "earliestFinish">): string | null {
  if (epic.earliestStart === null || epic.earliestFinish === null) return null;
  return `${levelTitle(epic.earliestStart)} → ${levelTitle(Math.max(epic.earliestStart, epic.earliestFinish - 1))}`;
}

// ── Filtering beyond the timeline ───────────────────────────────────────────

interface ParsedQuery {
  terms: string[];
  teams: string[];
  quick: QuickFilter[];
}

function parseQuery(query: string): ParsedQuery | null {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;
  const parsed: ParsedQuery = { terms: [], teams: [], quick: [] };
  for (const t of tokens) {
    if (t.startsWith("is:") && Object.hasOwn(QUICK_FILTERS, t.slice(3))) parsed.quick.push(t.slice(3) as QuickFilter);
    else if (t.startsWith("team:") && t.length > 5) parsed.teams.push(t.slice(5));
    else parsed.terms.push(t);
  }
  return parsed;
}

/**
 * Whether a non-item row (epic, increment, warning) matches on its own text.
 * `is:` filters describe work items, so a row only meets them through its items.
 */
function ownMatch(q: ParsedQuery, fields: Array<string | null | undefined>, team: string | null): boolean {
  if (q.quick.length) return false;
  if (q.teams.length && (!team || !q.teams.every((t) => t === teamToken(team)))) return false;
  const haystack = fields.filter(Boolean).join(" ").toLowerCase();
  return q.terms.every((t) => haystack.includes(t));
}

/** Blocker epics that match on their own text or through any of their items; keeps each one's rank. */
export function filterBlockers(detail: MilestoneDetail, query: string): Array<{ blocker: BlockerEpic; rank: number }> {
  const ranked = detail.blockerEpics.map((blocker, i) => ({ blocker, rank: i + 1 }));
  const q = parseQuery(query);
  if (!q) return ranked;
  const items = matchItems(detail, query) ?? new Set<string>();
  const epics = new Map(detail.epics.map((e) => [e.key, e]));
  return ranked.filter(({ blocker }) => {
    const epic = epics.get(blocker.epicKey);
    return (
      ownMatch(q, [blocker.epicKey, epic?.summary, blocker.team, epic?.assignee], blocker.team) ||
      (epic?.itemKeys ?? []).some((k) => items.has(k))
    );
  });
}

export function filterIncrements(detail: MilestoneDetail, query: string): Increment[] {
  const q = parseQuery(query);
  if (!q) return detail.increments;
  const items = matchItems(detail, query) ?? new Set<string>();
  const viaItems = new Set(detail.items.filter((i) => i.incrementKey && items.has(i.key)).map((i) => i.incrementKey));
  return detail.increments.filter(
    (inc) =>
      viaItems.has(inc.key) ||
      ownMatch(q, [inc.key, inc.summary, ...inc.capabilities.flatMap((c) => [c.key, c.summary])], inc.team),
  );
}

export function filterWarnings(detail: MilestoneDetail, warnings: MilestoneWarning[], query: string): MilestoneWarning[] {
  const q = parseQuery(query);
  if (!q) return warnings;
  const items = matchItems(detail, query) ?? new Set<string>();
  return warnings.filter((w) => w.keys.some((k) => items.has(k)) || ownMatch(q, [w.message, warningTitle(w.kind), ...w.keys], null));
}

/** Items in `keys` order that match, or all of them when there's no filter. */
export function filterItems(items: WorkItem[], matches: Set<string> | null): WorkItem[] {
  return matches ? items.filter((i) => matches.has(i.key)) : items;
}

/** Roadmap search: plain text over an increment, its capabilities and team epics. */
export function matchesIncrement(inc: IncrementSummary, query: string): boolean {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = [
    inc.key,
    inc.summary,
    inc.team ?? "",
    ...inc.capabilities.flatMap((c) => [c.key, c.summary]),
    ...inc.teamEpics.flatMap((e) => [e.key, e.summary]),
  ]
    .join(" ")
    .toLowerCase();
  return terms.every((t) => haystack.includes(t));
}

// ── Search as "go to" ───────────────────────────────────────────────────────

/**
 * Matching items in jump order: critical first, then the earliest to start.
 * Return in the filter lands on the first — search works as "go to", not only
 * as a dimmer — and repeats step through the rest.
 */
export function rankMatches(
  detail: MilestoneDetail,
  matches: Set<string> | null,
  { showDone, showOutside }: { showDone: boolean; showOutside: boolean },
): string[] {
  if (!matches) return [];
  return detail.items
    .map((item, order) => ({ item, order }))
    .filter(({ item }) => matches.has(item.key) && (item.schedule || showDone) && (showOutside || !item.external))
    .sort(
      (a, b) =>
        Number(!!b.item.schedule?.critical) - Number(!!a.item.schedule?.critical) ||
        (a.item.schedule?.earliestStart ?? Infinity) - (b.item.schedule?.earliestStart ?? Infinity) ||
        a.order - b.order,
    )
    .map(({ item }) => item.key);
}
