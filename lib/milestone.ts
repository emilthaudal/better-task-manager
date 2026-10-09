import { jiraFetch, searchIssues } from "@/lib/jira";
import type { JiraIssue, JiraIssueLink, JiraStatus } from "@/lib/jira";
import type { SessionData } from "@/lib/session";
import { analyzeMilestone, progressOf } from "@/lib/milestoneAnalysis";
import type { EpicInput, ItemInput } from "@/lib/milestoneAnalysis";
import type {
  IncrementSummary,
  IssueRef,
  MilestoneDetail,
  MilestoneWarning,
  ProgramOverview,
  ProgramRelease,
  Release,
  StatusCategory,
  StatusRef,
} from "@/lib/milestoneTypes";

// ── Jira field ids ──────────────────────────────────────────────────────────

/** Atlassian Teams field ("Team") — owning team on increments, team epics and items. */
const TEAM_FIELD = "customfield_10001";
/** "Story point estimate" (team-managed) and "Story Points" (company-managed). */
const POINT_FIELDS = ["customfield_10016", "customfield_10067"];

/** Jira caps JQL length; chunk `key in (...)` / `parent in (...)` lists. */
const JQL_CHUNK = 80;

// ── Raw shapes ──────────────────────────────────────────────────────────────

interface JiraVersion {
  id: string;
  name: string;
  description?: string;
  released: boolean;
  archived: boolean;
  startDate?: string;
  releaseDate?: string;
  overdue?: boolean;
}

interface JiraTeamValue {
  id?: string;
  name?: string;
  title?: string;
}

type RawIssue = JiraIssue & {
  fields: JiraIssue["fields"] & {
    project?: { key: string; name: string };
    fixVersions?: Array<{ id: string; name: string }>;
    [field: string]: unknown;
  };
};

// ── Link helpers ────────────────────────────────────────────────────────────

const isBlocksLink = (l: JiraIssueLink) =>
  l.type.name.toLowerCase() === "blocks" || l.type.outward.toLowerCase() === "blocks";

const isImplementsLink = (l: JiraIssueLink) => l.type.outward.toLowerCase() === "implements";

/** Keys this issue blocks. */
function blocksKeys(issue: JiraIssue): string[] {
  return issue.fields.issuelinks
    .filter((l) => isBlocksLink(l) && l.outwardIssue)
    .map((l) => l.outwardIssue?.key ?? "");
}

/** Keys that block this issue. */
function blockedByKeys(issue: JiraIssue): string[] {
  return issue.fields.issuelinks
    .filter((l) => isBlocksLink(l) && l.inwardIssue)
    .map((l) => l.inwardIssue?.key ?? "");
}

function linkedRefs(issue: JiraIssue, direction: "outward" | "inward", match: (l: JiraIssueLink) => boolean): IssueRef[] {
  return issue.fields.issuelinks
    .filter(match)
    .map((l) => (direction === "outward" ? l.outwardIssue : l.inwardIssue))
    .filter((i): i is NonNullable<typeof i> => !!i)
    .map((i) => ({ key: i.key, summary: i.fields.summary, status: statusRef(i.fields.status) }));
}

// ── Normalisation ───────────────────────────────────────────────────────────

function statusRef(s: JiraStatus): StatusRef {
  const key = s.statusCategory.key;
  const category: StatusCategory = key === "done" || key === "indeterminate" ? key : "new";
  return { name: s.name, category };
}

function teamName(issue: RawIssue): string | null {
  const value = issue.fields[TEAM_FIELD] as JiraTeamValue | null | undefined;
  return value?.name ?? value?.title ?? null;
}

function points(issue: RawIssue): number | null {
  for (const f of POINT_FIELDS) {
    const v = issue.fields[f];
    if (typeof v === "number") return v;
  }
  return null;
}

function toRelease(v: JiraVersion, sequence: number): Release {
  return {
    id: v.id,
    name: v.name,
    description: v.description || null,
    released: v.released,
    archived: v.archived,
    startDate: v.startDate ?? null,
    releaseDate: v.releaseDate ?? null,
    overdue: v.overdue ?? false,
    sequence,
  };
}

