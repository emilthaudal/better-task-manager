import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { promises as fs } from "fs";
import path from "path";
import { beadsIssuesToJiraIssues } from "@/lib/beads";
import type { BeadsIssue } from "@/lib/beads";
import { getBeadsReposDir } from "@/lib/config";

const execAsync = promisify(exec);

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const repoSlug = searchParams.get("repo");

  if (!repoSlug) {
    return NextResponse.json({ error: "Missing required query param: repo" }, { status: 400 });
  }

  const rawDir = getBeadsReposDir();
  if (!rawDir) {
    return NextResponse.json(
      {
        error:
          "Beads repos directory is not configured. Visit /settings to set it up.",
      },
      { status: 503 },
    );
  }

  // Expand ~ and resolve the repo path from the slug (directory name)
  const baseDir = rawDir.replace(/^~/, process.env.HOME ?? "");
  const repoPath = path.join(baseDir, repoSlug);

  // Safety check: ensure the resolved path is actually inside baseDir
  // (prevents path traversal via crafted slugs)
  const resolvedRepo = path.resolve(repoPath);
  const resolvedBase = path.resolve(baseDir);
  if (!resolvedRepo.startsWith(resolvedBase + path.sep) && resolvedRepo !== resolvedBase) {
    return NextResponse.json({ error: "Invalid repo slug" }, { status: 400 });
  }

  // Verify .beads directory exists in the repo
  const beadsDir = path.join(resolvedRepo, ".beads");
  try {
    await fs.stat(beadsDir);
  } catch {
    return NextResponse.json(
      { error: `No .beads directory found at ${resolvedRepo}` },
      { status: 404 },
    );
  }

  // Run bd list separately for each active status to avoid a bd 0.59.x bug
  // where --all and --status=closed ignore the --json flag and emit plain text.
  const execOpts = { cwd: resolvedRepo, timeout: 30_000, env: { ...process.env } };

  async function listByStatus(status: string): Promise<BeadsIssue[]> {
    let stdout: string;
    try {
      ({ stdout } = await execAsync(`bd list --status=${status} --json`, execOpts));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      throw new Error(`Failed to run bd list --status=${status} in ${resolvedRepo}: ${message}`);
    }
    const trimmed = stdout.trim();
    if (!trimmed || trimmed === "No issues found.") return [];
    try {
      return JSON.parse(trimmed) as BeadsIssue[];
    } catch {
      throw new Error(`Failed to parse bd list --status=${status} output as JSON`);
    }
  }

  let activeIssues: BeadsIssue[];
  try {
    const [open, inProgress] = await Promise.all([
      listByStatus("open"),
      listByStatus("in_progress"),
    ]);
    activeIssues = [...open, ...inProgress];
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  // Adapt to JiraIssue shape
  const jiraIssues = beadsIssuesToJiraIssues(activeIssues);

  return NextResponse.json(jiraIssues);
}
