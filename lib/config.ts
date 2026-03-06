import fs from "fs";
import path from "path";

const CONFIG_PATH = path.join(process.cwd(), ".jira-config.json");

export interface JiraConfig {
  baseUrl: string;
  email: string;
  apiToken: string;
}

export interface AppConfig {
  jira?: JiraConfig;
  beadsReposDir?: string;
}

// ── Raw file I/O ─────────────────────────────────────────────────────────────

/** Read the full config file from disk. Returns {} if the file doesn't exist or is invalid. */
export function readConfig(): AppConfig {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (parsed !== null && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;

      const result: AppConfig = {};

      // Parse jira section — support legacy flat format (pre-beads) where
      // baseUrl/email/apiToken were at the top level.
      const jira = obj.jira;
      if (jira && typeof jira === "object") {
        const j = jira as Record<string, unknown>;
        if (
          typeof j.baseUrl === "string" &&
          typeof j.email === "string" &&
          typeof j.apiToken === "string"
        ) {
          result.jira = { baseUrl: j.baseUrl, email: j.email, apiToken: j.apiToken };
        }
      } else if (
        typeof obj.baseUrl === "string" &&
        typeof obj.email === "string" &&
        typeof obj.apiToken === "string"
      ) {
        // Legacy flat format — migrate on next write
        result.jira = { baseUrl: obj.baseUrl, email: obj.email, apiToken: obj.apiToken };
      }

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

/** Write config to disk. Merges with existing file so sections are independent. */
export function writeConfig(update: Partial<AppConfig>): void {
  const existing = readConfig();
  const merged: AppConfig = {
    ...existing,
    ...update,
    // Deep merge jira section
    jira: update.jira !== undefined ? update.jira : existing.jira,
  };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2), "utf-8");
}

// ── Jira credentials ─────────────────────────────────────────────────────────

/**
 * Resolve the active Jira credentials. Environment variables always take
 * precedence over the config file, so existing .env.local setups are unaffected.
 */
export function getCredentials(): JiraConfig | null {
  const baseUrl = process.env.JIRA_BASE_URL;
  const email = process.env.JIRA_EMAIL;
  const apiToken = process.env.JIRA_API_TOKEN;

  // If all three env vars are set, use them.
  if (baseUrl && email && apiToken) {
    return { baseUrl, email, apiToken };
  }

  // Fall back to the config file.
  const fileConfig = readConfig().jira;
  if (fileConfig) {
    return {
      baseUrl: baseUrl ?? fileConfig.baseUrl,
      email: email ?? fileConfig.email,
      apiToken: apiToken ?? fileConfig.apiToken,
    };
  }

  return null;
}

/**
 * Returns which source the Jira credentials came from for display purposes.
 * "env"  — all three came from environment variables.
 * "file" — the config file was used (possibly with partial env overrides).
 * "none" — no credentials are configured.
 */
export function getCredentialSource(): "env" | "file" | "none" {
  const allEnv =
    !!process.env.JIRA_BASE_URL && !!process.env.JIRA_EMAIL && !!process.env.JIRA_API_TOKEN;
  if (allEnv) return "env";

  if (readConfig().jira) return "file";

  return "none";
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

/**
 * Returns which source the beads repos dir came from.
 * "env"  — set via BEADS_REPOS_BASE_DIR environment variable.
 * "file" — set in the config file.
 * "none" — not configured.
 */
export function getBeadsReposDirSource(): "env" | "file" | "none" {
  if (process.env.BEADS_REPOS_BASE_DIR) return "env";
  if (readConfig().beadsReposDir) return "file";
  return "none";
}
