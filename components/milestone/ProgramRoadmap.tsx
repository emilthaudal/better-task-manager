"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import type { MilestoneWarning, ProgramOverview, ProgramRelease } from "@/lib/milestoneTypes";
import { KeyChip, ProgressBar, StatusDot, percentDone } from "./MilestoneBits";

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function ReleaseStage({ release, projectKey, index }: { release: ProgramRelease; projectKey: string; index: number }) {
  const date = formatDate(release.releaseDate);
  const state = release.released ? "Released" : release.overdue ? "Overdue" : release.increments.length ? "Planned" : "Empty";
  return (
    <Link
      href={`/program/${encodeURIComponent(projectKey)}/${release.id}`}
      className="group relative flex w-80 shrink-0 flex-col rounded-2xl border border-border bg-background/80 p-5 shadow-sm backdrop-blur transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
    >
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
          {index + 1}
        </span>
        <h3 className="flex-1 truncate text-base font-semibold text-foreground">{release.name}</h3>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
            release.released && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
            release.overdue && "bg-rose-500/10 text-rose-600 dark:text-rose-400",
            !release.released && !release.overdue && "bg-muted text-muted-foreground",
          )}
        >
          {state}
        </span>
      </div>

      <div className="mb-1 flex items-baseline justify-between text-xs text-muted-foreground">
        <span>
          {release.increments.length} increments · {release.epicProgress.total} team epics
        </span>
        <span className="font-semibold tabular-nums text-foreground">{percentDone(release.epicProgress)}%</span>
      </div>
      <ProgressBar progress={release.epicProgress} className="mb-4" />

      <ul className="flex flex-col gap-1.5">
        {release.increments.map((inc) => (
          <li key={inc.key} className="flex items-start gap-2 text-[13px]">
            <StatusDot status={inc.status} className="mt-1.5" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-foreground">{inc.capabilities[0]?.summary ?? inc.summary}</div>
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className="font-mono">{inc.key}</span>
                <span>·</span>
                <span>
                  {inc.teamEpics.filter((e) => e.status.category === "done").length}/{inc.teamEpics.length} epics done
                </span>
                {inc.blockedBy.length > 0 && <span className="text-amber-600 dark:text-amber-400">· waits on {inc.blockedBy.join(", ")}</span>}
              </div>
            </div>
          </li>
        ))}
        {release.increments.length === 0 && (
          <li className="text-xs italic text-muted-foreground">No increments scheduled yet.</li>
        )}
      </ul>

      <div className="mt-auto flex items-center justify-between pt-4 text-xs text-muted-foreground">
        <span>{date ? `Release ${date}` : "No release date"}</span>
        <span className="font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
          Critical path →
        </span>
      </div>
    </Link>
  );
}

function WarningList({ warnings }: { warnings: MilestoneWarning[] }) {
  if (warnings.length === 0) return null;
  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
      <h3 className="mb-2 text-sm font-semibold text-amber-700 dark:text-amber-400">Sequencing issues</h3>
      <ul className="flex flex-col gap-1 text-sm text-foreground">
        {warnings.map((w, i) => (
          <li key={i}>{w.message}</li>
        ))}
      </ul>
    </div>
  );
}

export default function ProgramRoadmap({ overview }: { overview: ProgramOverview }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-4 overflow-x-auto pb-4">
        {overview.releases.map((r, i) => (
          <div key={r.id} className="flex items-stretch">
            <ReleaseStage release={r} projectKey={overview.project.key} index={i} />
            {i < overview.releases.length - 1 && (
              <div className="flex w-6 items-center justify-center text-muted-foreground/50" aria-hidden="true">
                →
              </div>
            )}
          </div>
        ))}
        {overview.releases.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {overview.project.key} has no releases. Create one release per milestone in the delivery space.
          </p>
        )}
      </div>

      <WarningList warnings={overview.warnings} />

      {overview.unscheduled.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-foreground">Unscheduled increments</h3>
          <div className="flex flex-wrap gap-2">
            {overview.unscheduled.map((i) => (
              <span key={i.key} className="flex items-center gap-2 rounded-lg border border-border px-2 py-1 text-sm">
                <KeyChip issueKey={i.key} />
                {i.summary}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