function toIncrementSummary(issue: RawIssue): IncrementSummary {
  const sameProject = (key: string) => key.split("-")[0] === issue.key.split("-")[0];
  return {
    key: issue.key,
    summary: issue.fields.summary,
    status: statusRef(issue.fields.status),
    team: teamName(issue),
    capabilities: linkedRefs(issue, "outward", isImplementsLink),
    teamEpics: linkedRefs(issue, "inward", isImplementsLink),
    blocks: blocksKeys(issue).filter(sameProject),
    blockedBy: blockedByKeys(issue).filter(sameProject),
  };
}

// ── Fetching ────────────────────────────────────────────────────────────────

const INCREMENT_FIELDS = ["summary", "status", "issuetype", "issuelinks", "fixVersions", "assignee", TEAM_FIELD];
const EPIC_FIELDS = ["summary", "status", "issuetype", "issuelinks", "project", "assignee", TEAM_FIELD];
const ITEM_FIELDS = ["summary", "status", "issuetype", "issuelinks", "project", "assignee", "parent", TEAM_FIELD, ...POINT_FIELDS];

function chunks<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

async function searchByKeys(
  clause: "key" | "parent",
  keys: string[],
  fields: string[],
  session?: SessionData,
): Promise<RawIssue[]> {
  const unique = [...new Set(keys)];
  const pages = await Promise.all(
    chunks(unique, JQL_CHUNK).map((part) =>
      searchIssues(`${clause} in (${part.map((k) => `"${k}"`).join(", ")}) ORDER BY key ASC`, fields, session),
    ),
  );
  return pages.flat() as RawIssue[];
}

async function getReleases(projectKey: string, session?: SessionData): Promise<Release[]> {
  const versions = await jiraFetch<JiraVersion[]>(
    `/project/${encodeURIComponent(projectKey)}/versions`,
    session,
  );
  return versions.filter((v) => !v.archived).map(toRelease);
}

async function getProjectName(projectKey: string, session?: SessionData): Promise<string> {
  const p = await jiraFetch<{ key: string; name: string }>(
    `/project/${encodeURIComponent(projectKey)}`,
    session,
  );
  return p.name;
}

async function getIncrements(projectKey: string, session?: SessionData, versionId?: string): Promise<RawIssue[]> {
  const version = versionId ? ` AND fixVersion = ${Number(versionId)}` : "";
  return (await searchIssues(
    `project = "${projectKey}" AND issuetype = Epic${version} ORDER BY rank ASC`,
    INCREMENT_FIELDS,
    session,
  )) as RawIssue[];
}

// ── Program overview ────────────────────────────────────────────────────────

export async function getProgramOverview(projectKey: string, session?: SessionData): Promise<ProgramOverview> {
  const [name, releases, increments] = await Promise.all([
    getProjectName(projectKey, session),
    getReleases(projectKey, session),
    getIncrements(projectKey, session),
  ]);

  const byRelease = new Map<string, IncrementSummary[]>();
  const sequenceOf = new Map<string, number>();
  const unscheduled: IncrementSummary[] = [];
  for (const issue of increments) {
    const summary = toIncrementSummary(issue);
    const versions = issue.fields.fixVersions ?? [];
    if (versions.length === 0) unscheduled.push(summary);
    for (const v of versions) {
      byRelease.set(v.id, [...(byRelease.get(v.id) ?? []), summary]);
    }
  }
  for (const r of releases) {
    for (const inc of byRelease.get(r.id) ?? []) {
      sequenceOf.set(inc.key, Math.min(sequenceOf.get(inc.key) ?? Infinity, r.sequence));
    }
  }

  const programReleases: ProgramRelease[] = releases.map((r) => {
    const incs = byRelease.get(r.id) ?? [];
    return {
      ...r,
      increments: incs,
      progress: progressOf(incs.map((i) => i.status)),
      epicProgress: progressOf(incs.flatMap((i) => i.teamEpics.map((e) => e.status))),
    };
  });

  // An increment can't sensibly depend on one scheduled for a later milestone.
  const warnings: MilestoneWarning[] = [];
  const releaseName = new Map(releases.map((r) => [r.sequence, r.name]));
  for (const issue of increments) {
    const mine = sequenceOf.get(issue.key);
    if (mine === undefined) continue;
    for (const blocker of blockedByKeys(issue)) {
      const theirs = sequenceOf.get(blocker);
      if (theirs !== undefined && theirs > mine) {
        warnings.push({
          kind: "out-of-order-dependency",
          message: `${issue.key} (${releaseName.get(mine)}) is blocked by ${blocker}, which is scheduled for the later ${releaseName.get(theirs)}.`,
          keys: [issue.key, blocker],
        });
      }
    }
  }
  for (const inc of unscheduled) {
    warnings.push({
      kind: "unscheduled",
      message: `${inc.key} has no fix version, so it isn't in any milestone.`,
      keys: [inc.key],
    });
  }

  return {
    project: { key: projectKey, name },
    releases: programReleases,
    unscheduled,
    warnings,
    generatedAt: new Date().toISOString(),
  };
}

