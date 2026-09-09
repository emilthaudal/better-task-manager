import { NextRequest } from "next/server";
import { getEpics, getEpicChildren, getSubtasks } from "@/lib/jira";
import { getAccessToken, getServerSession, persistRotatedToken } from "@/lib/session";
import { pLimit } from "@/lib/concurrency";
import type { StreamMessage } from "@/lib/streamTypes";

// Allow up to 60 seconds on Vercel Pro / similar platforms.
// Streaming responses are not subject to the same hard timeout as regular
// serverless functions, but setting this prevents premature kills.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Timeout (ms) for expanding a single epic's children + subtasks. */
const EPIC_EXPAND_TIMEOUT_MS = 12_000;

/** Max epics expanded concurrently. */
const EXPAND_CONCURRENCY = 5;

function encode(msg: StreamMessage): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(msg) + "\n");
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const project = req.nextUrl.searchParams.get("project");
  if (!project) {
    return new Response(JSON.stringify({ error: "Missing required query param: project" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Resolve the session before entering the ReadableStream constructor —
  // the cookies() API cannot be called from inside a stream callback. Force
  // the access-token refresh (and persist any rotated refresh token) here
  // too, since Atlassian invalidates the old refresh token on rotation and
  // there's no later point in this handler where the cookie can be written.
  const session = await getServerSession();
  if (session.refreshToken) {
    const priorRefreshToken = session.refreshToken;
    try {
      const { refreshToken } = await getAccessToken(session.refreshToken);
      session.refreshToken = refreshToken;
      await persistRotatedToken(session, priorRefreshToken);
    } catch {
      // Let the stream's own getEpics() call surface the auth error as usual.
    }
  }

  let closed = false;

  const stream = new ReadableStream({
    // Set when the client aborts (e.g. a new poll supersedes this stream) —
    // guards every enqueue/close below so we don't throw "Controller is
    // already closed" into the epic-expand loop or the outer catch.
    cancel() {
      closed = true;
    },
    async start(controller) {
      const safeEnqueue = (msg: StreamMessage) => {
        if (closed) return;
        try {
          controller.enqueue(encode(msg));
        } catch {
          closed = true;
        }
      };

      try {
        // ── 1. Fetch all open epics ───────────────────────────────────────────
        const epics = await getEpics(project, session);

        // Send epics immediately so the client can render the graph skeleton
        safeEnqueue({ type: "epics", issues: epics, total: epics.length });

        // ── 2. Expand each epic's children + subtasks (throttled) ─────────────
        let expanded = 0;

        await pLimit(
          epics.map((epic) => async () => {
            const signal = AbortSignal.timeout(EPIC_EXPAND_TIMEOUT_MS);

            try {
              const children = await getEpicChildren(epic.key, session, signal);
              const nonSubtaskKeys = children
                .filter((i) => !i.fields.issuetype.subtask)
                .map((i) => i.key);
              const subtasks = await getSubtasks(nonSubtaskKeys, session, signal);

              expanded++;
              safeEnqueue({
                type: "children",
                epicKey: epic.key,
                issues: [...children, ...subtasks],
                expanded,
                total: epics.length,
              });
            } catch (err) {
              expanded++;
              const isTimeout =
                err instanceof Error &&
                (err.name === "AbortError" || err.name === "TimeoutError");
              const message = isTimeout
                ? `Timed out after ${EPIC_EXPAND_TIMEOUT_MS / 1000}s`
                : err instanceof Error
                  ? err.message
                  : "Unknown error";

              console.warn(`[project-stream] Failed to expand ${epic.key}: ${message}`);
              safeEnqueue({ type: "error", epicKey: epic.key, error: message });
            }
          }),
          EXPAND_CONCURRENCY,
        );

        safeEnqueue({ type: "done" });
      } catch (err) {
        // Top-level failure (e.g. getEpics itself failed) — send an error line
        // then close. The client will treat this as a fatal error.
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error(`[project-stream] Fatal error for project ${project}: ${message}`);
        safeEnqueue({ type: "error", epicKey: "", error: message });
        safeEnqueue({ type: "done" });
      } finally {
        if (!closed) {
          try {
            controller.close();
          } catch {
            // Already closed by the client aborting — nothing to do.
          }
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      // Prevent proxy/CDN buffering — essential for streaming to work
      "X-Accel-Buffering": "no",
      "Cache-Control": "no-cache, no-store",
      "Transfer-Encoding": "chunked",
    },
  });
}
