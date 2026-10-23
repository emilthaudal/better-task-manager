import { Suspense } from "react";
import ProgramShell from "@/components/milestone/ProgramShell";

// A layout rather than per-page chrome: it stays mounted while moving between
// the program, milestones and team pages, so the sidebar and the data it
// polls survive navigation.
export default function ProgramLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="ms h-screen" />}>
      <ProgramShell>{children}</ProgramShell>
    </Suspense>
  );
}