// ── Milestone detail ────────────────────────────────────────────────────────

export async function getMilestoneDetail(
  projectKey: string,
  versionId: string,
  session?: SessionData,
): Promise<MilestoneDetail> {
  const [name, releases, incrementIssues] = await Promise.all([
    getProjectName(projectKey, session),
    getReleases(projectKey, session),
    getIncrements(projectKey, session, versionId),
  ]);
  const release = releases.find((r) => r.id === versionId);
  if (!release) throw new Error(`Release ${versionId} not found in ${projectKey}`);

  const increments = incrementIssues.map(toIncrementSummary);
  const incrementsOfEpic = new Map<string, string[]>();
  for (const inc of increments) {
    for (const e of inc.teamEpics) {
      incrementsOfEpic.set(e.key, [...(incrementsOfEpic.get(e.key) ?? []), inc.key]);
    }
  }

  const epicKeys = [...incrementsOfEpic.keys()];
  const [epicIssues, childIssues] = await Promise.all([
    searchByKeys("key", epicKeys, EPIC_FIELDS, session),
    searchByKeys("parent", epicKeys, ITEM_FIELDS, session),
  ]);

  const epics: EpicInput[] = epicIssues.map((issue) => ({
    key: issue.key,
    summary: issue.fields.summary,
    status: statusRef(issue.fields.status),
    team: teamName(issue) ?? issue.fields.project?.name ?? issue.key.split("-")[0],
    projectKey: issue.fields.project?.key ?? issue.key.split("-")[0],
    assignee: issue.fields.assignee?.displayName ?? null,
    incrementKeys: incrementsOfEpic.get(issue.key) ?? [],
    blocks: blocksKeys(issue),
  }));
  const epicTeam = new Map(epics.map((e) => [e.key, e.team]));

  const toItem = (issue: RawIssue, external: boolean): ItemInput => {
    const epicKey = issue.fields.parent?.key ?? null;
    return {
      key: issue.key,
      summary: issue.fields.summary,
      type: issue.fields.issuetype.name,
      status: statusRef(issue.fields.status),
      assignee: issue.fields.assignee?.displayName ?? null,
      epicKey: external ? null : epicKey,
      // The owning team is the epic's — an item-level Team value is often
      // stale (copied from an old board) and would split one team in two.
      team:
        (!external && epicKey ? epicTeam.get(epicKey) : undefined) ??
        teamName(issue) ??
        issue.fields.project?.name ??
        issue.key.split("-")[0],
      points: points(issue),
      external,
      blocks: blocksKeys(issue),
    };
  };

  // `parent in (...)` also matches legacy issues migrated from old Epic Link
  // hierarchies that carry no parent field — they can't be attributed to an
  // epic, so they're left out rather than invented a team.
  const epicKeySet = new Set(epicKeys);
  const items = childIssues
    .filter((i) => !i.fields.issuetype.subtask && epicKeySet.has(i.fields.parent?.key ?? ""))
    .map((i) => toItem(i, false));

  // Blockers outside the milestone are pulled in as external nodes — an
  // out-of-scope blocker is exactly the kind of risk to surface. Dependants
  // outside it are not: they'd stretch this milestone's critical path with
  // work that isn't part of it.
  const known = new Set([...items.map((i) => i.key), ...epicKeys]);
  const externalKeys = new Set<string>();
  for (const issue of childIssues) {
    for (const k of blockedByKeys(issue)) {
      if (!known.has(k)) externalKeys.add(k);
    }
  }
  const externalIssues = await searchByKeys("key", [...externalKeys], ITEM_FIELDS, session);
  const externals = externalIssues.map((i) => toItem(i, true));
  const knownItems = new Set(items.map((i) => i.key));
  for (const ext of externals) {
    ext.blocks = ext.blocks.filter((k) => knownItems.has(k));
  }

  const analysis = analyzeMilestone({ increments, epics, items: [...items, ...externals] });

  return {
    project: { key: projectKey, name },
    release,
    ...analysis,
    generatedAt: new Date().toISOString(),
  };
}
