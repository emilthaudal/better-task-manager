import { redirect } from "next/navigation";
import EpicPicker from "@/components/EpicPicker";
import ThemeToggle from "@/components/ThemeToggle";
import HomeShell from "@/components/HomeShell";
import { getServerSession, isAuthenticated } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (process.env.JIRA_BYPASS !== "true") {
    const session = await getServerSession();
    if (!isAuthenticated(session)) redirect("/login");
  }

  return (
    <HomeShell
      topBlobColor="#e0e7ff"
      bottomBlobColor="#c7d2fe"
      accentBg="bg-indigo-600"
      accentShadow="shadow-indigo-200 dark:shadow-indigo-900"
      headingHighlight="epic dependencies"
      highlightColor="text-indigo-600"
      controls={
        <>
          <ThemeToggle />
        </>
      }
      picker={<EpicPicker />}
    />
  );
}
