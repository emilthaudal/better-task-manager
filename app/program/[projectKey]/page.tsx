"use client";

import { useParams } from "next/navigation";
import GraphPageHeader from "@/components/GraphPageHeader";
import ProgramRoadmap from "@/components/milestone/ProgramRoadmap";
import { GraphErrorState, GraphLoadingState } from "@/components/GraphStates";
import { usePolledJson } from "@/hooks/usePolledJson";
import type { ProgramOverview } from "@/lib/milestoneTypes";

export default function ProgramPage() {
  const { projectKey } = useParams<{ projectKey: string }>();
  const { data, loading, error, lastUpdated } = usePolledJson<ProgramOverview>(
    `/api/jira/milestones?project=${encodeURIComponent(projectKey)}`,
  );

  return (
    <div className="flex h-screen flex-col bg-muted/30">
      <GraphPageHeader
        chipKey={projectKey}
        chipLabel={data ? `${data.project.name} · Milestones` : "Milestones"}
        lastUpdated={lastUpdated}
        loading={loading}
        error={error}
      />
      <main className="relative flex-1 overflow-auto px-8 py-8">
        {loading && !data ? (
          <GraphLoadingState />
        ) : error && !data ? (
          <GraphErrorState message={error} backHref="/app" />
        ) : data ? (
          <div className="mx-auto max-w-7xl">
            <h1 className="mb-1 text-2xl font-bold tracking-tight text-foreground">Delivery milestones</h1>
            <p className="mb-6 text-sm text-muted-foreground">
              Releases in {data.project.name}, in delivery order. Open one to see its critical path and blockers.
            </p>
            <ProgramRoadmap overview={data} />
          </div>
        ) : null}
      </main>
    </div>
  );
}
