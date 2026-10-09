"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import type { MilestoneWarning, ProgramOverview, ProgramRelease } from "@/lib/milestoneTypes";
import { Badge, KeyChip, ProgressBar, SectionTitle, StatusDot, Surface, percentDone } from "./MilestoneBits";

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

type Stage = "released" | "overdue" | "next" | "planned" | "empty";

function stageOf(release: ProgramRelease, isNext: boolean): Stage {
  if (release.released) return "released";
  if (release.overdue) return "overdue";
  if (isNext) return "next";
  return release.increments.length ? "planned" : "empty";
}

const STAGE_LABEL: Record<Stage, string> = {
  released: "Released",
  overdue: "Overdue",
  next: "Up next",
  planned: "Planned",
  empty: "Empty",
};

function ReleaseStage({
  release,
  href,
  stage,
}: {
  release: ProgramRelease;
  href: string;
  stage: Stage;
}) {
  const date = formatDate(release.releaseDate);
  const shown = release.increments.slice(0, 6);
  const more = release.increments.length - shown.length;
  return (
    <Link
      href={href}
      aria-label={`${release.name}, milestone ${release.sequence + 1}, ${STAGE_LABEL[stage]}. Open critical path.`}
      className={cn(
        "group relative flex w-[300px] flex-1 shrink-0 snap-start flex-col rounded-2xl bg-[var(--ms-surface)] p-5 shadow-[var(--ms-shadow-card)] transition-[transform,box-shadow] duration-300 ease-[var(--ms-ease)] hover:-translate-y-0.5 hover:shadow-[var(--ms-shadow-hover)]",
        stage === "next" && "outline-2 outline-offset-0 outline-[var(--ms-accent)] outline-solid",
        stage === "empty" && "bg-transparent shadow-[inset_0_0_0_1px_var(--ms-sep-strong)]",
      )}
    >
      <div className="mb-3 flex items-center gap-2">
        <span className="text-[12px] font-medium text-[var(--ms-label-3)]">Milestone {release.sequence + 1}</span>
        <span className="ml-auto">
          <Badge tone={stage === "released" ? "ready" : stage === "overdue" ? "critical" : undefined}>
            <span className={cn(stage === "next" && "text-[var(--ms-accent-text)]")}>{STAGE_LABEL[stage]}</span>
          </Badge>
        </span>
      </div>
      <h3 className="text-[19px] font-semibold leading-tight tracking-[-0.015em] text-[var(--ms-label)]">{release.name}</h3>
      <div className="mt-0.5 text-[12.5px] text-[var(--ms-label-2)]">{date ? `${release.released ? "Released" : "Due"} ${date}` : "No release date"}</div>

      {release.increments.length > 0 && (
        <>
          <div className="mb-1.5 mt-4 flex items-baseline justify-between">
            <span className="text-[12px] text-[var(--ms-label-2)]">
              {release.epicProgress.done} of {release.epicProgress.total} team epics done
            </span>
            <span className="text-[15px] font-semibold tabular-nums text-[var(--ms-label)]">{percentDone(release.epicProgress)}%</span>
          </div>
          <ProgressBar progress={release.epicProgress} />
        </>
      )}

      <ul className="mt-4 flex flex-col gap-2.5">
        {shown.map((inc) => {
          const epicsDone = inc.teamEpics.filter((e) => e.status.category === "done").length;
          return (
            <li key={inc.key} className="flex items-start gap-2">
              <StatusDot status={inc.status} className="mt-[5px]" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium text-[var(--ms-label)]">{inc.capabilities[0]?.summary ?? inc.summary}</div>
                <div className="flex items-center gap-1 text-[11.5px] text-[var(--ms-label-3)]">
                  <span className="font-mono text-[10.5px]">{inc.key}</span>
                  <span>·</span>
                  <span className="tabular-nums">
                    {epicsDone}/{inc.teamEpics.length} epics
                  </span>
                  {inc.blockedBy.length > 0 && (
                    <span className="truncate text-[var(--ms-warn-text)]">· waits on {inc.blockedBy.join(", ")}</span>
                  )}
                </div>
              </div>
            </li>
          );
        })}
        {more > 0 && <li className="pl-4 text-[12px] text-[var(--ms-label-3)]">and {more} more</li>}
        {release.increments.length === 0 && (
          <li className="text-[13px] text-[var(--ms-label-3)]">No increments scheduled yet.</li>
        )}
      </ul>

      <div className="mt-auto flex items-center pt-5 text-[13px] font-medium text-[var(--ms-accent-text)]">
        Critical path
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="ml-0.5 transition-transform duration-300 group-hover:translate-x-0.5">
          <path d="m6 3.5 4.5 4.5L6 12.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </Link>
  );
}

