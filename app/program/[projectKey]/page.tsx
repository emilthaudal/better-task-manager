"use client";

import { Suspense, useEffect } from "react";
import { useParams, useSearchParams } from "next/navigation";
import ProgramRoadmap from "@/components/milestone/ProgramRoadmap";
import { ErrorState, Skeleton, Toolbar } from "@/components/milestone/MilestoneChrome";
import { usePolledJson } from "@/hooks/usePolledJson";
import type { ProgramOverview } from "@/lib/milestoneTypes";

function RoadmapSkeleton() {
  return (
    <div role="status" aria-label="Loading milestones" className="flex gap-5">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="flex h-[380px] w-[300px] shrink-0 flex-col gap-3 rounded-2xl bg-[var(--ms-surface)] p-5 shadow-[var(--ms-shadow-card)]">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-3 w-28" />
          <Skeleton className="mt-3 h-1.5 w-full" />
          {Array.from({ length: 4 - (i % 2) }, (_, j) => (
            <Skeleton key={j} className="mt-2 h-8 w-full" />
          ))}
        </div>
      ))}
    </div>
  );
}

function ProgramView() {
  const { projectKey } = useParams<{ projectKey: string }>();
  const fixture = useSearchParams().get("fixture");
  const suffix = fixture ? `?fixture=${encodeURIComponent(fixture)}` : "";
  const { data, loading, refreshing, error, lastUpdated, refresh, retry } = usePolledJson<ProgramOverview>(
    `/api/jira/milestones?project=${encodeURIComponent(projectKey)}${fixture ? `&fixture=${encodeURIComponent(fixture)}` : ""}`,
  );

  useEffect(() => {
    document.title = data ? `${data.project.name} · Milestones` : "Milestones";
  }, [data]);

  return (
    <div className="ms flex h-screen flex-col">
      <Toolbar backHref="/app" backLabel="Projects" lastUpdated={lastUpdated} refreshing={refreshing && !loading} onRefresh={refresh} />
      {error && !data ? (
        <ErrorState message={error} onRetry={retry} backHref="/app" />
      ) : (
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1360px] px-8 pb-16 pt-10">
            <div className="mb-8">
              <div className="text-[13px] font-medium text-[var(--ms-label-3)]">{data?.project.name ?? projectKey}</div>
              <h1 className="text-[32px] font-semibold leading-tight tracking-[-0.025em] text-[var(--ms-label)]">Delivery milestones</h1>
              <p className="mt-1 max-w-2xl text-[14px] text-[var(--ms-label-2)]">
                Releases in delivery order. Open one to see its critical path, the epics that will block other teams, and where each team’s work lands.
              </p>
            </div>
            {loading && !data ? <RoadmapSkeleton /> : data ? <ProgramRoadmap overview={data} linkSuffix={suffix} /> : null}
          </div>
        </main>
      )}
    </div>
  );
}

export default function ProgramPage() {
  return (
    <Suspense fallback={<div className="ms h-screen" />}>
      <ProgramView />
    </Suspense>
  );
}
