"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ProgramRoadmap from "@/components/milestone/ProgramRoadmap";
import { ErrorState, Skeleton, Toolbar } from "@/components/milestone/MilestoneChrome";
import { isTyping } from "@/components/milestone/MilestoneWorkspace";
import { lastViewedMilestone, useProgram } from "@/components/milestone/ProgramShell";
import { landingMilestone } from "@/lib/milestoneInsights";

function RoadmapSkeleton() {
  return (
    <div role="status" aria-label="Loading milestones" className="flex flex-col gap-7">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-80" />
        <div className="flex gap-2.5">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-[68px] w-[130px] rounded-xl" />
          ))}
        </div>
      </div>
      {Array.from({ length: 2 }, (_, i) => (
        <div key={i} className="flex gap-5">
          <Skeleton className="h-[34px] w-[34px] rounded-full" />
          <div className="flex flex-1 flex-col gap-3">
            <Skeleton className="h-6 w-56" />
            <Skeleton className="h-2 w-72" />
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
              {Array.from({ length: 3 }, (_, j) => (
                <Skeleton key={j} className="h-[150px] rounded-[14px]" />
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ProgramView() {
  const { program, projectKey, href, jiraBaseUrl } = useProgram();
  const { data, loading, error, retry } = program;
  const router = useRouter();
  const land = useSearchParams().get("land") === "1";
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  // Entering from the projects page lands on the last milestone viewed, else
  // the next one to ship — that's the one being planned.
  useEffect(() => {
    if (!land || !data) return;
    const target = landingMilestone(data, lastViewedMilestone(projectKey));
    router.replace(target ? href.milestone(target) : href.program);
  }, [land, data, projectKey, router, href]);

  useEffect(() => {
    document.title = data ? `${data.project.name} · Delivery program` : "Delivery program";
  }, [data]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && (e.key === "f" || e.key === "k")) || (e.key === "/" && !isTyping(e.target))) {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <Toolbar
        title="Program overview"
        subtitle={data?.project.name ?? projectKey}
        trailing={
          data && (
            <div className="relative mr-1 hidden items-center sm:flex">
              <svg className="pointer-events-none absolute left-2 text-[var(--ms-label-3)]" width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <circle cx="7" cy="7" r="4.75" stroke="currentColor" strokeWidth="1.6" />
                <path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    if (query) setQuery("");
                    else e.currentTarget.blur();
                  }
                }}
                placeholder="Filter increments"
                aria-label="Filter increments"
                className="h-7 w-[200px] rounded-md bg-[var(--ms-fill)] pl-7 pr-2 text-[12.5px] text-[var(--ms-label)] outline-none placeholder:text-[var(--ms-label-3)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--ms-accent)_35%,transparent)] [&::-webkit-search-cancel-button]:hidden"
              />
            </div>
          )
        }
      />
      {error && !data ? (
        <ErrorState message={error} onRetry={retry} what="the delivery program" projectKey={projectKey} />
      ) : (
        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1180px] px-6 pb-16 pt-7 sm:px-8">
            {(loading && !data) || (land && data) ? (
              <RoadmapSkeleton />
            ) : data ? (
              <ProgramRoadmap overview={data} query={query} onQueryChange={setQuery} milestoneHref={href.milestone} jiraBaseUrl={jiraBaseUrl} />
            ) : null}
          </div>
        </main>
      )}
    </>
  );
}

export default function ProgramPage() {
  return (
    <Suspense fallback={null}>
      <ProgramView />
    </Suspense>
  );
}