function WarningList({ warnings }: { warnings: MilestoneWarning[] }) {
  if (warnings.length === 0) return null;
  return (
    <section aria-labelledby="ms-seq">
      <SectionTitle hint={`${warnings.length} found`}>
        <span id="ms-seq">Sequencing issues</span>
      </SectionTitle>
      <Surface>
        <ul className="divide-y divide-[var(--ms-sep)]">
          {warnings.map((w, i) => (
            <li key={i} className="flex items-start gap-2.5 px-4 py-3 text-[13px] text-[var(--ms-label)]">
              <span className="mt-[5px] h-2 w-2 shrink-0 rounded-full bg-[var(--ms-warn)]" aria-hidden="true" />
              {w.message}
            </li>
          ))}
        </ul>
      </Surface>
    </section>
  );
}

export default function ProgramRoadmap({ overview, linkSuffix = "" }: { overview: ProgramOverview; linkSuffix?: string }) {
  const nextIndex = overview.releases.findIndex((r) => !r.released);
  return (
    <div className="flex flex-col gap-10">
      {overview.releases.length === 0 ? (
        <Surface className="px-6 py-10 text-center">
          <div className="text-[15px] font-semibold text-[var(--ms-label)]">No milestones yet</div>
          <p className="mt-1 text-[13px] text-[var(--ms-label-2)]">
            Create one release per milestone in {overview.project.key}, then give each increment a fix version.
          </p>
        </Surface>
      ) : (
        <div className="relative -mx-8">
          {/* The delivery line the stages hang from. */}
          <ol className="flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-px-8 px-8 pb-6 pt-1" aria-label="Milestones in delivery order">
            {overview.releases.map((r, i) => {
              const stage = stageOf(r, i === nextIndex);
              const last = i === overview.releases.length - 1;
              return (
                <li key={r.id} className="ms-fade-up flex flex-col" style={{ animationDelay: `${i * 50}ms` }}>
                  {/* Delivery line: one node per milestone, joined to the next. */}
                  <div aria-hidden="true" className="mb-3 flex h-4 items-center pl-5">
                    <span
                      className={cn(
                        "h-2.5 w-2.5 shrink-0 rounded-full ring-4 ring-[var(--ms-bg)]",
                        stage === "released" && "bg-[var(--ms-ready)]",
                        stage === "overdue" && "bg-[var(--ms-critical)]",
                        stage === "next" && "bg-[var(--ms-accent)]",
                        (stage === "planned" || stage === "empty") && "bg-[var(--ms-sep-strong)]",
                      )}
                    />
                    <span className="ml-2 text-[11px] font-medium tabular-nums text-[var(--ms-label-3)]">
                      {formatDate(r.releaseDate) ?? "No date"}
                    </span>
                    {!last && <span className="-mr-5 ml-3 h-px flex-1 bg-[var(--ms-sep-strong)]" />}
                  </div>
                  <ReleaseStage
                    release={r}
                    stage={stage}
                    href={`/program/${encodeURIComponent(overview.project.key)}/${r.id}${linkSuffix}`}
                  />
                </li>
              );
            })}
          </ol>
        </div>
      )}

      <WarningList warnings={overview.warnings} />

      {overview.unscheduled.length > 0 && (
        <section aria-labelledby="ms-unscheduled">
          <SectionTitle hint="Increments without a fix version">
            <span id="ms-unscheduled">Unscheduled</span>
          </SectionTitle>
          <Surface>
            <ul className="divide-y divide-[var(--ms-sep)]">
              {overview.unscheduled.map((i) => (
                <li key={i.key} className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-[var(--ms-label)]">
                  <StatusDot status={i.status} />
                  <KeyChip issueKey={i.key} />
                  <span className="truncate">{i.summary}</span>
                </li>
              ))}
            </ul>
          </Surface>
        </section>
      )}
    </div>
  );
}
