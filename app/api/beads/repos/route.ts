import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import type { BeadsRepo } from "@/lib/beads";
import { getBeadsReposDir } from "@/lib/config";

export async function GET(): Promise<NextResponse> {
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

  // Expand ~ to the home directory
  const baseDir = rawDir.replace(/^~/, process.env.HOME ?? "");

  let entries: string[];
  try {
    entries = await fs.readdir(baseDir);
  } catch {
    return NextResponse.json(
      { error: `Cannot read BEADS_REPOS_BASE_DIR: ${baseDir}` },
      { status: 500 },
    );
  }

  const repos: BeadsRepo[] = [];

  await Promise.all(
    entries.map(async (entry) => {
      const repoPath = path.join(baseDir, entry);
      const beadsPath = path.join(repoPath, ".beads");
      try {
        const [repoStat, beadsStat] = await Promise.all([
          fs.stat(repoPath),
          fs.stat(beadsPath),
        ]);
        if (repoStat.isDirectory() && beadsStat.isDirectory()) {
          repos.push({ name: entry, path: repoPath });
        }
      } catch {
        // Either entry is not a directory or .beads doesn't exist — skip
      }
    }),
  );

  // Sort alphabetically by name
  repos.sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json(repos);
}
