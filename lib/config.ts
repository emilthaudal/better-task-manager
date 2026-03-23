import fs from "fs";
import path from "path";

const CONFIG_PATH = path.join(process.cwd(), ".jira-config.json");

interface AppConfig {
  beadsReposDir?: string;
}

/** Read the config file from disk. Returns {} if the file doesn't exist or is invalid. */
function readConfig(): AppConfig {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (parsed !== null && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;
      const result: AppConfig = {};
      if (typeof obj.beadsReposDir === "string") {
        result.beadsReposDir = obj.beadsReposDir;
      }
      return result;
    }
    return {};
  } catch {
    return {};
  }
}

// ── Beads repos directory ─────────────────────────────────────────────────────

/**
 * Resolve the beads repos base directory.
 * BEADS_REPOS_BASE_DIR env var takes priority; falls back to config file.
 * Returns null if neither is set.
 */
export function getBeadsReposDir(): string | null {
  const envVal = process.env.BEADS_REPOS_BASE_DIR;
  if (envVal) return envVal;
  return readConfig().beadsReposDir ?? null;
}
