import { NextResponse } from "next/server";
import {
  getCredentials,
  getCredentialSource,
  getBeadsReposDir,
  getBeadsReposDirSource,
  writeConfig,
} from "@/lib/config";
import type { JiraConfig } from "@/lib/config";

export interface MaskedConfig {
  baseUrl: string;
  email: string;
  /** Last 4 chars of the token, prefixed with bullets. Empty string if not set. */
  apiTokenMasked: string;
  /** Whether there is a real token saved (to distinguish empty vs masked). */
  hasApiToken: boolean;
  jiraSource: "env" | "file" | "none";
  beadsReposDir: string;
  beadsSource: "env" | "file" | "none";
}

function maskToken(token: string): string {
  if (!token) return "";
  const tail = token.slice(-4);
  return `••••••••${tail}`;
}

function toMasked(
  jira: JiraConfig | null,
  jiraSource: "env" | "file" | "none",
  beadsReposDir: string | null,
  beadsSource: "env" | "file" | "none",
): MaskedConfig {
  return {
    baseUrl: jira?.baseUrl ?? "",
    email: jira?.email ?? "",
    apiTokenMasked: jira?.apiToken ? maskToken(jira.apiToken) : "",
    hasApiToken: !!jira?.apiToken,
    jiraSource,
    beadsReposDir: beadsReposDir ?? "",
    beadsSource,
  };
}

/** GET /api/config — return masked current configuration */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    toMasked(
      getCredentials(),
      getCredentialSource(),
      getBeadsReposDir(),
      getBeadsReposDirSource(),
    ),
  );
}

/** POST /api/config — save configuration to .jira-config.json */
export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Body must be a JSON object." }, { status: 400 });
  }

  const obj = body as Record<string, unknown>;

  // Determine which section(s) are being updated based on what keys are present.
  const updatingJira =
    "baseUrl" in obj || "email" in obj || "apiToken" in obj;
  const updatingBeads = "beadsReposDir" in obj;

  if (!updatingJira && !updatingBeads) {
    return NextResponse.json({ error: "No recognised fields to update." }, { status: 400 });
  }

  if (updatingJira) {
    if (
      typeof obj.baseUrl !== "string" ||
      typeof obj.email !== "string" ||
      typeof obj.apiToken !== "string"
    ) {
      return NextResponse.json(
        { error: "Jira update requires baseUrl, email, and apiToken as strings." },
        { status: 400 },
      );
    }
    if (!obj.baseUrl.trim() || !obj.email.trim() || !obj.apiToken.trim()) {
      return NextResponse.json(
        { error: "baseUrl, email, and apiToken must not be empty." },
        { status: 400 },
      );
    }
  }

  if (updatingBeads && typeof obj.beadsReposDir !== "string") {
    return NextResponse.json({ error: "beadsReposDir must be a string." }, { status: 400 });
  }

  try {
    writeConfig({
      ...(updatingJira && {
        jira: {
          baseUrl: (obj.baseUrl as string).replace(/\/+$/, ""),
          email: (obj.email as string).trim(),
          apiToken: (obj.apiToken as string).trim(),
        },
      }),
      ...(updatingBeads && {
        beadsReposDir: (obj.beadsReposDir as string).trim(),
      }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Failed to save config: ${message}` }, { status: 500 });
  }

  return NextResponse.json(
    toMasked(
      getCredentials(),
      getCredentialSource(),
      getBeadsReposDir(),
      getBeadsReposDirSource(),
    ),
    { status: 200 },
  );
}
